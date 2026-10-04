import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Group, Modal, Paper, ScrollArea, Table, Text } from '@mantine/core';
import { PageHeader } from '@/components/PageHeader';
import { bridge } from '@/bridge';
import { useDamages, useMembers, useObjects, useSheets } from '@/hooks/useSupabase';
import { CALLOUT_SPEC, type CalloutBox } from '@/lib/badgeCallout';
import type { DamageWithDetails, SheetRow } from '@/types/db';
import { sheetSvgUrl } from '@/lib/siteUrl';
// AASHTO
import { DamageRowDetail } from '@/components/aashto/DamageRowDetail';
import { DefectLegend } from '@/components/aashto/legends';
import { QuantityTable } from '@/components/aashto/QuantityTable';
import type { AashtoDamageRow } from '@/components/aashto/rows';
import { AashtoSheetMarks } from '@/components/aashto/SheetMarks';
import { useAashtoData } from '@/components/aashto/useAashtoData';
import { SEval } from '@/i18n/s.eval';
import { defectSymbol } from '@/lib/eval/aashto';

// ------------------------------------------------------------------
//  /drawings: inspection sheets (the database sheets rows)
//  Clicking a row opens the same 2D viewer as the sheet screen of the tablet app:
//  the sheet SVG + the damages drawn on the tablet (strokes, area patterns, numbered badges) + the quantity table on the right.
//  Every rendered size is **fixed in sheet mm**; the reference for the numbered badge callout is @/lib/badgeCallout
//  (the same rules as the tablet app's implementation).
//
//  Sheets are grouped under a **zone_type (sheet family) heading row** that can be
//  collapsed and expanded, so a long list stays navigable.
// ------------------------------------------------------------------

const LINE = '1px solid var(--mantine-color-gray-3)';

/**
 * Groups the sheet list by zone_type.
 * In sort_no order sheets of one family are always consecutive, so run-length grouping is enough.
 * Should a family ever appear scattered, it would only show up as two groups;
 * no row would be lost.
 */
function groupByZone(sheets: SheetRow[]): Array<{ key: string; zone: string; rows: SheetRow[] }> {
  const groups: Array<{ key: string; zone: string; rows: SheetRow[] }> = [];
  for (const s of sheets) {
    const zone = s.zone_type ?? 'Unclassified';
    const last = groups[groups.length - 1];
    if (last && last.zone === zone) last.rows.push(s);
    else groups.push({ key: `${zone}#${groups.length}`, zone, rows: [s] });
  }
  return groups;
}

/* Canvas-normalized to canvas mm coordinates (applies the view placement) */
function makeToCanvas(
  sheet: SheetRow,
  view: { placement: [number, number, number, number] },
) {
  const [cw, ch] = sheet.zone_spec?.canvas_mm ?? CALLOUT_SPEC.fallbackCanvasMm;
  const [px, py, pw, ph] = view.placement;
  return (u: number, v: number): [number, number] => [
    (px + u * pw) * cw,
    (py + v * ph) * ch,
  ];
}

interface OverlayItem {
  key: string;
  no: number;
  kind: 'path' | 'point' | 'rect';
  pts: Array<[number, number]>;
  closed: boolean;
  /* Marker box (mm), the anchor for the badge. As on the tablet: the path bbox, at least 4.9x4.9 */
  box: CalloutBox;
}

/* Computes the damage overlay items of one sheet (marker number = seq ?? list order) */
function overlayItems(sheet: SheetRow, damages: DamageWithDetails[]): OverlayItem[] {
  const views = sheet.zone_spec?.views ?? [];
  const items: OverlayItem[] = [];
  damages.forEach((d, i) => {
    const sp = d.position?.sheet;
    if (!sp?.view) return;
    const view = views.find((v) => v.id === sp.view);
    if (!view) return;
    const to = makeToCanvas(sheet, view);
    const no = d.position?.seq ?? i + 1;

    let kind: OverlayItem['kind'];
    let pts: Array<[number, number]> = [];
    if (sp.rect && sp.rect.length >= 4) {
      kind = 'rect';
      pts = [to(sp.rect[0], sp.rect[1]), to(sp.rect[2], sp.rect[3])];
    } else if (sp.path && sp.path.length > 1) {
      kind = 'path';
      pts = sp.path.map(([u, v]) => to(u, v));
    } else if (sp.u != null && sp.v != null) {
      kind = 'point';
      pts = [to(sp.u, sp.v)];
    } else return;

    // Marker box: the path bbox, at least 4.9x4.9 mm (a point is a 14px circle = a 4.9 mm box)
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    let bx = Math.min(...xs);
    let by = Math.min(...ys);
    let bw = Math.max(...xs) - bx;
    let bh = Math.max(...ys) - by;
    if (kind === 'rect') {
      // Legacy data: at least 5.6x4.2 mm (16x12 px on the tablet)
      if (bw < 5.6) { bx -= (5.6 - bw) / 2; bw = 5.6; }
      if (bh < 4.2) { by -= (4.2 - bh) / 2; bh = 4.2; }
    } else {
      if (bw < 4.9) { bx -= (4.9 - bw) / 2; bw = 4.9; }
      if (bh < 4.9) { by -= (4.9 - bh) / 2; bh = 4.9; }
    }

    items.push({
      key: d.id,
      no,
      kind,
      pts,
      closed: sp.closed === true || d.shape_kind === 'polygon',
      box: { x: bx, y: by, w: bw, h: bh },
    });
  });
  return items;
}

export function Dashboard() {
  const sheetsSnap = useSheets();
  const membersSnap = useMembers();
  const damagesSnap = useDamages();
  const objectsSnap = useObjects(); // to resolve the member each damage belongs to (damages.object_id to objects)
  // AASHTO — damages are drawn by element and condition state.
  const aashto = useAashtoData(objectsSnap, damagesSnap);

  const loading = sheetsSnap.loading || membersSnap.loading;
  const error = sheetsSnap.error ?? membersSnap.error;
  const memberName = useMemo(
    () => new Map(membersSnap.data.map((m) => [m.id, m.name])),
    [membersSnap.data],
  );

  /* Damage count per sheet (list badge) */
  const damageCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of damagesSnap.data) {
      if (!d.sheet_id) continue;
      m.set(d.sheet_id, (m.get(d.sheet_id) ?? 0) + 1);
    }
    return m;
  }, [damagesSnap.data]);

  /* Family groups + collapsed state (all expanded by default; nothing is hidden by surprise) */
  const zoneGroups = useMemo(
    () => groupByZone(sheetsSnap.data),
    [sheetsSnap.data],
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleZone = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);

  const [openSheet, setOpenSheet] = useState<SheetRow | null>(null);

  // The existing-sheets hint of the sheet proposal screen links here as `/drawings?sheet=<sheet_id>`:
  // once the sheet list arrives that row is opened exactly once (after that the user closes and opens freely).
  const [searchParams] = useSearchParams();
  const wantSheetId = searchParams.get('sheet');
  const openedFromQuery = useRef(false);
  useEffect(() => {
    if (openedFromQuery.current || !wantSheetId || sheetsSnap.data.length === 0) return;
    openedFromQuery.current = true;
    const hit = sheetsSnap.data.find((s) => s.zone_spec?.sheet_id === wantSheetId);
    if (hit) setOpenSheet(hit);
  }, [wantSheetId, sheetsSnap.data]);

  const openDamages = useMemo(
    () =>
      openSheet
        ? damagesSnap.data
            .filter((d) => d.sheet_id === openSheet.id)
            .sort(
              (a, b) => (a.position?.seq ?? 1e9) - (b.position?.seq ?? 1e9),
            )
        : [],
    [openSheet, damagesSnap.data],
  );
  const overlay = useMemo(
    () => (openSheet ? overlayItems(openSheet, openDamages) : []),
    [openSheet, openDamages],
  );
  // Sheet SVG: the file name is the database zone_spec.svg, the folder comes from the bridge profile (/sheets-beechwood/)
  const svgUrl = openSheet?.zone_spec?.svg
    ? sheetSvgUrl(openSheet.zone_spec.svg, bridge.sheetsBase)
    : null;
  const [cw, ch] = openSheet?.zone_spec?.canvas_mm ?? CALLOUT_SPEC.fallbackCanvasMm;
  const qtyFontMm = 2.0; // quantity table text (2.0 x sy on the tablet; unchanged here because the coordinates are mm)
  // AASHTO — the active damages (latest observation) of this sheet and the defect symbols they use.
  const aashtoSheetRows: AashtoDamageRow[] =
    openSheet
      ? aashto.rows.filter((r) => r.sheetId === openSheet.id).sort((a, b) => (a.no ?? 1e9) - (b.no ?? 1e9))
      : [];
  const usedSymbols = [...new Set(aashtoSheetRows.map((r) => defectSymbol(r.defectNo)))];
  // Opened row of the sheet damage table: the damage behind a table row (photos + key facts).
  const damageById = useMemo(() => new Map(damagesSnap.data.map((d) => [d.id, d])), [damagesSnap.data]);
  // While an enlarged photo is open the sheet modal ignores Esc, so that Esc closes the photo only.
  const [photoOpen, setPhotoOpen] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <PageHeader
        title="Damage Map"
        subtitle="Damage map sheets by member — click a family header row to collapse it; click a sheet row to see the same 2D damage map and damages as in the mobile app"
        right={
          <Text size="xs" c="dimmed" className="tnum">
            {loading
              ? 'Loading…'
              : `${zoneGroups.length} families · ${sheetsSnap.data.length} sheets`}
          </Text>
        }
      />

      <ScrollArea style={{ flex: 1, minHeight: 0 }}>
        <div style={{ padding: '24px 28px' }}>
          <Paper withBorder>
            <Text
              fz={13}
              fw={600}
              px={20}
              py={12}
              bg="var(--mantine-color-gray-0)"
              style={{ borderBottom: LINE }}
            >
              Map Sheets
            </Text>

            <Table.ScrollContainer minWidth={560}>
              <Table
                fz={13}
                verticalSpacing={12}
                horizontalSpacing={20}
                highlightOnHover
              >
                <Table.Thead bg="var(--mantine-color-gray-0)">
                  <Table.Tr>
                    <Table.Th w="10%" fz={12} fw={600} c="gray.7">
                      No.
                    </Table.Th>
                    <Table.Th w="50%" fz={12} fw={600} c="gray.7">
                      Sheet Title
                    </Table.Th>
                    <Table.Th w="24%" fz={12} fw={600} c="gray.7">
                      Member
                    </Table.Th>
                    <Table.Th w="16%" fz={12} fw={600} c="gray.7" ta="right">
                      Damages
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {error ? (
                    <Empty message="Could not load data." />
                  ) : loading ? (
                    <Empty message="Loading…" />
                  ) : sheetsSnap.data.length === 0 ? (
                    <Empty message="No damage map sheets registered." />
                  ) : (
                    zoneGroups.map((g) => {
                      const open = !collapsed.has(g.key);
                      const gDamages = g.rows.reduce(
                        (sum, r) => sum + (damageCount.get(r.id) ?? 0),
                        0,
                      );
                      return (
                        <Fragment key={g.key}>
                          {/* Family heading row: clicking collapses just that family */}
                          <Table.Tr
                            onClick={() => toggleZone(g.key)}
                            bg="var(--mantine-color-gray-0)"
                            style={{ cursor: 'pointer' }}
                          >
                            <Table.Td colSpan={3} style={{ borderTop: LINE }}>
                              <Group gap={8}>
                                <Text fz={11} c="gray.6" w={10} ta="center">
                                  {open ? '▾' : '▸'}
                                </Text>
                                <Text fz={12.5} fw={700}>
                                  {bridge.texts.familyName(g.zone)}
                                </Text>
                                <Text fz={11.5} c="dimmed" className="tnum">
                                  {`${g.rows.length} sheets`}
                                </Text>
                              </Group>
                            </Table.Td>
                            <Table.Td ta="right" style={{ borderTop: LINE }}>
                              {gDamages > 0 ? (
                                <Text fz={11.5} c="red.7" fw={600} className="tnum">
                                  {gDamages}
                                </Text>
                              ) : null}
                            </Table.Td>
                          </Table.Tr>

                          {open
                            ? g.rows.map((row: SheetRow) => {
                                const n = damageCount.get(row.id) ?? 0;
                                return (
                                  <Table.Tr
                                    key={row.id}
                                    onClick={() => setOpenSheet(row)}
                                    style={{ cursor: 'pointer' }}
                                  >
                                    <Table.Td className="tnum" c="gray.7">
                                      {row.sort_no ?? '—'}
                                    </Table.Td>
                                    <Table.Td>
                                      <Text fz={13} fw={500} pl={18}>
                                        {row.title}
                                      </Text>
                                    </Table.Td>
                                    <Table.Td c="gray.7">
                                      {row.member_id != null
                                        ? (memberName.get(row.member_id) ?? '—')
                                        : '—'}
                                    </Table.Td>
                                    <Table.Td ta="right">
                                      {n > 0 ? (
                                        <Badge
                                          size="sm"
                                          variant="light"
                                          color="red"
                                          className="tnum"
                                        >
                                          {n}
                                        </Badge>
                                      ) : (
                                        <Text fz={12} c="dimmed">
                                          —
                                        </Text>
                                      )}
                                    </Table.Td>
                                  </Table.Tr>
                                );
                              })
                            : null}
                        </Fragment>
                      );
                    })
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        </div>
      </ScrollArea>

      {/* -- Sheet viewer modal: the same rendering as the sheet screen of the tablet app ---------- */}
      <Modal
        opened={openSheet != null}
        onClose={() => setOpenSheet(null)}
        closeOnEscape={!photoOpen}
        size="90%"
        transitionProps={{ duration: 0 }}
        title={
          <Group gap={10}>
            <Text fw={700} fz={14}>
              {openSheet ? openSheet.title : null}
            </Text>
            <Text fz={12} c="dimmed" className="tnum">
              {`No.${openSheet?.sort_no ?? '—'} · ${openDamages.length} damages`}
            </Text>
          </Group>
        }
      >
        {svgUrl ? (
          <div style={{ position: 'relative', border: LINE }}>
            <img
              src={svgUrl}
              alt={openSheet?.title ?? ''}
              style={{ display: 'block', width: '100%', height: 'auto' }}
            />
            {/* Damage + quantity table overlay, in canvas mm coordinates (the same transforms as the tablet app) */}
            <svg
              viewBox={`0 0 ${cw} ${ch}`}
              preserveAspectRatio="none"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                overflow: 'visible',
              }}
            >
              {/* AASHTO: defect glyphs (the printed LEGEND shapes) in condition state colors + the element quantity table fill (paper scale A3, A1) */}
              <AashtoSheetMarks overlay={overlay} rows={aashtoSheetRows} cw={cw} ch={ch} fontMm={qtyFontMm} />
            </svg>
          </div>
        ) : (
          <Text fz={13} c="dimmed" py={24} ta="center">
            No SVG path is registered for this sheet.
          </Text>
        )}

        {/* AASHTO: defect glyph legend + damage list with the columns of the printed table (with object codes); a row opens to its photos and key facts */}
        {usedSymbols.length > 0 ? <DefectLegend symbols={usedSymbols} /> : null}
        {aashtoSheetRows.length > 0 ? (
          <div style={{ marginTop: 12, border: LINE }}>
            <QuantityTable
              key={openSheet?.id}
              groups={[{ key: 'sheet', label: SEval.drawings.damagesTitle, rows: aashtoSheetRows }]}
              showObject
              detail={(r) => {
                const d = damageById.get(r.id);
                return d ? <DamageRowDetail damage={d} objectCode={r.objectCode} onLightboxChange={setPhotoOpen} /> : null;
              }}
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <Table.Tr>
      <Table.Td colSpan={4}>
        <Text fz={12.5} c="dimmed" ta="center" py={48}>
          {message}
        </Text>
      </Table.Td>
    </Table.Tr>
  );
}
