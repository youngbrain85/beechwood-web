// ------------------------------------------------------------------
//  Shared photo block: the photos of one damage in one row, oldest first (each with its round); a click enlarges.
//  Used by the damage details of the 3D view (routes/Model.tsx DamagePanel) and by the opened row of the
//  sheet damage table (routes/Dashboard.tsx through components/aashto/DamageRowDetail.tsx).
//  Read only: photos are added and deleted in the field app, never here.
// ------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ActionIcon, Group, Loader, Modal, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useDamagePhotos, type PhotoItem } from '@/hooks/useDamagePhotos';
import { SPhotos } from '@/i18n/s.photos';
import { formatPhotoTime, type DamagePhotoSource } from '@/lib/damagePhotos';

const LINE = '1px solid var(--mantine-color-gray-3)';
const CENTER: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--mantine-color-gray-6)',
};

/* Broken image: an icon inside a box of the same size (the layout does not move). */
function BrokenIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M3 16l5-5 4 4 3-3 6 6" />
      <path d="M4 3l16 18" />
    </svg>
  );
}

function Thumb({
  photo,
  w,
  h,
  onOpen,
  onBroken,
}: {
  photo: PhotoItem;
  w: number;
  h: number;
  onOpen: () => void;
  onBroken: () => void;
}) {
  const [state, setState] = useState<'loading' | 'ok' | 'broken'>(photo.url ? 'loading' : 'broken');
  useEffect(() => setState(photo.url ? 'loading' : 'broken'), [photo.url]);
  return (
    <div style={{ flex: '0 0 auto', width: w }}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={SPhotos.open(photo.roundLabel)}
        data-photo-key={photo.key}
        style={{
          position: 'relative',
          display: 'block',
          width: w,
          height: h,
          padding: 0,
          border: LINE,
          background: 'var(--mantine-color-gray-1)',
          cursor: 'zoom-in',
          overflow: 'hidden',
        }}
      >
        {photo.url && state !== 'broken' ? (
          <img
            src={photo.url}
            alt=""
            loading="lazy"
            onLoad={() => setState('ok')}
            onError={() => {
              setState('broken');
              onBroken();
            }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : null}
        {state === 'loading' ? (
          <span style={CENTER}>
            <Loader size="xs" />
          </span>
        ) : null}
        {state === 'broken' ? (
          <span style={CENTER} title={SPhotos.broken}>
            <BrokenIcon />
          </span>
        ) : null}
      </button>
      <Text size="10px" c="dimmed" mt={2} truncate="end" title={photo.roundLabel}>
        {photo.roundLabel || '—'}
      </Text>
    </div>
  );
}

function PhotoLightbox({
  photos,
  index,
  onIndex,
  onBroken,
}: {
  photos: PhotoItem[];
  index: number | null;
  onIndex: (i: number | null) => void;
  onBroken: (key: string) => void;
}) {
  const narrow = useMediaQuery('(max-width: 767px)');
  const n = photos.length;
  const p = index != null ? photos[index] : undefined;
  const go = useCallback(
    (d: number) => {
      if (index != null && n > 0) onIndex((index + d + n) % n);
    },
    [index, n, onIndex],
  );
  useEffect(() => {
    if (index == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, go]);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [p?.key, p?.url]);
  const when = p ? formatPhotoTime(p.takenAt ?? p.createdAt) : '';
  const navBtn: CSSProperties = { position: 'absolute', top: '50%', transform: 'translateY(-50%)' };

  return (
    <Modal
      opened={!!p}
      onClose={() => onIndex(null)}
      size="xl"
      fullScreen={!!narrow}
      centered
      zIndex={400}
      transitionProps={{ duration: 0 }}
      closeButtonProps={{ 'aria-label': SPhotos.close }}
      title={
        p && index != null ? (
          <Group gap={10}>
            <Text fw={700} fz={14}>
              {SPhotos.title}
            </Text>
            <Text fz={12} c="dimmed" className="tnum">
              {SPhotos.position(index + 1, n)}
            </Text>
          </Group>
        ) : null
      }
    >
      {p ? (
        <div data-testid="photo-lightbox">
          <div
            style={{
              position: 'relative',
              height: narrow ? '70vh' : '72vh',
              background: 'var(--mantine-color-dark-8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {p.url && !broken ? (
              <img
                src={p.url}
                alt={SPhotos.open(p.roundLabel)}
                onError={() => {
                  setBroken(true);
                  onBroken(p.key);
                }}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
              />
            ) : (
              <Text c="gray.5" size="sm">
                {SPhotos.broken}
              </Text>
            )}
            {n > 1 ? (
              <>
                <ActionIcon variant="filled" color="dark" size="lg" aria-label={SPhotos.prev} onClick={() => go(-1)} style={{ ...navBtn, left: 8 }}>
                  ‹
                </ActionIcon>
                <ActionIcon variant="filled" color="dark" size="lg" aria-label={SPhotos.next} onClick={() => go(1)} style={{ ...navBtn, right: 8 }}>
                  ›
                </ActionIcon>
              </>
            ) : null}
          </div>
          <Group gap={16} mt={10} wrap="wrap">
            <Text size="sm">
              <Text span c="dimmed" size="sm">
                {SPhotos.round}{' '}
              </Text>
              {p.roundLabel || '—'}
            </Text>
            {when ? (
              <Text size="sm" className="tnum">
                <Text span c="dimmed" size="sm">
                  {SPhotos.takenAt}{' '}
                </Text>
                {when}
              </Text>
            ) : null}
            {p.deviceFilename ? (
              <Text size="sm" style={{ wordBreak: 'break-all' }}>
                <Text span c="dimmed" size="sm">
                  {SPhotos.file}{' '}
                </Text>
                {p.deviceFilename}
              </Text>
            ) : null}
          </Group>
        </div>
      ) : null}
    </Modal>
  );
}

export interface DamagePhotosProps {
  damage: DamagePhotoSource & { id: string };
  /* Thumbnail size (px): 140x105 in the 3D panel, 160x120 in the opened sheet row. */
  thumbW?: number;
  thumbH?: number;
  /**
   * Called when the enlarged view opens and closes (false also on unmount). For a block inside another Modal:
   * every open Mantine Modal has its own Esc listener on window, so the Esc of the enlarged view would close
   * the outer Modal too. The outer one turns closeOnEscape off with this value (the sheet modal of routes/Dashboard.tsx).
   */
  onLightboxChange?: (open: boolean) => void;
}

export function DamagePhotos({ damage, thumbW = 140, thumbH = 105, onLightboxChange }: DamagePhotosProps) {
  const { photos, loading, error, retry } = useDamagePhotos(damage);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  // Closes the enlarged view when the damage changes.
  useEffect(() => setOpenIdx(null), [damage.id]);
  // Open-state notice: the same condition as opened (!!photos[index]) of PhotoLightbox. An unmount reports closed.
  const lightboxOpen = openIdx != null && openIdx < photos.length;
  const notify = useRef(onLightboxChange);
  notify.current = onLightboxChange;
  useEffect(() => {
    notify.current?.(lightboxOpen);
  }, [lightboxOpen]);
  useEffect(() => () => notify.current?.(false), []);

  return (
    <div data-testid="damage-photos">
      <Group justify="space-between" mb={6}>
        <Text size="10px" fw={700} c="dimmed" style={{ letterSpacing: '0.08em' }}>
          {SPhotos.title}
        </Text>
        {photos.length > 0 ? (
          <Text size="10px" c="dimmed" className="tnum">
            {SPhotos.count(photos.length)}
          </Text>
        ) : null}
      </Group>
      {loading ? (
        <div
          aria-label={SPhotos.loading}
          style={{ position: 'relative', width: thumbW, height: thumbH, border: LINE, background: 'var(--mantine-color-gray-1)' }}
        >
          <span style={CENTER}>
            <Loader size="xs" />
          </span>
        </div>
      ) : photos.length === 0 ? (
        <Text size="xs" c="dimmed">
          {SPhotos.none}
        </Text>
      ) : (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {photos.map((p, i) => (
            <Thumb
              key={p.key}
              photo={p}
              w={thumbW}
              h={thumbH}
              onOpen={() => setOpenIdx(i)}
              onBroken={() => {
                void retry(p.key);
              }}
            />
          ))}
        </div>
      )}
      {error && !loading ? (
        <Text size="10px" c="orange.8" mt={4}>
          {SPhotos.loadError}
        </Text>
      ) : null}
      <PhotoLightbox photos={photos} index={openIdx} onIndex={setOpenIdx} onBroken={(k) => void retry(k)} />
    </div>
  );
}
