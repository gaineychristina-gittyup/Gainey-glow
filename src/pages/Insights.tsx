import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { CONCERNS, db, type Concern } from '../db/schema';
import { COMMON_IRRITANTS, findIngredientInfo, findIrritant } from '../data/ingredientReference';
import { todayISO } from '../lib/date';

export default function Insights() {
  const products = useLiveQuery(() => db.products.toArray(), []);
  const sensitivities = useLiveQuery(() => db.sensitivities.toArray(), []);
  const photos = useLiveQuery(() => db.photos.toArray(), []);

  const today = todayISO();
  const active = useMemo(
    () => (products ?? []).filter((p) => p.startedOn <= today && (!p.stoppedOn || p.stoppedOn >= today)),
    [products, today],
  );

  // Count products targeting each concern
  const concernCounts = useMemo(() => {
    const map = new Map<Concern, { products: string[]; }>();
    CONCERNS.forEach((c) => map.set(c.id, { products: [] }));
    active.forEach((p) => {
      const set = new Set<Concern>(p.concerns);
      p.ingredients.forEach((i) => {
        findIngredientInfo(i)?.targets.forEach((t) => set.add(t));
      });
      set.forEach((c) => {
        map.get(c)!.products.push(p.name);
      });
    });
    return map;
  }, [active]);

  const sensitiveSet = useMemo(
    () => new Set((sensitivities ?? []).map((s) => s.ingredient.toLowerCase())),
    [sensitivities],
  );

  const flagged = useMemo(() => {
    const out: { product: string; ingredient: string; reason: string; severity: 'mild' | 'severe' }[] = [];
    active.forEach((p) => {
      p.ingredients.forEach((i) => {
        const lower = i.toLowerCase();
        if (sensitiveSet.has(lower)) {
          out.push({ product: p.name, ingredient: i, reason: 'Personal sensitivity', severity: 'severe' });
          return;
        }
        const irr = findIrritant(lower);
        if (irr) out.push({ product: p.name, ingredient: i, reason: irr.reason, severity: 'mild' });
      });
    });
    return out;
  }, [active, sensitiveSet]);

  const photoStreak = useMemo(() => computeStreak(photos ?? []), [photos]);

  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="font-display text-xl text-glow-800">Insights</h2>
        <p className="text-xs text-glow-600">A snapshot of your active routine.</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Active products" value={active.length} />
          <Stat label="Photo streak" value={photoStreak} suffix={photoStreak === 1 ? 'day' : 'days'} />
          <Stat label="Sensitivities" value={(sensitivities ?? []).length} />
        </div>
      </section>

      <section className="card">
        <h3 className="font-display text-lg text-glow-800 mb-2">Concern coverage</h3>
        <p className="text-xs text-glow-600 mb-3">
          How many active products target each concern (including via key ingredients).
        </p>
        <ul className="space-y-2">
          {CONCERNS.map((c) => {
            const entry = concernCounts.get(c.id)!;
            const count = entry.products.length;
            return (
              <li key={c.id}>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-glow-900">{c.label}</span>
                  <span className="text-xs text-glow-600">
                    {count === 0 ? 'no coverage' : `${count} product${count === 1 ? '' : 's'}`}
                  </span>
                </div>
                <div className="h-1.5 mt-1 rounded-full bg-glow-100 overflow-hidden">
                  <div
                    className="h-full bg-glow-500"
                    style={{ width: `${Math.min(100, count * 25)}%` }}
                  />
                </div>
                {count > 0 && (
                  <div className="text-[11px] text-glow-500 mt-1 truncate">
                    {entry.products.join(', ')}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card">
        <h3 className="font-display text-lg text-glow-800 mb-2 flex items-center gap-1.5">
          <AlertTriangle size={16} className="text-amber-600" /> Sensitivity warnings
        </h3>
        {flagged.length === 0 ? (
          <p className="text-sm text-glow-600/80">No flagged ingredients in your active routine.</p>
        ) : (
          <ul className="space-y-2">
            {flagged.map((f, i) => (
              <li key={i} className="text-sm">
                <span className={f.severity === 'severe' ? 'chip-danger mr-2' : 'chip-warn mr-2'}>
                  {f.ingredient}
                </span>
                <span className="text-glow-900 font-medium">{f.product}</span>
                <div className="text-[11px] text-glow-600 ml-1 mt-0.5">{f.reason}</div>
              </li>
            ))}
          </ul>
        )}
        <details className="mt-3 text-xs text-glow-600">
          <summary className="cursor-pointer">Always-on irritant watch list</summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {COMMON_IRRITANTS.map((i) => (
              <span key={i.ingredient} className="chip-warn">{i.ingredient}</span>
            ))}
          </div>
        </details>
      </section>

      <section className="card">
        <h3 className="font-display text-lg text-glow-800 mb-2 flex items-center gap-1.5">
          <Sparkles size={16} /> Suggestions
        </h3>
        <Suggestions
          uncoveredConcerns={CONCERNS.filter((c) => concernCounts.get(c.id)!.products.length === 0)}
          overloadedConcerns={CONCERNS.filter((c) => concernCounts.get(c.id)!.products.length >= 4)}
          flaggedCount={flagged.length}
        />
      </section>
    </div>
  );
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-xl bg-glow-50 py-3">
      <div className="font-display text-2xl text-glow-900">{value}</div>
      <div className="text-[11px] text-glow-600">
        {label}{suffix ? ` ${suffix}` : ''}
      </div>
    </div>
  );
}

function Suggestions({
  uncoveredConcerns,
  overloadedConcerns,
  flaggedCount,
}: {
  uncoveredConcerns: { id: Concern; label: string }[];
  overloadedConcerns: { id: Concern; label: string }[];
  flaggedCount: number;
}) {
  const items: string[] = [];
  if (uncoveredConcerns.length > 0) {
    items.push(
      `No products in your routine target: ${uncoveredConcerns
        .slice(0, 3)
        .map((c) => c.label.toLowerCase())
        .join(', ')}${uncoveredConcerns.length > 3 ? ', and more' : ''}.`,
    );
  }
  if (overloadedConcerns.length > 0) {
    items.push(
      `You have 4+ products targeting ${overloadedConcerns
        .map((c) => c.label.toLowerCase())
        .join(', ')} — consider simplifying to avoid overload.`,
    );
  }
  if (flaggedCount > 0) {
    items.push(`${flaggedCount} flagged ingredient${flaggedCount === 1 ? '' : 's'} in your active routine — review the warnings above.`);
  }
  if (items.length === 0) {
    items.push('Your routine looks balanced right now. Keep capturing daily photos to spot trends.');
  }
  return (
    <ul className="list-disc pl-4 space-y-1 text-sm text-glow-800">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}

function computeStreak(photos: { date: string }[]): number {
  if (photos.length === 0) return 0;
  const dateSet = new Set(photos.map((p) => p.date));
  let streak = 0;
  const cur = new Date();
  for (;;) {
    const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
    if (dateSet.has(iso)) {
      streak += 1;
      cur.setDate(cur.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}
