import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Loader2, Sparkles, Wand2, X } from 'lucide-react';
import { CONCERNS, db, type Concern } from '../db/schema';
import { COMMON_IRRITANTS, findIngredientInfo, findIrritant } from '../data/ingredientReference';
import { todayISO } from '../lib/date';
import { recommendProducts, type RecommendedProduct } from '../lib/gemini';
import { getGeminiKey } from '../lib/settings';

export default function Insights() {
  const [askingFor, setAskingFor] = useState<{ id: Concern; label: string } | null>(null);
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
          Tap <Wand2 size={11} className="inline -mt-0.5" /> on any row to ask AI for product recommendations.
        </p>
        <ul className="space-y-2">
          {CONCERNS.map((c) => {
            const entry = concernCounts.get(c.id)!;
            const count = entry.products.length;
            return (
              <li key={c.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-glow-900 flex-1">{c.label}</span>
                  <span className="text-xs text-glow-600">
                    {count === 0 ? 'no coverage' : `${count} product${count === 1 ? '' : 's'}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAskingFor(c)}
                    className="btn-ghost p-1.5"
                    aria-label={`Recommend products for ${c.label}`}
                    title={`Recommend products for ${c.label}`}
                  >
                    <Wand2 size={14} className="text-glow-700" />
                  </button>
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

      {askingFor && (
        <RecommendationsModal
          concernLabel={askingFor.label}
          alreadyUsing={concernCounts.get(askingFor.id)!.products}
          sensitivities={(sensitivities ?? []).map((s) => s.ingredient)}
          onClose={() => setAskingFor(null)}
        />
      )}
    </div>
  );
}

function RecommendationsModal({
  concernLabel,
  alreadyUsing,
  sensitivities,
  onClose,
}: {
  concernLabel: string;
  alreadyUsing: string[];
  sensitivities: string[];
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<RecommendedProduct[] | null>(null);

  async function run() {
    if (!getGeminiKey()) {
      setError('Add your Gemini API key in Settings first (gear icon, top right).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await recommendProducts({
        concernLabel,
        alreadyUsing,
        sensitivities,
      });
      setResults(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to get recommendations.');
    } finally {
      setLoading(false);
    }
  }

  // Auto-fetch on open.
  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-3">
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-lg text-glow-800 flex items-center gap-1.5">
            <Wand2 size={16} className="text-glow-600" /> {concernLabel}
          </h3>
          <button className="btn-ghost p-2" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-glow-600 mb-3">
          AI suggestions based on your active routine and sensitivities. Informational, not medical advice.
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-glow-700 py-6 justify-center">
            <Loader2 size={16} className="animate-spin" /> Asking Gemini…
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <div className="flex-1">{error}</div>
            <button onClick={run} className="text-red-700 font-medium hover:underline">
              Retry
            </button>
          </div>
        )}

        {results && results.length === 0 && !error && !loading && (
          <p className="text-sm text-glow-600/80 py-6 text-center">
            No recommendations returned. Try again.
          </p>
        )}

        {results && results.length > 0 && (
          <ul className="space-y-2.5">
            {results.map((r, i) => (
              <li key={i} className="rounded-xl bg-glow-50 p-3">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <span className="font-medium text-glow-900">{r.name}</span>
                  <span className="text-xs text-glow-600">{r.brand}</span>
                </div>
                <p className="text-xs text-glow-700 mt-1">{r.reason}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.keyIngredients.map((ing) => (
                    <span key={ing} className="chip text-[10px]">
                      {ing}
                    </span>
                  ))}
                </div>
                {(r.priceTier || r.whereToFind) && (
                  <div className="mt-2 text-[11px] text-glow-500">
                    {r.priceTier && (
                      <span className="capitalize">{r.priceTier}</span>
                    )}
                    {r.priceTier && r.whereToFind ? ' · ' : ''}
                    {r.whereToFind}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex justify-end gap-2">
          {results && (
            <button className="btn-ghost" onClick={run} disabled={loading}>
              Regenerate
            </button>
          )}
          <button className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
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
