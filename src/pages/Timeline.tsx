import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  Camera,
  ChevronDown,
  ChevronUp,
  CircleStop,
  FlaskConical,
  Images,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  db,
  ZONES,
  TREATMENT_TYPES,
  PRODUCT_STEPS,
  type Comparison,
  type PhotoEntry,
  type Treatment,
} from '../db/schema';
import { AFTERCARE } from '../data/aftercare';
import { daysBetween, fmtDate, todayISO } from '../lib/date';
import { askPreTreatmentGuidance, type PreTreatmentPlan } from '../lib/gemini';
import { getGeminiKey } from '../lib/settings';
import PhotoThumb from '../components/PhotoThumb';
import PhotoViewer from '../components/PhotoViewer';
import { TreatmentEditor, AftercareList } from '../components/TreatmentEditor';

interface SinceTreatment {
  days: number;
  name: string;
}

type Event =
  | { kind: 'photo'; date: string; sortKey: number; photos: PhotoEntry[]; sinceTreatment?: SinceTreatment }
  | { kind: 'product-start'; date: string; sortKey: number; productId?: number; product: { name: string; brand?: string; step: string }; sinceTreatment?: SinceTreatment }
  | { kind: 'product-stop'; date: string; sortKey: number; productId?: number; product: { name: string; brand?: string; step: string }; sinceTreatment?: SinceTreatment }
  | { kind: 'treatment'; date: string; sortKey: number; treatment: Treatment }
  | { kind: 'comparison'; date: string; sortKey: number; comparison: Comparison; sinceTreatment?: SinceTreatment };

type Filter = 'all' | 'photos' | 'products' | 'treatments' | 'comparisons';

const NEW_TREATMENT: Treatment = { type: 'facial', date: todayISO() };

// Per-type colors for badges and timeline dots.
const TYPE_STYLE: Record<
  Event['kind'],
  { dot: string; chip: string; chipText: string }
> = {
  photo: { dot: 'bg-sky-500', chip: 'bg-sky-100', chipText: 'text-sky-800' },
  'product-start': { dot: 'bg-emerald-500', chip: 'bg-emerald-100', chipText: 'text-emerald-800' },
  'product-stop': { dot: 'bg-amber-500', chip: 'bg-amber-100', chipText: 'text-amber-800' },
  treatment: { dot: 'bg-violet-500', chip: 'bg-violet-100', chipText: 'text-violet-800' },
  comparison: { dot: 'bg-rose-500', chip: 'bg-rose-100', chipText: 'text-rose-800' },
};

export default function Timeline() {
  const [viewing, setViewing] = useState<PhotoEntry | null>(null);
  const [editingTreatment, setEditingTreatment] = useState<Treatment | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [compact, setCompact] = useState(false);

  const [viewingComparison, setViewingComparison] = useState<Comparison | null>(null);
  const [picked, setPicked] = useState<PhotoEntry[]>([]);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [calendarMonths, setCalendarMonths] = useState<3 | 6>(3);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const navigate = useNavigate();

  function togglePick(p: PhotoEntry) {
    setPicked((cur) => {
      const idx = cur.findIndex((x) => x.id === p.id);
      if (idx >= 0) return cur.filter((_, i) => i !== idx);
      if (cur.length < 2) return [...cur, p];
      // 2 already picked — replace the older one so the new pick wins
      const sorted = [...cur].sort((a, b) => a.date.localeCompare(b.date));
      return [sorted[1], p];
    });
  }

  // Auto-derive Before (older) and After (newer) from the two picks.
  const orderedPicks = useMemo(() => {
    const sorted = [...picked].sort(
      (a, b) => a.date.localeCompare(b.date) || a.takenAt - b.takenAt,
    );
    return { before: sorted[0], after: sorted[1] };
  }, [picked]);

  function goCompare() {
    if (!orderedPicks.before || !orderedPicks.after) return;
    navigate('/compare', {
      state: {
        zone: orderedPicks.before.zone,
        beforeId: orderedPicks.before.id,
        afterId: orderedPicks.after.id,
      },
    });
  }

  const photos = useLiveQuery(() => db.photos.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const treatments = useLiveQuery(() => db.treatments.toArray(), []);
  const comparisons = useLiveQuery(() => db.comparisons.toArray(), []);
  const events: Event[] = useMemo(() => {
    const out: Event[] = [];

    const treatmentsAsc = [...(treatments ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    const lastTreatmentBefore = (date: string): SinceTreatment | undefined => {
      let best: Treatment | undefined;
      for (const t of treatmentsAsc) {
        if (t.date < date) best = t;
        else break;
      }
      if (!best) return undefined;
      const name =
        best.customName || TREATMENT_TYPES.find((x) => x.id === best!.type)?.label || 'treatment';
      return { days: daysBetween(best.date, date), name };
    };

    const photoMap = new Map<string, PhotoEntry[]>();
    (photos ?? []).forEach((p) => {
      const arr = photoMap.get(p.date) ?? [];
      arr.push(p);
      photoMap.set(p.date, arr);
    });
    photoMap.forEach((list, date) => {
      out.push({
        kind: 'photo',
        date,
        sortKey: dateKey(date),
        photos: list,
        sinceTreatment: lastTreatmentBefore(date),
      });
    });

    (products ?? []).forEach((p) => {
      if (p.startedOn) {
        out.push({
          kind: 'product-start',
          date: p.startedOn,
          sortKey: dateKey(p.startedOn) - 0.1,
          productId: p.id,
          product: { name: p.name, brand: p.brand, step: p.step },
          sinceTreatment: lastTreatmentBefore(p.startedOn),
        });
      }
      if (p.stoppedOn) {
        out.push({
          kind: 'product-stop',
          date: p.stoppedOn,
          sortKey: dateKey(p.stoppedOn) - 0.05,
          productId: p.id,
          product: { name: p.name, brand: p.brand, step: p.step },
          sinceTreatment: lastTreatmentBefore(p.stoppedOn),
        });
      }
    });

    (treatments ?? []).forEach((t) => {
      out.push({
        kind: 'treatment',
        date: t.date,
        sortKey: dateKey(t.date) - 0.2,
        treatment: t,
      });
    });

    (comparisons ?? []).forEach((c) => {
      out.push({
        kind: 'comparison',
        date: c.date,
        // Saved comparisons sort just below photos for the same date
        sortKey: dateKey(c.date) + 0.05,
        comparison: c,
        sinceTreatment: lastTreatmentBefore(c.date),
      });
    });

    return out.sort((a, b) => b.sortKey - a.sortKey);
  }, [photos, products, treatments, comparisons]);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (filter === 'all') return true;
      if (filter === 'photos') return e.kind === 'photo';
      if (filter === 'treatments') return e.kind === 'treatment';
      if (filter === 'products') return e.kind === 'product-start' || e.kind === 'product-stop';
      if (filter === 'comparisons') return e.kind === 'comparison';
      return true;
    });
  }, [events, filter]);

  const activeAftercare = useMemo(() => {
    if (!treatments) return [];
    const today = todayISO();
    return treatments.filter((t) => {
      const plan = AFTERCARE[t.type];
      const elapsed = daysBetween(t.date, today);
      return elapsed >= 0 && elapsed <= plan.durationDays;
    });
  }, [treatments]);

  const upcomingTreatments = useMemo(() => {
    if (!treatments) return [];
    const today = todayISO();
    return treatments
      .filter((t) => t.date > today)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [treatments]);

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'photos', label: 'Photos' },
    { id: 'products', label: 'Products' },
    { id: 'treatments', label: 'Treatments' },
    { id: 'comparisons', label: 'Compares' },
  ];

  return (
    <div className="space-y-4">
      <section className="card">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-display text-xl text-glow-800">Timeline</h2>
          <button
            className="btn-primary"
            onClick={() => setEditingTreatment({ ...NEW_TREATMENT })}
          >
            <Plus size={16} /> Treatment
          </button>
        </div>
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <div className="inline-flex rounded-full border border-glow-200 overflow-hidden">
            {(['list', 'calendar'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setView(m)}
                className={`px-3 py-1.5 text-xs font-medium transition ${
                  view === m
                    ? 'bg-glow-600 text-white'
                    : 'bg-white text-glow-700 hover:bg-glow-50'
                }`}
              >
                {m === 'list' ? 'List' : 'Calendar'}
              </button>
            ))}
          </div>
          {view === 'list' && (
            <button
              onClick={() => setCompact((c) => !c)}
              className="inline-flex items-center gap-1 rounded-full border bg-white/70 text-glow-700 border-glow-200 hover:bg-glow-50 px-3 py-1.5 text-xs font-medium"
              aria-label="Toggle compact view"
              title={compact ? 'Expand events' : 'Compact view'}
            >
              {compact ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
              {compact ? 'Expanded' : 'Compact'}
            </button>
          )}
          {view === 'calendar' && (
            <div className="inline-flex rounded-full border border-glow-200 overflow-hidden">
              {([3, 6] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setCalendarMonths(m)}
                  className={`px-3 py-1.5 text-xs font-medium transition ${
                    calendarMonths === m
                      ? 'bg-glow-600 text-white'
                      : 'bg-white text-glow-700 hover:bg-glow-50'
                  }`}
                >
                  {m}mo
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 -mx-1 px-1 flex gap-1.5 overflow-x-auto pb-1">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${
                filter === f.id
                  ? 'bg-glow-600 text-white border-glow-600'
                  : 'bg-white/70 text-glow-700 border-glow-200 hover:bg-glow-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {upcomingTreatments.length > 0 && (
        <UpcomingTreatmentsCard
          treatments={upcomingTreatments}
          onEdit={setEditingTreatment}
        />
      )}

      {activeAftercare.length > 0 && (
        <section className="card border-glow-300 bg-glow-50/80">
          <div className="flex items-center gap-2 text-glow-800 font-display text-lg mb-2">
            <CalendarClock size={18} /> Active aftercare
          </div>
          <div className="space-y-3">
            {activeAftercare.map((t) => {
              const plan = AFTERCARE[t.type];
              const elapsed = daysBetween(t.date, todayISO());
              const remaining = Math.max(0, plan.durationDays - elapsed);
              return (
                <div key={t.id} className="rounded-xl bg-white/80 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <button
                      type="button"
                      className="font-medium text-glow-900 hover:underline text-left"
                      onClick={() => setEditingTreatment(t)}
                    >
                      {t.customName || TREATMENT_TYPES.find((x) => x.id === t.type)?.label}
                    </button>
                    <span className="text-[11px] text-glow-600 shrink-0">
                      {remaining === 0
                        ? 'last day'
                        : `day ${elapsed + 1} of ${plan.durationDays + 1} · ${remaining}d left`}
                    </span>
                  </div>
                  <p className="text-xs text-glow-700 mt-0.5">{plan.summary}</p>
                  <AftercareList plan={plan} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {view === 'calendar' ? (
        <CalendarView
          months={calendarMonths}
          events={filtered}
          onPhoto={setViewing}
          onOpenComparison={setViewingComparison}
          onEditTreatment={setEditingTreatment}
          onEditProduct={(pid) => navigate('/products', { state: { editProductId: pid } })}
        />
      ) : filtered.length === 0 ? (
        <div className="card text-sm text-glow-600/80">
          {events.length === 0
            ? "Your timeline will fill in as you log photos, products, and treatments."
            : 'No events match this filter.'}
        </div>
      ) : (
        // The rail and dots share the same parent so they always line up.
        <div className="relative">
          <div className="absolute left-[14px] top-2 bottom-2 w-px bg-glow-200" />
          <ul className={compact ? 'space-y-2' : 'space-y-4'}>
            {(() => {
              let lastYear: number | null = null;
              return filtered.map((e, i) => {
                const year = Number(e.date.slice(0, 4));
                const showYear = year !== lastYear;
                lastYear = year;
                return (
                  <Fragment key={`${e.kind}-${e.date}-${i}`}>
                    {showYear && <YearDivider year={year} />}
                    <li className="relative pl-8">
                      <span
                        className={`absolute left-[10px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full ring-2 ring-rose-50 ${TYPE_STYLE[e.kind].dot}`}
                        aria-hidden
                      />
                      <TimelineCard
                        event={e}
                        compact={compact}
                        onPhoto={setViewing}
                        onEditTreatment={setEditingTreatment}
                        onOpenComparison={setViewingComparison}
                        onPickPhoto={togglePick}
                        pickedIds={picked.map((x) => x.id!)}
                        onOpenDay={(date) => setOpenDate(date)}
                        onEditProduct={(pid) => navigate('/products', { state: { editProductId: pid } })}
                      />
                    </li>
                  </Fragment>
                );
              });
            })()}
          </ul>
        </div>
      )}

      {viewing && <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />}
      {viewingComparison && (
        <ComparisonViewer
          comparison={viewingComparison}
          onClose={() => setViewingComparison(null)}
        />
      )}

      {openDate && (
        <DayDetailModal
          date={openDate}
          events={events.filter((e) => e.date === openDate)}
          onClose={() => setOpenDate(null)}
          onPhoto={(p) => {
            setOpenDate(null);
            setViewing(p);
          }}
          onOpenComparison={(c) => {
            setOpenDate(null);
            setViewingComparison(c);
          }}
          onEditTreatment={(t) => {
            setOpenDate(null);
            setEditingTreatment(t);
          }}
          onEditProduct={(productId) => {
            setOpenDate(null);
            navigate('/products', { state: { editProductId: productId } });
          }}
        />
      )}

      {picked.length > 0 && (
        <div className="fixed left-0 right-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto card flex items-center gap-3 max-w-md w-full shadow-xl">
            <div className="text-xs text-glow-700 flex-1 min-w-0">
              <div className="font-semibold">
                {picked.length === 1 ? 'Pick one more photo' : 'Compare picks'}
              </div>
              <div className="truncate">
                {orderedPicks.before
                  ? `Before: ${fmtDate(orderedPicks.before.date)}`
                  : '—'}
                {' · '}
                {orderedPicks.after
                  ? `After: ${fmtDate(orderedPicks.after.date)}`
                  : '—'}
              </div>
            </div>
            <button className="btn-ghost text-xs" onClick={() => setPicked([])}>
              Clear
            </button>
            <button
              className="btn-primary"
              disabled={picked.length !== 2}
              onClick={goCompare}
            >
              Compare →
            </button>
          </div>
        </div>
      )}

      {editingTreatment && (
        <TreatmentEditor
          initial={editingTreatment}
          onClose={() => setEditingTreatment(null)}
          onSave={async (t) => {
            const cleaned: Treatment = {
              ...t,
              customName: t.customName?.trim() || undefined,
              provider: t.provider?.trim() || undefined,
              notes: t.notes?.trim() || undefined,
            };
            if (cleaned.id) await db.treatments.put(cleaned);
            else await db.treatments.add(cleaned);
            setEditingTreatment(null);
          }}
        />
      )}
    </div>
  );
}

function TimelineCard({
  event,
  compact,
  onPhoto,
  onEditTreatment,
  onOpenComparison,
  onPickPhoto,
  pickedIds,
  onOpenDay,
  onEditProduct,
}: {
  event: Event;
  compact: boolean;
  onPhoto: (p: PhotoEntry) => void;
  onEditTreatment: (t: Treatment) => void;
  onOpenComparison: (c: Comparison) => void;
  onPickPhoto: (p: PhotoEntry) => void;
  pickedIds: number[];
  onOpenDay: (date: string) => void;
  onEditProduct: (productId: number) => void;
}) {
  const since = event.kind === 'treatment' ? undefined : event.sinceTreatment;
  return (
    <div className={compact ? 'card !py-2.5' : 'card'}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <button
            type="button"
            className="text-xs font-semibold uppercase tracking-wide text-glow-700 hover:underline"
            onClick={() => onOpenDay(event.date)}
            title="Open day"
          >
            {fmtDate(event.date)}
          </button>
          {since && !compact && (
            <div className="text-[11px] text-glow-500 mt-0.5">
              {since.days === 0
                ? `same day as ${since.name}`
                : `${since.days}d after ${since.name}`}
            </div>
          )}
        </div>
        <Badge kind={event.kind} />
      </div>
      <div className={compact ? 'mt-1' : 'mt-2'}>
        <Body
          event={event}
          compact={compact}
          onPhoto={onPhoto}
          onEditTreatment={onEditTreatment}
          onOpenComparison={onOpenComparison}
          onPickPhoto={onPickPhoto}
          pickedIds={pickedIds}
          onEditProduct={onEditProduct}
        />
      </div>
    </div>
  );
}

function Badge({ kind }: { kind: Event['kind'] }) {
  const style = TYPE_STYLE[kind];
  const cls = `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${style.chip} ${style.chipText}`;
  switch (kind) {
    case 'photo':
      return <span className={cls}><Camera size={12} /> Photo</span>;
    case 'product-start':
      return <span className={cls}><FlaskConical size={12} /> Product started</span>;
    case 'product-stop':
      return <span className={cls}><CircleStop size={12} /> Product stopped</span>;
    case 'treatment':
      return <span className={cls}><Sparkles size={12} /> Treatment</span>;
    case 'comparison':
      return <span className={cls}><Images size={12} /> Comparison</span>;
  }
}

function Body({
  event,
  compact,
  onPhoto,
  onEditTreatment,
  onOpenComparison,
  onPickPhoto,
  pickedIds,
  onEditProduct,
}: {
  event: Event;
  compact: boolean;
  onPhoto: (p: PhotoEntry) => void;
  onEditTreatment: (t: Treatment) => void;
  onOpenComparison: (c: Comparison) => void;
  onPickPhoto: (p: PhotoEntry) => void;
  pickedIds: number[];
  onEditProduct?: (productId: number) => void;
}) {
  switch (event.kind) {
    case 'photo':
      if (compact) {
        return (
          <div className="text-xs text-glow-700">
            {event.photos.length} photo{event.photos.length === 1 ? '' : 's'} ·{' '}
            {Array.from(new Set(event.photos.map((p) => ZONES.find((z) => z.id === p.zone)?.label ?? p.zone))).join(', ')}
          </div>
        );
      }
      return (
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
          {event.photos.map((p) => {
            const pos = pickedIds.indexOf(p.id!);
            const picked = pos >= 0;
            return (
              <div
                key={p.id}
                className={`relative aspect-square rounded-lg overflow-hidden border-2 ${
                  picked ? 'border-glow-600' : 'border-transparent'
                }`}
              >
                <PhotoTimelineButton
                  photo={p}
                  picked={picked}
                  onTap={() => onPhoto(p)}
                  onLongPress={() => onPickPhoto(p)}
                />
                <span className="absolute bottom-0.5 left-0.5 rounded-full bg-white/90 text-glow-800 text-[9px] px-1.5 py-0.5 font-medium pointer-events-none">
                  {ZONES.find((z) => z.id === p.zone)?.label ?? p.zone}
                </span>
                {picked && (
                  <span className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-glow-600 text-white text-[10px] font-bold flex items-center justify-center shadow-sm pointer-events-none">
                    {pos + 1}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      );
    case 'product-start':
    case 'product-stop':
      return (
        <div className="text-sm">
          {event.productId && onEditProduct ? (
            <button
              type="button"
              onClick={() => onEditProduct(event.productId!)}
              className="font-medium text-glow-900 hover:underline text-left"
            >
              {event.product.name}
            </button>
          ) : (
            <div className="font-medium text-glow-900">{event.product.name}</div>
          )}
          <div className="text-xs text-glow-600">
            {event.product.brand ? `${event.product.brand} · ` : ''}
            {PRODUCT_STEPS.find((s) => s.id === event.product.step)?.label}
          </div>
        </div>
      );
    case 'treatment':
      return <TreatmentBody treatment={event.treatment} compact={compact} onEdit={onEditTreatment} />;
    case 'comparison':
      return (
        <ComparisonBody
          comparison={event.comparison}
          compact={compact}
          onOpen={onOpenComparison}
        />
      );
  }
}

function ComparisonBody({
  comparison,
  compact,
  onOpen,
}: {
  comparison: Comparison;
  compact: boolean;
  onOpen: (c: Comparison) => void;
}) {
  if (compact) {
    return (
      <button
        type="button"
        className="text-xs text-glow-700 hover:underline text-left"
        onClick={() => onOpen(comparison)}
      >
        {comparison.caption || `Comparison · ${ZONES.find((z) => z.id === comparison.zone)?.label}`}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(comparison)}
      className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-glow-500 rounded-xl"
    >
      <PhotoThumb
        blob={comparison.preview}
        className="w-full max-h-72 object-cover rounded-xl"
      />
      {comparison.caption && (
        <div className="text-xs text-glow-700 italic mt-1.5">{comparison.caption}</div>
      )}
      <div className="text-[11px] text-glow-500 mt-0.5">
        {ZONES.find((z) => z.id === comparison.zone)?.label}
        {comparison.referenceLabel ? ` · vs. ${comparison.referenceLabel}` : ''}
      </div>
    </button>
  );
}

function ComparisonViewer({
  comparison,
  onClose,
}: {
  comparison: Comparison;
  onClose: () => void;
}) {
  const [src, setSrc] = useState<string>();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(comparison.preview);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [comparison.preview]);

  async function del() {
    if (!comparison.id) return;
    await db.comparisons.delete(comparison.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 text-white">
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{fmtDate(comparison.date)}</span>
          <span className="text-[11px] opacity-80">
            {ZONES.find((z) => z.id === comparison.zone)?.label}
            {comparison.referenceLabel ? ` · ${comparison.referenceLabel}` : ''}
          </span>
        </div>
        <button onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-white/10">
          ✕
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center px-3">
        {src && <img src={src} alt="" className="max-h-full max-w-full rounded-xl" />}
      </div>
      {comparison.caption && (
        <div className="px-4 py-2 text-sm text-white/90 italic max-h-24 overflow-y-auto text-center">
          {comparison.caption}
        </div>
      )}
      <div className="bg-black flex items-center justify-end px-3 py-3 gap-2">
        {confirming ? (
          <>
            <span className="text-xs text-white/80 mr-2">Delete this comparison?</span>
            <button
              className="rounded-full px-4 py-2 text-sm font-medium bg-white/15 text-white hover:bg-white/25"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
            <button
              className="rounded-full px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700"
              onClick={del}
            >
              Delete
            </button>
          </>
        ) : (
          <button
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium bg-red-600/90 text-white hover:bg-red-600"
            onClick={() => setConfirming(true)}
          >
            <Trash2 size={16} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

function TreatmentBody({
  treatment,
  compact,
  onEdit,
}: {
  treatment: Treatment;
  compact: boolean;
  onEdit: (t: Treatment) => void;
}) {
  const label =
    treatment.customName || TREATMENT_TYPES.find((x) => x.id === treatment.type)?.label;
  return (
    <div className="text-sm">
      <button
        type="button"
        className="font-medium text-glow-900 hover:underline text-left"
        onClick={() => onEdit(treatment)}
      >
        {label}
      </button>
      {!compact && treatment.provider && (
        <div className="text-xs text-glow-600">{treatment.provider}</div>
      )}
      {!compact && treatment.notes && (
        <div className="text-xs text-glow-700 italic mt-1">{treatment.notes}</div>
      )}
      {/* Aftercare details available inside the editor via Edit. */}
    </div>
  );
}

function dateKey(iso: string): number {
  return Number(iso.replace(/-/g, ''));
}

function UpcomingTreatmentsCard({
  treatments,
  onEdit,
}: {
  treatments: Treatment[];
  onEdit: (t: Treatment) => void;
}) {
  const [guidanceFor, setGuidanceFor] = useState<Treatment | null>(null);
  return (
    <section className="card border-amber-200 bg-amber-50/60">
      <div className="flex items-center gap-2 text-amber-900 font-display text-lg mb-2">
        <CalendarClock size={18} /> Upcoming treatments
      </div>
      <div className="space-y-3">
        {treatments.map((t) => {
          const days = daysBetween(todayISO(), t.date);
          const label = t.customName || TREATMENT_TYPES.find((x) => x.id === t.type)?.label;
          return (
            <div key={t.id} className="rounded-xl bg-white/80 p-3">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <button
                  type="button"
                  className="font-medium text-glow-900 hover:underline text-left"
                  onClick={() => onEdit(t)}
                >
                  {label}
                </button>
                <span className="text-[11px] text-glow-700">
                  in {days} day{days === 1 ? '' : 's'} · {fmtDate(t.date)}
                </span>
              </div>
              {t.provider && (
                <div className="text-xs text-glow-600 mt-0.5">{t.provider}</div>
              )}
              <button
                type="button"
                onClick={() => setGuidanceFor(t)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-amber-700"
              >
                <Sparkles size={12} /> Pre-treatment guidance (AI)
              </button>
            </div>
          );
        })}
      </div>
      {guidanceFor && (
        <PreTreatmentGuidanceModal
          treatment={guidanceFor}
          onClose={() => setGuidanceFor(null)}
        />
      )}
    </section>
  );
}

function PreTreatmentGuidanceModal({
  treatment,
  onClose,
}: {
  treatment: Treatment;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PreTreatmentPlan | null>(null);

  const products = useLiveQuery(() => db.products.toArray(), []);
  const sensitivities = useLiveQuery(() => db.sensitivities.toArray(), []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!getGeminiKey()) {
        setError('Add your Gemini API key in Settings first (gear icon, top right).');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const today = todayISO();
        const active = (products ?? []).filter(
          (p) => (!p.startedOn || p.startedOn <= today) && (!p.stoppedOn || p.stoppedOn >= today),
        );
        const result = await askPreTreatmentGuidance({
          treatmentName:
            treatment.customName ||
            TREATMENT_TYPES.find((x) => x.id === treatment.type)?.label ||
            'Treatment',
          treatmentDate: treatment.date,
          daysAway: daysBetween(today, treatment.date),
          activeProducts: active.map((p) => ({
            name: p.name,
            brand: p.brand,
            ingredients: p.ingredients,
          })),
          sensitivities: (sensitivities ?? []).map((s) => s.ingredient),
        });
        if (!cancelled) setPlan(result);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to get guidance.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (products && sensitivities) void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, sensitivities]);

  const label =
    treatment.customName || TREATMENT_TYPES.find((x) => x.id === treatment.type)?.label;
  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-3">
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-lg text-glow-800 flex items-center gap-1.5">
            <Sparkles size={16} className="text-glow-600" /> Before {label}
          </h3>
          <button className="btn-ghost text-xs" onClick={onClose}>Close</button>
        </div>
        <p className="text-xs text-glow-600 mb-3">
          AI suggestions based on your active routine. Defer to your provider's specific
          instructions — this is informational, not medical advice.
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-glow-700 py-6 justify-center">
            Asking Gemini…
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        )}

        {plan && (
          <div className="space-y-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-glow-700 mb-1">
                Pause these
              </div>
              {plan.productsToPause.length === 0 ? (
                <p className="text-sm text-glow-600/80">
                  Nothing in your routine needs to be paused for this treatment.
                </p>
              ) : (
                <ul className="space-y-2">
                  {plan.productsToPause.map((p, i) => (
                    <li key={i} className="rounded-xl bg-glow-50 p-3">
                      <div className="flex items-baseline justify-between gap-2 flex-wrap">
                        <span className="font-medium text-glow-900">{p.name}</span>
                        <span className="text-xs text-amber-700 font-semibold">
                          stop {p.daysBefore}d before
                        </span>
                      </div>
                      <p className="text-xs text-glow-700 mt-0.5">{p.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {plan.generalAdvice.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-glow-700 mb-1">
                  General tips
                </div>
                <ul className="list-disc pl-4 space-y-1 text-sm text-glow-800">
                  {plan.generalAdvice.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function PhotoTimelineButton({
  photo,
  picked,
  onTap,
  onLongPress,
}: {
  photo: PhotoEntry;
  picked: boolean;
  onTap: () => void;
  onLongPress: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFiredRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  function clear() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    longFiredRef.current = false;
    startRef.current = { x: e.clientX, y: e.clientY };
    clear();
    timerRef.current = setTimeout(() => {
      longFiredRef.current = true;
      onLongPress();
      // tiny haptic on supporting devices
      if ('vibrate' in navigator) {
        try { navigator.vibrate?.(10); } catch { /* ignore */ }
      }
    }, 450);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.hypot(dx, dy) > 8) clear();
  }

  function onPointerUp() {
    if (timerRef.current && !longFiredRef.current) {
      clear();
      onTap();
    } else {
      clear();
    }
  }

  function onPointerCancel() {
    clear();
  }

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      className="absolute inset-0 block focus:outline-none touch-none"
      aria-label={picked ? 'Picked for compare' : 'Open photo (long-press to pick for compare)'}
    >
      <PhotoThumb blob={photo.thumb} className="w-full h-full object-cover" />
    </button>
  );
}

function YearDivider({ year }: { year: number }) {
  return (
    <li className="relative pl-8 mt-4 first:mt-0">
      <div className="flex items-center gap-3">
        <div className="font-display text-2xl text-glow-800 tracking-tight">{year}</div>
        <div className="flex-1 h-px bg-glow-200" />
      </div>
    </li>
  );
}

function CalendarView({
  months,
  events,
  onPhoto,
  onOpenComparison,
  onEditTreatment,
  onEditProduct,
}: {
  months: 3 | 6;
  events: Event[];
  onPhoto: (p: PhotoEntry) => void;
  onOpenComparison: (c: Comparison) => void;
  onEditTreatment: (t: Treatment) => void;
  onEditProduct: (productId: number) => void;
}) {
  const [openDate, setOpenDate] = useState<string | null>(null);

  // Group events by ISO date
  const byDate = useMemo(() => {
    const map = new Map<string, Event[]>();
    events.forEach((e) => {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    });
    return map;
  }, [events]);

  // Build the months to render: ending with current month, going back N-1.
  const monthList = useMemo(() => {
    const out: { y: number; m: number }[] = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({ y: d.getFullYear(), m: d.getMonth() });
    }
    return out;
  }, [months]);

  return (
    <>
      <div className="space-y-4">
        {monthList.map((mo) => (
          <MonthGrid
            key={`${mo.y}-${mo.m}`}
            year={mo.y}
            month={mo.m}
            byDate={byDate}
            onOpen={setOpenDate}
          />
        ))}
        <div className="card text-[11px] text-glow-600 flex flex-wrap gap-2">
          <span>Legend:</span>
          {([
            ['photo', 'Photo'],
            ['product-start', 'Product'],
            ['treatment', 'Treatment'],
            ['comparison', 'Compare'],
          ] as const).map(([k, label]) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${TYPE_STYLE[k].dot}`} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {openDate && (
        <DayDetailModal
          date={openDate}
          events={byDate.get(openDate) ?? []}
          onClose={() => setOpenDate(null)}
          onPhoto={onPhoto}
          onOpenComparison={onOpenComparison}
          onEditTreatment={onEditTreatment}
          onEditProduct={onEditProduct}
        />
      )}
    </>
  );
}

function MonthGrid({
  year,
  month,
  byDate,
  onOpen,
}: {
  year: number;
  month: number; // 0-11
  byDate: Map<string, Event[]>;
  onOpen: (date: string) => void;
}) {
  const monthName = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayISOStr = todayISO();

  return (
    <section className="card">
      <h3 className="font-display text-base text-glow-800 mb-2">{monthName}</h3>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-glow-500 mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="aspect-square" />;
          const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const dayEvents = byDate.get(iso) ?? [];
          const isFuture = iso > todayISOStr;
          const isToday = iso === todayISOStr;
          const ratingBg = '';
          // Distinct event-type dots (max 4 visible)
          const types = Array.from(new Set(dayEvents.map((e) => e.kind)));
          return (
            <button
              key={i}
              type="button"
              onClick={() => dayEvents.length > 0 && onOpen(iso)}
              disabled={dayEvents.length === 0}
              className={`aspect-square rounded-md text-[10px] flex flex-col items-center justify-start p-0.5 ${
                ratingBg || (dayEvents.length > 0 ? 'bg-glow-50' : 'bg-white/30')
              } ${isFuture ? 'opacity-40' : ''} ${
                isToday ? 'ring-1 ring-glow-500' : ''
              } ${dayEvents.length > 0 ? 'hover:ring-1 hover:ring-glow-400' : ''}`}
              aria-label={`${iso} — ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`}
            >
              <span className={`text-[10px] ${dayEvents.length > 0 ? 'font-semibold text-glow-900' : 'text-glow-600'}`}>
                {d}
              </span>
              {types.length > 0 && (
                <div className="mt-auto flex gap-0.5 pb-0.5">
                  {types.slice(0, 4).map((t) => (
                    <span
                      key={t}
                      className={`h-1 w-1 rounded-full ${TYPE_STYLE[t].dot}`}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}


function DayDetailModal({
  date,
  events,
  onClose,
  onPhoto,
  onOpenComparison,
  onEditTreatment,
  onEditProduct,
}: {
  date: string;
  events: Event[];
  onClose: () => void;
  onPhoto: (p: PhotoEntry) => void;
  onOpenComparison: (c: Comparison) => void;
  onEditTreatment: (t: Treatment) => void;
  onEditProduct: (productId: number) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-3">
      <div className="card w-full max-w-md max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg text-glow-800">{fmtDate(date)}</h3>
          <button className="btn-ghost text-xs" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        <ul className="space-y-2">
          {events.map((e, i) => (
            <li
              key={i}
              className="rounded-xl border border-glow-100 p-2"
            >
              <div className="flex items-center justify-between mb-1">
                <Badge kind={e.kind} />
                {e.kind === 'product-start' || e.kind === 'product-stop' ? (
                  e.productId ? (
                    <button
                      className="text-[11px] text-glow-700 underline"
                      onClick={() => onEditProduct(e.productId!)}
                    >
                      Edit product
                    </button>
                  ) : null
                ) : null}
              </div>
              <Body
                event={e}
                compact={false}
                onPhoto={onPhoto}
                onEditTreatment={onEditTreatment}
                onOpenComparison={onOpenComparison}
                onPickPhoto={() => {}}
                pickedIds={[]}
              />
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-end">
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
