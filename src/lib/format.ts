export function formatDate(d: Date): string {
  if (!d || d.getTime() === 0) return '-';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('ko-KR');
}
