import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Box, Text } from '@mantine/core';
import { SProposal } from '@/i18n/s.proposal';

// ------------------------------------------------------------------
//  Sheet proposals: large preview of a candidate sheet (wheel zoom, drag pan, double-click reset).
//
//  NOTE: this is where dangerouslySetInnerHTML is used. The trust boundary of the incoming strings:
//    - Static templates (public/proposal/frame_*.svg) and drawing fragments the engine just made: trusted as is.
//    - **Anything read from the database (sheet_proposals) is outside HTML**: the row-level policy grants every
//      signed-in user full access, so the row may not be ours. A drawing therefore has to pass isTrustedDrawing
//      (a line-by-line allowlist, lib/proposal/drawing.ts) and a spec isComposableSpec (lib/proposal/compose.ts)
//      before it is composed (hooks/useProposals.ts, routes/Proposals.tsx openRow).
//    - Values added by composition go through f2() when numeric and esc() when text (lib/proposal/compose.ts).
//
//  The wheel listener is attached directly as **non-passive (passive:false)**: React's onWheel is
//  registered passively on the root, so preventDefault has no effect and the page scrolls along.
// ------------------------------------------------------------------

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 8;
/* Zoom sensitivity per wheel notch; a value that works for trackpads and mice alike. */
const ZOOM_SENSITIVITY = 0.0015;

interface ViewState {
  z: number;
  x: number;
  y: number;
}

const HOME: ViewState = { z: 1, x: 0, y: 0 };

export interface CandidatePreviewProps {
  /* The composed sheet SVG. When null only message is shown. */
  svg: string | null;
  /* Notice or error text when there is no svg. */
  message?: string | null;
  /* Zoom and pan reset when this value changes (switching to another candidate or proposal). */
  resetKey?: string | null;
  /* Overlay shown at the top left (read-only badge and the like). */
  badge?: string | null;
}

export function CandidatePreview({ svg, message, resetKey, badge }: CandidatePreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewState>(HOME);
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    setView(HOME);
  }, [resetKey]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = host.getBoundingClientRect();
      // Correct the pan so the point under the pointer stays put (center-based coordinates).
      const px = e.clientX - rect.left - rect.width / 2;
      const py = e.clientY - rect.top - rect.height / 2;
      setView((v) => {
        const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.z * Math.exp(-e.deltaY * ZOOM_SENSITIVITY)));
        const k = z / v.z;
        return { z, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
      });
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !svg) return;
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    dragRef.current = { id: d.id, x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id !== e.pointerId) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <Box
      ref={hostRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => setView(HOME)}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--mantine-color-gray-1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: svg ? 'grab' : 'default',
        touchAction: 'none',
      }}
    >
      {svg ? (
        <div
          className="sheet-fit"
          style={{
            width: '100%',
            height: '100%',
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
            transformOrigin: 'center center',
            background: '#fff',
          }}
          // See the trust boundary in the header: drawings and specs from the database reach this point only after validation.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <Text size="xs" c="dimmed" ta="center" px="md">
          {message ?? SProposal.previewPickOne}
        </Text>
      )}

      {badge ? (
        // Overlaps the title block text of the sheet, so a white backing is laid under it.
        <Text
          size="10px"
          fw={600}
          c="dimmed"
          px={6}
          py={2}
          style={{
            position: 'absolute',
            left: 8,
            top: 6,
            pointerEvents: 'none',
            background: 'rgba(255,255,255,0.92)',
            border: '1px solid var(--mantine-color-gray-3)',
          }}
        >
          {badge}
        </Text>
      ) : null}

      {svg ? (
        // Overlaps the sheet drawing, so the same white backing as the badge is laid under it.
        <Text
          size="10px"
          c="dimmed"
          px={6}
          py={2}
          style={{
            position: 'absolute',
            right: 8,
            bottom: 6,
            pointerEvents: 'none',
            background: 'rgba(255,255,255,0.92)',
            border: '1px solid var(--mantine-color-gray-3)',
          }}
        >
          {SProposal.previewHint}
        </Text>
      ) : null}
    </Box>
  );
}
