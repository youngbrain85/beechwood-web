// ------------------------------------------------------------------
//  Dashboard hero: bridge identity, four facts, three NBI component ratings and the overall condition.
//
//  CAD look (ink background, grid, uppercase tracked labels) with a grid instead of a photograph
//  (there is no overview photograph of the bridge).
//  Ratings are read from v_nbi_components rows by component (ratingsFromRows); nothing is recomputed on screen.
//  Overall condition = band of the minimum of the three components (lib/eval/aashto overallCondition), N/A if any is missing.
//  The 0-9 scale on each tile: cell color = SNBI band of that value (0-4 Poor, 5-6 Fair, 7-9 Good), only the current cell is strong.
//  NBI ratings here are indicators computed from element condition; the screen always says they are not official (SEval.computedNote).
//  When the rating query fails (ratingsError) the error text replaces the tiles and the overall condition: "N/A" means
//  there is nothing to rate, not that loading failed.
// ------------------------------------------------------------------
import { Text } from '@mantine/core';
import { SEval } from '@/i18n/s.eval';
import { BAND_COLOUR, overallCondition, ratingBand, type Component } from '@/lib/eval/aashto';
import type { NbiComponentRow } from '@/types/db';

export interface NbiRatings {
  deck: number | null;
  super: number | null;
  sub: number | null;
}

/* v_nbi_components rows to per-component ratings (any row order; looked up by component) */
export function ratingsFromRows(rows: readonly NbiComponentRow[]): NbiRatings {
  const of = (c: Component): number | null => rows.find((r) => r.component === c)?.rating ?? null;
  return { deck: of('deck'), super: of('super'), sub: of('sub') };
}

/* The overall condition needs all three */
export function overallOf(r: NbiRatings): 'Good' | 'Fair' | 'Poor' | null {
  return r.deck === null || r.super === null || r.sub === null
    ? null
    : overallCondition({ deck: r.deck, super: r.super, sub: r.sub });
}

const INK = 'var(--mantine-color-ink-9, #0e1114)';
const DIM = 'rgba(255,255,255,0.62)';
const EYEBROW = { letterSpacing: '0.2em', color: DIM } as const;

/* Text color of the band chip: ink on the Fair (yellow) background, white on the others (contrast) */
const chipInk = (band: 'good' | 'fair' | 'poor'): string => (band === 'fair' ? '#0e1114' : '#fff');

export function NbiHero({
  bridgeName,
  bridgeSub,
  ratings,
  ratingsError = null,
  facts,
}: {
  bridgeName: string;
  bridgeSub: string;
  ratings: NbiRatings;
  /* Error text of a failed rating query (v_nbi_components); when set it replaces the tiles and the overall condition */
  ratingsError?: string | null;
  facts: { objects: number; damages: number; sheets: number; lastObserved: string };
}) {
  const overall = overallOf(ratings);
  const overallBand = overall ? (overall.toLowerCase() as 'good' | 'fair' | 'poor') : null;
  return (
    <div style={{ position: 'relative', overflow: 'hidden', border: '1px solid var(--mantine-color-gray-3)', background: INK, color: '#fff' }}>
      <CadGrid />
      {/* Body, a wrapping flex row: when there is no room for the rating group beside the bridge cell (basis 360 px,
          below about 1400 px of screen width) the rating group drops below the bridge cell */}
      <div
        data-hero-body=""
        style={{
          position: 'relative',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          gap: '24px 32px',
          padding: '32px 32px 20px',
        }}
      >
        {/* Bridge identity + facts */}
        <div data-hero-identity="" style={{ flex: '1 1 360px', minWidth: 0 }}>
          <Text fz={10.5} fw={600} tt="uppercase" style={EYEBROW}>
            {SEval.overview.eyebrow}
          </Text>
          <Text component="h2" fz={30} fw={700} lh={1.05} mt={8} style={{ letterSpacing: '-0.01em', color: '#fff' }}>
            {bridgeName}
          </Text>
          <Text fz={12.5} mt={4} style={{ color: 'rgba(255,255,255,0.75)' }}>
            {bridgeSub}
          </Text>
          <dl
            style={{
              margin: '24px 0 0',
              display: 'grid',
              // Fact cells do not shrink below 112 px; they wrap when narrow (when wide the four share the width)
              gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))',
              columnGap: 28,
              rowGap: 12,
            }}
          >
            <Fact label={SEval.overview.objects} value={String(facts.objects)} />
            <Fact label={SEval.overview.damages} value={String(facts.damages)} />
            <Fact label={SEval.overview.sheets} value={String(facts.sheets)} />
            <Fact label={SEval.overview.lastObserved} value={facts.lastObserved} />
          </dl>
        </div>

        {/* Three component ratings + overall condition; tiles wrap too when narrow (portrait phone). On a failed query the error text takes their place */}
        <div data-hero-ratings="" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 10 }}>
          {ratingsError ? (
            <RatingsError message={ratingsError} />
          ) : (
            <>
              <RatingTile component="deck" rating={ratings.deck} />
              <RatingTile component="super" rating={ratings.super} />
              <RatingTile component="sub" rating={ratings.sub} />
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  minWidth: 150,
                  padding: '14px 18px',
                  border: '1px solid rgba(255,255,255,0.25)',
                  borderTop: `3px solid ${overallBand ? BAND_COLOUR[overallBand] : 'rgba(255,255,255,0.25)'}`,
                  background: 'rgba(15,17,21,0.55)',
                }}
              >
                <Text fz={10} fw={600} tt="uppercase" style={EYEBROW}>
                  {SEval.overview.overallTitle}
                </Text>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 30,
                    fontWeight: 700,
                    lineHeight: 1.05,
                    letterSpacing: '0.02em',
                    textTransform: 'uppercase',
                    color: overallBand ? BAND_COLOUR[overallBand] : '#fff',
                  }}
                >
                  {overall ?? SEval.notApplicable}
                </div>
                <Text fz={10.5} mt={8} lh={1.35} style={{ color: DIM, maxWidth: 170 }}>
                  {SEval.overview.overallHint}
                </Text>
              </div>
            </>
          )}
        </div>
      </div>
      <Text
        fz={10}
        px={32}
        pb={14}
        style={{ position: 'relative', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.02em' }}
      >
        {SEval.overview.ratingsTitle} · {SEval.computedNote}
      </Text>
    </div>
  );
}

/* Failed rating query: one error cell in place of the four tiles (3 components + overall), band in the Poor color */
function RatingsError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      data-hero-ratings-error=""
      style={{
        maxWidth: 480,
        padding: '14px 18px',
        border: '1px solid rgba(255,255,255,0.25)',
        borderTop: `3px solid ${BAND_COLOUR.poor}`,
        background: 'rgba(15,17,21,0.55)',
      }}
    >
      <Text fz={10} fw={600} tt="uppercase" style={EYEBROW}>
        {SEval.overview.ratingsTitle}
      </Text>
      <Text fz={12.5} mt={6} lh={1.45} style={{ color: '#fff', overflowWrap: 'anywhere' }}>
        {message}
      </Text>
    </div>
  );
}

/* Component rating tile: component name, number, NBI descriptor, band chip, 0-9 scale */
function RatingTile({ component, rating }: { component: Component; rating: number | null }) {
  const band = rating === null ? null : ratingBand(rating);
  return (
    <div
      data-component={component}
      style={{
        width: 144,
        padding: '14px 14px 12px',
        border: '1px solid rgba(255,255,255,0.25)',
        borderTop: `3px solid ${band ? BAND_COLOUR[band] : 'rgba(255,255,255,0.25)'}`,
        background: 'rgba(15,17,21,0.55)',
      }}
    >
      <Text fz={10} fw={600} tt="uppercase" style={{ ...EYEBROW, letterSpacing: '0.12em' }}>
        {SEval.component[component]}
      </Text>
      <div className="tnum" style={{ marginTop: 6, fontSize: 44, fontWeight: 700, lineHeight: 1, color: '#fff' }}>
        {rating ?? SEval.notApplicable}
      </div>
      {band && rating !== null ? (
        <>
          <Text fz={11.5} fw={500} mt={6} style={{ color: 'rgba(255,255,255,0.88)' }}>
            {SEval.ratingWord[rating]}
          </Text>
          <span
            style={{
              display: 'inline-block',
              marginTop: 6,
              padding: '1px 7px',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              background: BAND_COLOUR[band],
              color: chipInk(band),
            }}
          >
            {SEval.band[band]}
          </span>
        </>
      ) : null}
      <RatingScale rating={rating} />
    </div>
  );
}

/* 0-9 scale: cell color is the band of that value, only the current rating cell is strong */
function RatingScale({ rating }: { rating: number | null }) {
  return (
    <div style={{ marginTop: 10 }} aria-hidden="true">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 2 }}>
        {Array.from({ length: 10 }, (_, v) => (
          <span
            key={v}
            data-rating-cell={v}
            data-current={v === rating ? 'true' : undefined}
            style={{
              height: v === rating ? 8 : 5,
              alignSelf: 'end',
              background: BAND_COLOUR[ratingBand(v)],
              opacity: v === rating ? 1 : 0.3,
            }}
          />
        ))}
      </div>
      <div className="tnum" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 9, color: DIM }}>
        <span>0</span>
        <span>9</span>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: DIM }}>
        {label}
      </dt>
      <dd className="tnum" style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 600 }}>
        {value}
      </dd>
    </div>
  );
}

/* CAD grid background */
function CadGrid() {
  return (
    <svg style={{ position: 'absolute', inset: 0, height: '100%', width: '100%', opacity: 0.13 }} aria-hidden="true">
      <defs>
        <pattern id="nbi-hero-grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#9aa0a6" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#nbi-hero-grid)" />
    </svg>
  );
}
