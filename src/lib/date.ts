export function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function fmtDateShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86_400_000);
}

export function relDays(iso: string): string {
  const diff = daysBetween(iso, todayISO());
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 0) return `in ${-diff}d`;
  if (diff < 30) return `${diff}d ago`;
  if (diff < 365) return `${Math.round(diff / 30)}mo ago`;
  return `${Math.round(diff / 365)}y ago`;
}
