import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Beaker, BookOpen, Loader2, Send, Sparkles, TrendingDown, TrendingUp, Wand2 } from 'lucide-react';
import { CONCERNS, db, type Concern } from '../db/schema';
import { COMMON_IRRITANTS, INGREDIENT_LIBRARY, findIngredientInfo, findIrritant, type Evidence } from '../data/ingredientReference';
import { todayISO } from '../lib/date';
import { askSkincareQuestion } from '../lib/gemini';
import { getGeminiKey } from '../lib/settings';

export default function Insights() {
  const products = useLiveQuery(() => db.products.toArray(), []);
  const sensitivities = useLiveQuery(() => db.sensitivities.toArray(), []);
  const photos = useLiveQuery(() => db.photos.toArray(), []);
  const treatments = useLiveQuery(() => db.treatments.toArray(), []);
  const ratings = useLiveQuery(() => db.skinRatings.toArray(), []);

  const today = todayISO();
  const active = useMemo(
    () => (products ?? []).filter((p) => (!p.startedOn || p.startedOn <= today) && (!p.stoppedOn || p.stoppedOn >= today)),
    [products, today],
  );

  const concernCounts = useMemo(() => {
    const map = new Map<Concern, { products: string[] }>();
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

  const ingredientFrequency = useMemo(() => {
    const map = new Map<string, { products: string[]; severity: 'sensitivity' | 'irritant' | 'caution' | 'ok' }>();
    active.forEach((p) => {
      p.ingredients.forEach((raw) => {
        const i = raw.toLowerCase().trim();
        if (!i) return;
        const entry = map.get(i) ?? { products: [], severity: 'ok' as const };
        entry.products.push(p.name);
        if (sensitiveSet.has(i)) entry.severity = 'sensitivity';
        else if (entry.severity !== 'sensitivity') {
          if (findIrritant(i)) entry.severity = 'irritant';
          else if (entry.severity === 'ok' && findIngredientInfo(i)?.cautions?.length) entry.severity = 'caution';
        }
        map.set(i, entry);
      });
    });
    return Array.from(map.entries())
      .map(([ingredient, v]) => ({
        ingredient,
        count: v.products.length,
        products: v.products,
        severity: v.severity,
      }))
      .sort((a, b) => b.count - a.count || a.ingredient.localeCompare(b.ingredient));
  }, [active, sensitiveSet]);

  const photoStreak = useMemo(() => computeStreak(photos ?? []), [photos]);

  // Per-product correlation: mean rating during the period the product was
  // active vs. when it wasn't. Requires >= 3 ratings on each side to be shown.
  const correlations = useMemo(() => {
    const valid = (ratings ?? []).filter((r) => r.rating > 0);
    if (valid.length < 6 || !products) return [];
    return products
      .map((p) => {
        if (!p.startedOn) return null;
        const start = p.startedOn;
        const stop = p.stoppedOn ?? '9999-12-31';
        const on = valid.filter((r) => r.date >= start && r.date <= stop);
        const off = valid.filter((r) => r.date < start || r.date > stop);
        if (on.length < 3 || off.length < 3) return null;
        const onMean = on.reduce((a, b) => a + b.rating, 0) / on.length;
        const offMean = off.reduce((a, b) => a + b.rating, 0) / off.length;
        return {
          product: p,
          onMean,
          offMean,
          delta: onMean - offMean,
          nOn: on.length,
          nOff: off.length,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.delta - a.delta);
  }, [ratings, products]);

  // Research-backed coverage: for each concern, list user's high/moderate
  // evidence ingredients targeting it. Recommend a high-evidence pick when
  // a concern has none.
  const evidenceByConcern = useMemo(() => {
    const map = new Map<
      Concern,
      {
        userIngredients: { name: string; evidence: Evidence; products: string[] }[];
        recommendations: { name: string; evidence: Evidence }[];
      }
    >();
    CONCERNS.forEach((c) => map.set(c.id, { userIngredients: [], recommendations: [] }));

    // Index user's ingredients across active routine.
    active.forEach((p) => {
      p.ingredients.forEach((raw) => {
        const info = findIngredientInfo(raw);
        if (!info?.evidence) return;
        info.targets.forEach((t) => {
          const entry = map.get(t)!;
          const existing = entry.userIngredients.find((u) => u.name === info.name);
          if (existing) {
            if (!existing.products.includes(p.name)) existing.products.push(p.name);
          } else {
            entry.userIngredients.push({
              name: info.name,
              evidence: info.evidence!,
              products: [p.name],
            });
          }
        });
      });
    });

    // For each concern, build recs from the curated library, filtered to
    // ingredients the user doesn't already have, prioritizing high evidence.
    CONCERNS.forEach((c) => {
      const have = new Set(map.get(c.id)!.userIngredients.map((u) => u.name));
      const recs = INGREDIENT_LIBRARY.filter(
        (i) => i.evidence && i.targets.includes(c.id) && !have.has(i.name),
      )
        .sort((a, b) => evidenceWeight(b.evidence) - evidenceWeight(a.evidence))
        .slice(0, 3)
        .map((i) => ({ name: i.name, evidence: i.evidence! }));
      map.get(c.id)!.recommendations = recs;
    });

    return map;
  }, [active]);

  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="font-display text-xl text-glow-800">Insights / AI</h2>
        <p className="text-xs text-glow-600">A snapshot of your active routine plus AI guidance.</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Active products" value={active.length} />
          <Stat label="Photo streak" value={photoStreak} suffix={photoStreak === 1 ? 'day' : 'days'} />
          <Stat label="Sensitivities" value={(sensitivities ?? []).length} />
        </div>
      </section>

      <AskAiBox
        active={active}
        sensitivities={sensitivities ?? []}
        treatments={treatments ?? []}
        concernCounts={concernCounts}
      />

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
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-glow-900 flex-1">{c.label}</span>
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
          <Beaker size={16} className="text-glow-700" /> Key ingredients
        </h3>
        <p className="text-xs text-glow-600 mb-3">
          Every key ingredient across your active routine and how many products contain it.
          High counts increase the risk of sensitivity from layering — and ingredients you've
          flagged or that we know are common irritants are highlighted.
        </p>
        {ingredientFrequency.length === 0 ? (
          <p className="text-sm text-glow-600/80">
            Add ingredients to your products to see this breakdown.
          </p>
        ) : (
          <ul className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
            {ingredientFrequency.map((row) => {
              const chipClass =
                row.severity === 'sensitivity'
                  ? 'chip-danger'
                  : row.severity === 'irritant' || row.severity === 'caution'
                  ? 'chip-warn'
                  : 'chip';
              const overlap = row.count >= 3;
              return (
                <li key={row.ingredient} className="flex items-baseline gap-2">
                  <span className={`${chipClass} text-[11px]`}>{row.ingredient}</span>
                  <span className={`text-xs ${overlap ? 'text-amber-700 font-semibold' : 'text-glow-600'}`}>
                    in {row.count} product{row.count === 1 ? '' : 's'}
                    {overlap ? ' · layering risk' : ''}
                  </span>
                  <span className="text-[11px] text-glow-500 truncate flex-1">
                    {row.products.join(', ')}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <h3 className="font-display text-lg text-glow-800 mb-2 flex items-center gap-1.5">
          <TrendingUp size={16} className="text-emerald-600" /> Product correlations
        </h3>
        <p className="text-xs text-glow-600 mb-3">
          How your skin ratings line up with each product's active period. Observational, not
          causal — small samples are noisy. Need at least three rated days on and off a product
          before it shows up here.
        </p>
        {correlations.length === 0 ? (
          <p className="text-sm text-glow-600/80">
            Keep logging daily ratings — once a product has been rated on three days both with
            and without it, you'll see a comparison here.
          </p>
        ) : (
          <ul className="space-y-2">
            {correlations.slice(0, 8).map((c) => {
              const positive = c.delta > 0.1;
              const negative = c.delta < -0.1;
              return (
                <li
                  key={c.product.id}
                  className="rounded-xl border border-glow-100 bg-white/60 p-3"
                >
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <span className="font-medium text-glow-900 truncate">{c.product.name}</span>
                    <span
                      className={`text-xs font-semibold inline-flex items-center gap-1 ${
                        positive
                          ? 'text-emerald-700'
                          : negative
                          ? 'text-red-700'
                          : 'text-glow-600'
                      }`}
                    >
                      {positive ? (
                        <TrendingUp size={12} />
                      ) : negative ? (
                        <TrendingDown size={12} />
                      ) : null}
                      {c.delta >= 0 ? '+' : ''}
                      {c.delta.toFixed(2)} avg
                    </span>
                  </div>
                  <div className="text-[11px] text-glow-600 mt-0.5">
                    {c.onMean.toFixed(2)}/5 on this product
                    {' · '}
                    {c.offMean.toFixed(2)}/5 off it
                    {' · '}
                    {c.nOn} vs {c.nOff} days
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <h3 className="font-display text-lg text-glow-800 mb-2 flex items-center gap-1.5">
          <BookOpen size={16} className="text-glow-700" /> Research-backed coverage
        </h3>
        <p className="text-xs text-glow-600 mb-3">
          For each concern, the active-routine ingredients with the strongest research behind
          them, and recommended additions when a concern lacks high-evidence coverage.
        </p>
        <ul className="space-y-3">
          {CONCERNS.map((c) => {
            const entry = evidenceByConcern.get(c.id)!;
            const haveHigh = entry.userIngredients.some((u) => u.evidence === 'high');
            return (
              <li key={c.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-glow-900">{c.label}</span>
                  {entry.userIngredients.length === 0 ? (
                    <span className="text-[11px] text-glow-500">no evidence-backed match</span>
                  ) : haveHigh ? (
                    <span className="text-[11px] text-emerald-700 font-semibold">covered</span>
                  ) : (
                    <span className="text-[11px] text-amber-700">moderate-only</span>
                  )}
                </div>
                {entry.userIngredients.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {entry.userIngredients.map((u) => (
                      <span
                        key={u.name}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${evidenceChipClass(u.evidence)}`}
                        title={`${u.evidence} evidence`}
                      >
                        {u.name}
                        <span className="opacity-70">·{u.evidence === 'high' ? 'H' : u.evidence === 'moderate' ? 'M' : 'L'}</span>
                      </span>
                    ))}
                  </div>
                )}
                {!haveHigh && entry.recommendations.length > 0 && (
                  <div className="mt-1 text-[11px] text-glow-600">
                    Try:{' '}
                    {entry.recommendations.map((r, i) => (
                      <span key={r.name}>
                        {i > 0 ? ', ' : ''}
                        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ${evidenceChipClass(r.evidence)}`}>
                          {r.name}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-[10px] text-glow-500 mt-3">
          Evidence: <span className={`${evidenceChipClass('high')} px-1.5 py-0.5 rounded-full`}>H high</span>{' '}
          <span className={`${evidenceChipClass('moderate')} px-1.5 py-0.5 rounded-full`}>M moderate</span>{' '}
          <span className={`${evidenceChipClass('limited')} px-1.5 py-0.5 rounded-full`}>L limited</span>{' '}
          based on published clinical literature.
        </p>
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

function AskAiBox({
  active,
  sensitivities,
  treatments,
  concernCounts,
}: {
  active: { name: string; brand?: string; step: string; concerns: string[]; ingredients: string[] }[];
  sensitivities: { ingredient: string }[];
  treatments: { type: string; customName?: string; date: string }[];
  concernCounts: Map<Concern, { products: string[] }>;
}) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const examples = [
    'What can I add for hyperpigmentation?',
    'Is my routine missing anything?',
    'How should I layer my serums?',
    'Anything that conflicts in my AM routine?',
  ];

  async function ask(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    if (!getGeminiKey()) {
      setError('Add your Gemini API key in Settings first (gear icon, top right).');
      setAnswer(null);
      return;
    }
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const recentTreatments = [...treatments]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 3)
        .map((t) => ({ name: t.customName || t.type, date: t.date }));

      const coverage = Array.from(concernCounts.entries()).map(([id, v]) => ({
        concern: CONCERNS.find((c) => c.id === id)?.label ?? id,
        productCount: v.products.length,
      }));

      const text = await askSkincareQuestion({
        question: trimmed,
        activeProducts: active.map((p) => ({
          name: p.name,
          brand: p.brand,
          step: p.step,
          concerns: p.concerns,
          ingredients: p.ingredients,
        })),
        sensitivities: sensitivities.map((s) => s.ingredient),
        recentTreatments,
        concernCoverage: coverage,
      });
      setAnswer(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to get an answer.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <h3 className="font-display text-lg text-glow-800 mb-1 flex items-center gap-1.5">
        <Wand2 size={16} className="text-glow-600" /> Ask AI about your skin
      </h3>
      <p className="text-xs text-glow-600 mb-3">
        Free-form question. Answers use your active products, sensitivities, and recent
        treatments as context. Informational, not medical advice.
      </p>

      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="e.g. What can I add for redness?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void ask(question);
            }
          }}
          disabled={loading}
        />
        <button
          className="btn-primary"
          onClick={() => void ask(question)}
          disabled={loading || !question.trim()}
          aria-label="Ask"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>

      {!answer && !error && !loading && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQuestion(ex);
                void ask(ex);
              }}
              className="rounded-full border border-glow-200 bg-white/70 px-3 py-1 text-[11px] text-glow-700 hover:bg-glow-50"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-red-700 font-medium hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {answer && (
        <div className="mt-3 rounded-xl bg-glow-50 p-3 text-sm text-glow-900 whitespace-pre-wrap leading-relaxed">
          {answer}
        </div>
      )}
    </section>
  );
}

function evidenceWeight(e?: Evidence): number {
  if (e === 'high') return 3;
  if (e === 'moderate') return 2;
  if (e === 'limited') return 1;
  return 0;
}

function evidenceChipClass(e: Evidence): string {
  if (e === 'high') return 'bg-emerald-100 text-emerald-800';
  if (e === 'moderate') return 'bg-amber-100 text-amber-800';
  return 'bg-glow-100 text-glow-800';
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
