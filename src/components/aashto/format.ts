// ------------------------------------------------------------------
//  Number formats of the screens: element quantities (ft, sq ft, each) and condition state shares.
//  Quantity: thousands separator for integers, up to two decimals otherwise (trailing zeros dropped), so seeded quantities (80.25 ft, 70.34 ft) read as entered.
//  Share: a one-decimal percentage. 0 < x < 0.1% is '<0.1%', and a value that would round to 100% is '>99.9%'
//        (CS1 must not read 100% while any CS2-CS4 quantity exists).
// ------------------------------------------------------------------

export function formatQty(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const rounded = Math.round(v * 100) / 100;
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function formatPct(share: number): string {
  if (share <= 0) return '0%';
  if (share >= 1) return '100%';
  const pct = share * 100;
  if (pct < 0.05) return '<0.1%';
  if (pct >= 99.95) return '>99.9%';
  return `${pct.toFixed(1)}%`;
}
