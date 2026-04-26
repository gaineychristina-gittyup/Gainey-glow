import { useEffect, useMemo, useState } from 'react';
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
  Star,
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
import PhotoThumb from '../components/PhotoThumb';
import PhotoViewer from '../components/PhotoViewer';
import { TreatmentEditor, AftercareList } from '../components/TreatmentEditor';

interface SinceTreatment {
  days: number;
  name: string;
}

type Event =
  | { kind: 'photo'; date: string; sortKey: number; photos: PhotoEntry[]; sinceTreatment?: SinceTreatment }
  | { kind: 'product-start'; date: string; sortKey: number; product: { name: string; brand?: string; step: string }; sinceTreatment?: SinceTreatment }
  | { kind: 'product-stop'; date: string; sortKey: number; product: { name: string; brand?: string; step: string }; sinceTreatment?: SinceTreatment }
  | { kind: 'treatment'; date: string; sortKey: number; treatment: Treatment }
  | { kind: 'comparison'; date: string; sortKey: number; comparison: Comparison; sinceTreatment?: SinceTreatment }
  | { kind: 'rating'; date: string; sortKey: number; rating: number; notes?: string; sinceTreatment?: SinceTreatment };

type Filter = 'all' | 'photos' | 'products' | 'treatments' | 'comparisons' | 'ratings';

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
  rating: { dot: 'bg-yellow-500', chip: 'bg-yellow-100', chipText: 'text-yellow-800' },
};

export default function Timeline() {
  const [viewing, setViewing] = useState<PhotoEntry | null>(null);
  const [editingTreatment, setEditingTreatment] = useState<Treatment | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [compact, setCompact] = useState(false);

  const [viewingComparison, setViewingComparison] = useState<Comparison | null>(null);
  const [pickedBefore, setPickedBefore] = useState<PhotoEntry | null>(null);
  const [pickedAfter, setPickedAfter] = useState<PhotoEntry | null>(null);
  const navigate = useNavigate();

  function pickAs(role: 'before' | 'after', p: PhotoEntry) {
    if (role === 'before') {
      // toggle off if already this photo
      if (pickedBefore?.id === p.id) {
        setPickedBefore(null);
        return;
      }
      // if this photo is currently After, free that slot first
      if (pickedAfter?.id === p.id) setPickedAfter(null);
      setPickedBefore(p);
    } else {
      if (pickedAfter?.id === p.id) {
        setPickedAfter(null);
        return;
      }
      if (pickedBefore?.id === p.id) setPickedBefore(null);
      setPickedAfter(p);
    }
  }

  function goCompare() {
    if (!pickedBefore || !pickedAfter) return;
    navigate('/compare', {
      state: {
        zone: pickedBefore.zone,
        beforeId: pickedBefore.id,
        afterId: pickedAfter.id,
      },
    });
  }

  const photos = useLiveQuery(() => db.photos.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const treatments = useLiveQuery(() => db.treatments.toArray(), []);
  const comparisons = useLiveQuery(() => db.comparisons.toArray(), []);
  const ratings = useLiveQuery(() => db.skinRatings.toArray(), []);

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
      out.push({
        kind: 'product-start',
        date: p.startedOn,
        sortKey: dateKey(p.startedOn) - 0.1,
        product: { name: p.name, brand: p.brand, step: p.step },
        sinceTreatment: lastTreatmentBefore(p.startedOn),
      });
      if (p.stoppedOn) {
        out.push({
          kind: 'product-stop',
          date: p.stoppedOn,
          sortKey: dateKey(p.stoppedOn) - 0.05,
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

    (ratings ?? []).forEach((r) => {
      out.push({
        kind: 'rating',
        date: r.date,
        // Ratings sort above photos for the same date.
        sortKey: dateKey(r.date) + 0.1,
        rating: r.rating,
        notes: r.notes,
        sinceTreatment: lastTreatmentBefore(r.date),
      });
    });

    return out.sort((a, b) => b.sortKey - a.sortKey);
  }, [photos, products, treatments, comparisons, ratings]);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (filter === 'all') return true;
      if (filter === 'photos') return e.kind === 'photo';
      if (filter === 'treatments') return e.kind === 'treatment';
      if (filter === 'products') return e.kind === 'product-start' || e.kind === 'product-stop';
      if (filter === 'comparisons') return e.kind === 'comparison';
      if (filter === 'ratings') return e.kind === 'rating';
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

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'photos', label: 'Photos' },
    { id: 'products', label: 'Products' },
    { id: 'treatments', label: 'Treatments' },
    { id: 'comparisons', label: 'Compares' },
    { id: 'ratings', label: 'Ratings' },
  ];

  return (
    <div className="space-y-4">
      <section className="card">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-display text-xl text-glow-800">Timeline</h2>
            <p className="text-xs text-glow-600">
              Everything that's happened to your skin, in order.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setCompact((c) => !c)}
              className="inline-flex items-center gap-1 rounded-full border bg-white/70 text-glow-700 border-glow-200 hover:bg-glow-50 px-3 py-1.5 text-xs font-medium"
              aria-label="Toggle compact view"
              title={compact ? 'Expand events' : 'Compact view'}
            >
              {compact ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
              {compact ? 'Expanded' : 'Compact'}
            </button>
            <button
              className="btn-primary"
              onClick={() => setEditingTreatment({ ...NEW_TREATMENT })}
            >
              <Plus size={16} /> Treatment
            </button>
          </div>
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

      {filtered.length === 0 ? (
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
            {filtered.map((e, i) => (
              <li key={`${e.kind}-${e.date}-${i}`} className="relative pl-8">
                <span
                  className={`absolute left-[10px] top-4 w-2.5 h-2.5 rounded-full ring-2 ring-rose-50 ${TYPE_STYLE[e.kind].dot}`}
                  aria-hidden
                />
                <TimelineCard
                  event={e}
                  compact={compact}
                  onPhoto={setViewing}
                  onEditTreatment={setEditingTreatment}
                  onOpenComparison={setViewingComparison}
                  onPickAs={pickAs}
                  pickedBeforeId={pickedBefore?.id}
                  pickedAfterId={pickedAfter?.id}
                />
              </li>
            ))}
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

      {(pickedBefore || pickedAfter) && (
        <div className="fixed left-0 right-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto card flex items-center gap-3 max-w-md w-full shadow-xl">
            <div className="text-xs text-glow-700 flex-1 min-w-0">
              <div className="font-semibold">Compare picks</div>
              <div className="truncate">
                {pickedBefore ? `B: ${fmtDate(pickedBefore.date)}` : 'B: —'}
                {' · '}
                {pickedAfter ? `A: ${fmtDate(pickedAfter.date)}` : 'A: —'}
              </div>
            </div>
            <button
              className="btn-ghost text-xs"
              onClick={() => {
                setPickedBefore(null);
                setPickedAfter(null);
              }}
            >
              Clear
            </button>
            <button
              className="btn-primary"
              disabled={!pickedBefore || !pickedAfter}
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
  onPickAs,
  pickedBeforeId,
  pickedAfterId,
}: {
  event: Event;
  compact: boolean;
  onPhoto: (p: PhotoEntry) => void;
  onEditTreatment: (t: Treatment) => void;
  onOpenComparison: (c: Comparison) => void;
  onPickAs: (role: 'before' | 'after', p: PhotoEntry) => void;
  pickedBeforeId?: number;
  pickedAfterId?: number;
}) {
  const since = event.kind === 'treatment' ? undefined : event.sinceTreatment;
  return (
    <div className={compact ? 'card !py-2.5' : 'card'}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-glow-700">
            {fmtDate(event.date)}
          </div>
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
          onPickAs={onPickAs}
          pickedBeforeId={pickedBeforeId}
          pickedAfterId={pickedAfterId}
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
    case 'rating':
      return <span className={cls}><Star size={12} /> Skin rating</span>;
  }
}

function Body({
  event,
  compact,
  onPhoto,
  onEditTreatment,
  onOpenComparison,
  onPickAs,
  pickedBeforeId,
  pickedAfterId,
}: {
  event: Event;
  compact: boolean;
  onPhoto: (p: PhotoEntry) => void;
  onEditTreatment: (t: Treatment) => void;
  onOpenComparison: (c: Comparison) => void;
  onPickAs: (role: 'before' | 'after', p: PhotoEntry) => void;
  pickedBeforeId?: number;
  pickedAfterId?: number;
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
            const isB = pickedBeforeId === p.id;
            const isA = pickedAfterId === p.id;
            return (
              <div
                key={p.id}
                className={`relative aspect-square rounded-lg overflow-hidden border-2 ${
                  isB || isA ? 'border-glow-600' : 'border-transparent'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onPhoto(p)}
                  className="absolute inset-0 block focus:outline-none"
                  aria-label={`Open photo from ${p.date}`}
                >
                  <PhotoThumb blob={p.thumb} className="w-full h-full object-cover" />
                </button>
                <span className="absolute bottom-0.5 left-0.5 rounded-full bg-white/90 text-glow-800 text-[9px] px-1.5 py-0.5 font-medium pointer-events-none">
                  {ZONES.find((z) => z.id === p.zone)?.label ?? p.zone}
                </span>
                <div className="absolute top-0.5 right-0.5 flex gap-0.5">
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onPickAs('before', p);
                    }}
                    aria-pressed={isB}
                    aria-label={isB ? 'Unset Before' : 'Set as Before'}
                    className={`h-5 min-w-[20px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center shadow-sm transition ${
                      isB
                        ? 'bg-glow-600 text-white'
                        : 'bg-white/90 text-glow-700 hover:bg-white'
                    }`}
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onPickAs('after', p);
                    }}
                    aria-pressed={isA}
                    aria-label={isA ? 'Unset After' : 'Set as After'}
                    className={`h-5 min-w-[20px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center shadow-sm transition ${
                      isA
                        ? 'bg-glow-700 text-white'
                        : 'bg-white/90 text-glow-700 hover:bg-white'
                    }`}
                  >
                    A
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      );
    case 'product-start':
    case 'product-stop':
      return (
        <div className="text-sm">
          <div className="font-medium text-glow-900">{event.product.name}</div>
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
    case 'rating':
      return <RatingBody rating={event.rating} notes={event.notes} compact={compact} />;
  }
}

function RatingBody({
  rating,
  notes,
  compact,
}: {
  rating: number;
  notes?: string;
  compact: boolean;
}) {
  const labels = ['Awful', 'Meh', 'OK', 'Good', 'Glowing'];
  if (compact) {
    return (
      <div className="text-xs text-glow-700">
        {rating > 0 ? `${rating}/5 · ${labels[rating - 1]}` : 'Note'}
        {notes ? ` · ${notes.slice(0, 60)}${notes.length > 60 ? '…' : ''}` : ''}
      </div>
    );
  }
  return (
    <div className="text-sm">
      {rating > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                size={16}
                className={n <= rating ? 'text-yellow-500 fill-yellow-400' : 'text-glow-200'}
              />
            ))}
          </div>
          <span className="text-glow-700 text-xs">
            {rating}/5 · {labels[rating - 1]}
          </span>
        </div>
      )}
      {notes && (
        <p className={`text-xs text-glow-800 italic whitespace-pre-wrap ${rating > 0 ? 'mt-1.5' : ''}`}>
          {notes}
        </p>
      )}
    </div>
  );
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
  const [open, setOpen] = useState(false);
  const plan = AFTERCARE[treatment.type];
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
      {!compact && (
        <>
          <button
            type="button"
            className="mt-2 text-[11px] font-semibold text-glow-700 underline"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Hide aftercare' : 'Show aftercare'}
          </button>
          {open && (
            <div className="mt-2 rounded-xl bg-glow-50 p-3 text-xs text-glow-800">
              <p className="font-medium mb-1">{plan.summary}</p>
              <AftercareList plan={plan} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function dateKey(iso: string): number {
  return Number(iso.replace(/-/g, ''));
}
