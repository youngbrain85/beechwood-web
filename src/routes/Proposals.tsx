import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Group, Paper, ScrollArea, Stack, Text, TextInput } from '@mantine/core';
import { PageHeader } from '@/components/PageHeader';
import { CandidateCard } from '@/components/proposal/CandidateCard';
import { CandidatePreview } from '@/components/proposal/CandidatePreview';
import { ExistingSheets, useCoveringSheets } from '@/components/proposal/ExistingSheets';
import { MemberTreePanel } from '@/components/proposal/MemberTreePanel';
import { ProposalList } from '@/components/proposal/ProposalList';
import { RangePanel } from '@/components/proposal/RangePanel';
import { SelectViewer, type SelectionInfo } from '@/components/proposal/SelectViewer';
import { SelectionChips } from '@/components/proposal/SelectionChips';
import { useFrameAssets } from '@/components/proposal/useFrameAssets';
import { useProposalEngine } from '@/hooks/useProposalEngine';
import {
  adoptZone,
  canAdopt,
  discardProposal,
  fetchProposalDrawing,
  saveProposal,
  useSheetProposals,
} from '@/hooks/useProposals';
import { useBridgeSections, useSheets } from '@/hooks/useSupabase';
import { bridge } from '@/bridge';
import { composeSheetSvg, isComposableSpec, type FrameKind } from '@/lib/proposal/compose';
import type { Candidate, EngineInput, ProposalSpec } from '@/lib/proposal/engine';
import { naturalCompare, shouldFollowSuggestion, uniqueTitle } from '@/lib/proposal/title';
import type { ClipBox, CompositionKey, MeshInput, Vec3 } from '@/lib/proposal/types';
import { NO_CLIP } from '@/lib/proposal/types';
import type { SheetProposalRow } from '@/types/db';
import { SProposal } from '@/i18n/s.proposal';

// ------------------------------------------------------------------
//  Sheet proposals: choosing a part produces 2D inspection sheet candidates, and adopting one
//  saves it as a proposal (sheet_proposals).
//
//  Left: 3D selection view + member tree + range.  Right: existing sheets hint,
//  candidate cards, large preview, title/note/adopt, saved proposal list.
//  On a narrow screen (under about 1050px) left and right stack vertically.
//
//  All heavy work lives elsewhere: candidates in a worker (useProposalEngine), the existing sheets
//  hint in useCoveringSheets, sheet composition in lib/proposal/compose.ts. This file
//  only holds state and wiring.
// ------------------------------------------------------------------

/* Replaces characters that cannot be used in a file name with underscores. */
const safeFileName = (title: string): string => title.replace(/[\\/:*?"<>|]/g, '_');

/* Did the database reject the row on the title uniqueness constraint; PostgREST sends the code and the text in one message. */
const isDuplicateTitle = (message: string): boolean =>
  message.includes('duplicate key') || message.includes('23505');

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function Proposals() {
  // ---- Selection ----
  const [selected, setSelected] = useState<string[]>([]);
  const [clip, setClip] = useState<ClipBox>(NO_CLIP);
  const [meshes, setMeshes] = useState<MeshInput[]>([]);
  const [bounds, setBounds] = useState<{ min: Vec3; max: Vec3 } | null>(null);
  const [selInfo, setSelInfo] = useState<SelectionInfo>({ triangles: 0, tooLarge: false });
  const [objectIds, setObjectIds] = useState<string[]>([]);

  // ---- Candidates and title ----
  const [activeKey, setActiveKey] = useState<CompositionKey | null>(null);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [note, setNote] = useState('');

  // ---- Saved proposals ----
  const [listOpen, setListOpen] = useState(false);
  const [opened, setOpened] = useState<{ row: SheetProposalRow; drawing: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const sheets = useSheets();
  const sections = useBridgeSections();
  const proposals = useSheetProposals();

  // Prevents state updates after unmount (set back to true on a StrictMode double mount).
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // ---- Handover from the 3D view: `?ids=` is read only once ----
  const [params] = useSearchParams();
  const idsRead = useRef(false);
  useEffect(() => {
    if (idsRead.current) return;
    idsRead.current = true;
    const ids = (params.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return;
    setSelected(ids);
  }, [params]);

  const onMeshes = useCallback(
    (next: MeshInput[], nextBounds: { min: Vec3; max: Vec3 } | null, info: SelectionInfo) => {
      setMeshes(next);
      setBounds(nextBounds);
      setSelInfo(info);
    },
    [],
  );

  // ---- Engine: the input reference must be stable or the debounce restarts forever (see the hook header) ----
  const engineInput = useMemo<EngineInput | null>(
    // The code order shows up in the title (a stored value), so the same natural order as the title is used (_9 < _10).
    () => (meshes.length === 0 ? null : { meshes, clip, objectCodes: [...selected].sort(naturalCompare) }),
    [meshes, clip, selected],
  );
  const engine = useProposalEngine(engineInput);
  // This screen already holds the sheet list (also used for the title uniqueness check); it is passed to the hook so it is not fetched twice.
  const covering = useCoveringSheets(meshes, clip, sheets.data);

  // When the candidates change the chosen composition is kept, or the first candidate when it is gone.
  useEffect(() => {
    setActiveKey((k) =>
      k && engine.candidates.some((c) => c.key === k) ? k : engine.candidates[0]?.key ?? null,
    );
  }, [engine.candidates]);
  const active: Candidate | null = useMemo(
    () => engine.candidates.find((c) => c.key === activeKey) ?? null,
    [engine.candidates, activeKey],
  );

  // ---- Sheet frames (fetched once per kind) ----
  // The frame kind is chosen from **the range the candidate actually draws**, which must equal the value the
  // KEY PLAN hatch of composeSheetSvg reads. Choosing from the selection range before cutting could make the
  // frame and the hatch disagree for a cut selection. (Without a candidate yet, the selection range is used.)
  // Deciding the kind is up to the bridge profile.
  const candidateBounds = active?.spec.zone.bounds ?? bounds;
  const candidateKind: FrameKind | null = candidateBounds ? bridge.frames.kindFor(candidateBounds) : null;
  const openedKind: FrameKind | null = opened ? bridge.frames.kindFor(opened.row.spec.zone.bounds) : null;
  const { frames, error: frameError } = useFrameAssets(
    [candidateKind, openedKind].filter((k): k is FrameKind => k !== null),
  );
  const assets = candidateKind ? frames[candidateKind] : undefined;

  // ---- Title: suggested so as to avoid titles already in use (existing sheets + live proposals) ----
  const taken = useMemo(() => {
    const s = new Set<string>();
    for (const sheet of sheets.data) s.add(sheet.title);
    // A row without status (the optimistic row right after saving) counts as live; the database default is 'proposed'.
    for (const p of proposals.data) if (p.status !== 'discarded') s.add(p.title);
    return s;
  }, [sheets.data, proposals.data]);

  // When the title suggested by the engine changes (another card, another selection) the user's edit is forgotten
  // and the new suggestion is followed; otherwise the old title stays and the proposal is saved under the name of a different composition.
  const suggested = active?.spec.title ?? '';
  const lastSuggested = useRef<string | null>(null);
  useEffect(() => {
    const follow = shouldFollowSuggestion({ suggested, lastSuggested: lastSuggested.current, titleTouched });
    const changed = lastSuggested.current !== suggested;
    lastSuggested.current = suggested;
    if (!follow) return;
    if (changed) setTitleTouched(false);
    setTitle(suggested ? uniqueTitle(suggested, taken) : '');
  }, [suggested, taken, titleTouched]);

  // ---- Sheet composition: cards only when the candidates change, the large preview also follows the title ----
  const composeSheet = useCallback(
    (kind: FrameKind | null, spec: ProposalSpec, drawing: string, sheetTitle: string) => {
      const a = kind ? frames[kind] : undefined;
      if (!kind || !a) return null; // the frame has not arrived yet
      return composeSheetSvg({
        template: a.template,
        meta: a.meta,
        kind,
        spec,
        drawing,
        title: sheetTitle,
        mark: SProposal.previewMark,
      });
    },
    [frames],
  );

  const cardSvgs = useMemo(() => {
    const map = new Map<CompositionKey, string>();
    for (const c of engine.candidates) {
      const svg = composeSheet(candidateKind, c.spec, c.drawing, c.spec.title);
      if (svg) map.set(c.key, svg);
    }
    return map;
  }, [engine.candidates, candidateKind, composeSheet]);

  // Composition rebuilds and parses an SVG of hundreds of KB to 2 MB per typed character, so the input responds at once
  // and the preview follows a beat later (it catches up as soon as typing stops).
  const deferredTitle = useDeferredValue(title);
  const previewSvg = useMemo(() => {
    if (opened) return composeSheet(openedKind, opened.row.spec, opened.drawing, opened.row.title);
    if (!active) return null;
    return composeSheet(candidateKind, active.spec, active.drawing, deferredTitle.trim() || active.spec.title);
  }, [opened, openedKind, active, candidateKind, deferredTitle, composeSheet]);

  // ---- One-line status ----
  const statusLine: { text: string; bad: boolean } | null = useMemo(() => {
    if (selected.length === 0) return { text: SProposal.hintPickPart, bad: false };
    // The selection guard uses the count **before** cutting; narrowing the range does not lift it, so the text asks for fewer members.
    if (selInfo.tooLarge) return { text: SProposal.errSelectionTooLarge(selInfo.triangles), bad: true };
    if (engine.status === 'running')
      return {
        text: engine.progress
          ? SProposal.computingProgress(engine.progress.done, engine.progress.total)
          : SProposal.computing,
        bad: false,
      };
    if (engine.status === 'error' && engine.error) {
      // Engine messages are developer diagnostics and are not shown as is; the text is chosen by code.
      if (engine.error.code === 'empty') return { text: SProposal.errEmpty, bad: true };
      if (engine.error.code === 'too_large') return { text: SProposal.errTooLarge, bad: true };
      if (engine.error.code === 'no_fit') return { text: SProposal.errNoFit, bad: true };
      return { text: SProposal.errEngine(engine.error.message), bad: true };
    }
    if (engine.status === 'done' && engine.candidates.length === 0)
      return { text: SProposal.errNoCandidate, bad: true };
    return null;
  }, [selected.length, selInfo, engine]);

  // ---- Adopt ----
  const bridgeId = sheets.data[0]?.bridge_id;
  // While running, the previous candidates are still on screen; adopting then would mix them with the current selection.
  const adoptable = canAdopt({ active, status: engine.status, available: proposals.available });
  const adopt = async () => {
    const finalTitle = title.trim();
    if (!adoptable || !active) return;
    if (!finalTitle) return setNotice({ ok: false, text: SProposal.errTitleEmpty });
    if (taken.has(finalTitle))
      return setNotice({ ok: false, text: SProposal.errTitleTaken(uniqueTitle(finalTitle, taken)) });
    if (!bridgeId) return setNotice({ ok: false, text: SProposal.errNoBridge });

    setSaving(true);
    setNotice(null);
    try {
      // A proposal is saved under the default section of the bridge (the bridge has one section).
      const wanted = bridge.defaultSectionCode;
      await saveProposal({
        bridgeId,
        sectionId: sections.data.find((s) => s.code === wanted)?.id ?? null,
        memberId: null,
        title: finalTitle,
        note,
        candidate: active,
        // What is saved is the range this candidate actually drew, not the screen state (selected, clip).
        ...adoptZone(active),
        meshes,
      });
      if (!alive.current) return;
      setNotice({ ok: true, text: SProposal.adopted(finalTitle) });
      setNote('');
      setTitleTouched(false); // automatic suggestions resume with the next candidate
      proposals.refetch();
    } catch (e) {
      if (!alive.current) return;
      const message = errText(e);
      setNotice({ ok: false, text: isDuplicateTitle(message) ? SProposal.errDuplicateKey : SProposal.errSave(message) });
    } finally {
      if (alive.current) setSaving(false);
    }
  };

  // ---- SVG download: the composed sheet already carries the font stack, so it opens outside the viewer too ----
  const download = () => {
    if (!active) return;
    const finalTitle = title.trim() || active.spec.title;
    const svg = composeSheet(candidateKind, active.spec, active.drawing, finalTitle);
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeFileName(finalTitle)}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---- Opening and discarding saved proposals ----
  // Clicking rows in quick succession mixes up the responses; a request number makes only **the last clicked row** apply.
  const openSeq = useRef(0);
  const openRow = async (row: SheetProposalRow) => {
    setNotice(null);
    // A stored spec is outside data; its shape is checked before composing (the counterpart of the drawing validation in useProposals).
    if (!isComposableSpec(row.spec)) {
      setNotice({ ok: false, text: SProposal.errOpenProposal(SProposal.errInvalidProposal) });
      return;
    }
    const seq = (openSeq.current += 1);
    try {
      const drawing = await fetchProposalDrawing(row.id);
      if (alive.current && seq === openSeq.current) setOpened({ row, drawing });
    } catch (e) {
      if (alive.current && seq === openSeq.current) {
        setNotice({ ok: false, text: SProposal.errOpenProposal(errText(e)) });
      }
    }
  };
  const discardRow = async (row: SheetProposalRow) => {
    setDiscardingId(row.id);
    try {
      await discardProposal(row.id);
      if (!alive.current) return;
      setOpened((cur) => (cur?.row.id === row.id ? null : cur));
      proposals.refetch();
    } catch (e) {
      if (alive.current) setNotice({ ok: false, text: SProposal.errDiscard(errText(e)) });
    } finally {
      if (alive.current) setDiscardingId(null);
    }
  };

  // Chip order is the same natural order as the title and stored values, so screen and record show the same sequence.
  const chipCodes = useMemo(() => [...selected].sort(naturalCompare), [selected]);
  const liveCount = proposals.data.filter((p) => p.status !== 'discarded').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <PageHeader
        title={SProposal.pageTitle}
        subtitle={SProposal.pageSubtitle}
        right={
          <Button size="compact-xs" variant="default" onClick={() => setListOpen((o) => !o)}>
            {SProposal.savedProposals(liveCount)}
          </Button>
        }
      />

      <ScrollArea style={{ flex: 1, minHeight: 0 }} bg="var(--mantine-color-gray-0)">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: 16, alignItems: 'flex-start' }}>
          {/* -- Left: choosing the part -- */}
          <Stack gap={10} style={{ flex: '1 1 calc(50% - 8px)', minWidth: 'min(420px, 100%)' }}>
            <Paper withBorder radius="sm" style={{ height: '64vh', minHeight: 420, overflow: 'hidden' }}>
              <SelectViewer
                selected={selected}
                onSelectedChange={setSelected}
                clip={clip}
                onMeshes={onMeshes}
                onObjectIds={setObjectIds}
              />
            </Paper>
            <SelectionChips
              codes={chipCodes}
              triangles={selInfo.triangles}
              onRemove={(code) => setSelected((cur) => cur.filter((c) => c !== code))}
              onClear={() => setSelected([])}
            />
            <MemberTreePanel
              objectIds={objectIds}
              selected={selected}
              onSelectedChange={setSelected}
            />
            <RangePanel bounds={bounds} clip={clip} onClipChange={setClip} />
          </Stack>

          {/* -- Right: candidate gallery, preview, adopt -- */}
          <Stack gap={10} style={{ flex: '1 1 calc(50% - 8px)', minWidth: 'min(420px, 100%)' }}>
            {statusLine ? (
              <Text size="xs" c={statusLine.bad ? '#9B1C1C' : 'dimmed'}>
                {statusLine.text}
              </Text>
            ) : null}

            <ExistingSheets items={covering} />

            {engine.candidates.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: 10,
                }}
              >
                {engine.candidates.map((c) => (
                  <CandidateCard
                    key={c.key}
                    candidate={c}
                    svg={cardSvgs.get(c.key) ?? null}
                    selected={!opened && c.key === activeKey}
                    onSelect={() => {
                      setOpened(null);
                      setActiveKey(c.key);
                    }}
                  />
                ))}
              </div>
            ) : null}

            {engine.candidates.length > 0 && engine.ms !== null ? (
              <Text size="10px" c="dimmed" className="tnum" data-testid="engine-stats">
                {SProposal.engineStats(engine.candidates[0]!.metrics.triangles, engine.ms)}
              </Text>
            ) : null}

            <Paper withBorder radius="sm" style={{ height: '52vh', minHeight: 360, overflow: 'hidden' }}>
              <CandidatePreview
                svg={previewSvg}
                message={frameError ? `${SProposal.previewFrameError} (${frameError})` : undefined}
                resetKey={opened ? opened.row.id : activeKey}
                badge={opened ? SProposal.openedProposal : null}
              />
            </Paper>

            {opened ? (
              <Group gap={8}>
                <Text size="xs" fw={600} truncate style={{ flex: 1, minWidth: 0 }}>
                  {opened.row.title}
                </Text>
                <Button
                  size="compact-xs"
                  variant="default"
                  loading={discardingId === opened.row.id}
                  onClick={() => void discardRow(opened.row)}
                >
                  {SProposal.discard}
                </Button>
              </Group>
            ) : (
              <>
                <Group gap={8} align="flex-end" wrap="wrap">
                  <TextInput
                    label={SProposal.titleLabel}
                    size="xs"
                    style={{ flex: '2 1 280px' }}
                    value={title}
                    disabled={!active}
                    onChange={(e) => {
                      setTitle(e.currentTarget.value);
                      setTitleTouched(true);
                    }}
                  />
                  <TextInput
                    label={SProposal.noteLabel}
                    placeholder={SProposal.notePlaceholder}
                    size="xs"
                    style={{ flex: '1 1 160px' }}
                    value={note}
                    disabled={!active}
                    onChange={(e) => setNote(e.currentTarget.value)}
                  />
                  <Button size="xs" variant="default" disabled={!active || !assets} onClick={download}>
                    {SProposal.download}
                  </Button>
                  <Button
                    size="xs"
                    disabled={!adoptable}
                    loading={saving}
                    onClick={() => void adopt()}
                  >
                    {saving ? SProposal.adopting : SProposal.adopt}
                  </Button>
                </Group>
                {!proposals.available ? (
                  <Text size="10px" c="dimmed">
                    {SProposal.saveUnavailable}
                  </Text>
                ) : null}
              </>
            )}

            {notice ? (
              <Text size="xs" c={notice.ok ? '#1E7A3C' : '#9B1C1C'}>
                {notice.text}
              </Text>
            ) : null}

            <ProposalList
              rows={proposals.data}
              loading={proposals.loading}
              error={proposals.error}
              available={proposals.available}
              open={listOpen}
              onToggle={() => setListOpen((o) => !o)}
              openId={opened?.row.id ?? null}
              onOpen={(row) => void openRow(row)}
              onDiscard={(row) => void discardRow(row)}
              busyId={discardingId}
            />
          </Stack>
        </div>
      </ScrollArea>
    </div>
  );
}

export default Proposals;
