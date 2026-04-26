import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, FlaskConical, Plus, Sparkles, CircleStop } from 'lucide-react';
import {
  db,
  ZONES,
  TREATMENT_TYPES,
  PRODUCT_STEPS,
  type PhotoEntry,
  type Treatment,
} from '../db/schema';
import { daysBetween, fmtDate, todayISO } from '../lib/date';
import PhotoThumb from '../components/PhotoThumb';
import PhotoViewer from '../components/PhotoViewer';
import { TreatmentEditor } from './Treatments';

interface SinceTreatment {
  days: number;
  name: string;
}

type Event =
  | { kind: 'photo'; date: string; sortKey: number; photos: PhotoEntry[]; sinceTreatment?: SinceTreatment }
  | { kind: 'product-start'; date: string; sortKey: number; product: { name: string; brand?: string; step: string }; sinceTreatment?: SinceTreatment }
  | { kind: 'product-stop'; date: string; sortKey: number; product: { name: string; brand?: string; step: string }; sinceTreatment?: SinceTreatment }
  | { kind: 'treatment'; date: string; sortKey: number; treatment: { type: string; customName?: string; provider?: string; notes?: string } };

const NEW_TREATMENT: Treatment = { type: 'facial', date: todayISO() };

export default function Timeline() {
  const [viewing, setViewing] = useState<PhotoEntry | null>(null);
  const [editingTreatment, setEditingTreatment] = useState<Treatment | null>(null);
  const photos = useLiveQuery(() => db.photos.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const treatments = useLiveQuery(() => db.treatments.toArray(), []);

  const events: Event[] = useMemo(() => {
    const out: Event[] = [];

    // Sort treatments ascending so we can find the most-recent-prior one quickly.
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

    // Group photos by date
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
        treatment: { type: t.type, customName: t.customName, provider: t.provider, notes: t.notes },
      });
    });

    return out.sort((a, b) => b.sortKey - a.sortKey);
  }, [photos, products, treatments]);

  return (
    <div className="space-y-4">
      <section className="card flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-xl text-glow-800">Timeline</h2>
          <p className="text-xs text-glow-600">
            Everything that's happened to your skin, in order.
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setEditingTreatment({ ...NEW_TREATMENT })}
        >
          <Plus size={16} /> Treatment
        </button>
      </section>

      {events.length === 0 ? (
        <div className="card text-sm text-glow-600/80">
          Your timeline will fill in as you log photos, products, and treatments.
        </div>
      ) : (
        <div className="relative pl-6">
          <div className="absolute left-2 top-2 bottom-2 w-px bg-glow-200" />
          <ul className="space-y-4">
            {events.map((e, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[18px] top-2 w-3 h-3 rounded-full bg-glow-500 ring-2 ring-rose-50" />
                <TimelineCard event={e} onPhoto={setViewing} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {viewing && <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />}

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
  onPhoto,
}: {
  event: Event;
  onPhoto: (p: PhotoEntry) => void;
}) {
  const since = event.kind === 'treatment' ? undefined : event.sinceTreatment;
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-glow-700">
            {fmtDate(event.date)}
          </div>
          {since && (
            <div className="text-[11px] text-glow-500 mt-0.5">
              {since.days === 0
                ? `same day as ${since.name}`
                : `${since.days}d after ${since.name}`}
            </div>
          )}
        </div>
        <Badge kind={event.kind} />
      </div>
      <Body event={event} onPhoto={onPhoto} />
    </div>
  );
}

function Badge({ kind }: { kind: Event['kind'] }) {
  switch (kind) {
    case 'photo':
      return <span className="chip"><Camera size={12} /> Photo</span>;
    case 'product-start':
      return <span className="chip"><FlaskConical size={12} /> Product started</span>;
    case 'product-stop':
      return <span className="chip-warn"><CircleStop size={12} /> Product stopped</span>;
    case 'treatment':
      return <span className="chip" style={{ background: '#fce7f3' }}><Sparkles size={12} /> Treatment</span>;
  }
}

function Body({
  event,
  onPhoto,
}: {
  event: Event;
  onPhoto: (p: PhotoEntry) => void;
}) {
  switch (event.kind) {
    case 'photo':
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {event.photos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPhoto(p)}
              className="relative block focus:outline-none focus:ring-2 focus:ring-glow-500 rounded-xl"
            >
              <PhotoThumb blob={p.thumb} className="aspect-square w-full object-cover rounded-xl" />
              <span className="absolute bottom-1 left-1 chip text-[10px] bg-white/90">
                {ZONES.find((z) => z.id === p.zone)?.label ?? p.zone}
              </span>
            </button>
          ))}
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
      return (
        <div className="text-sm">
          <div className="font-medium text-glow-900">
            {event.treatment.customName || TREATMENT_TYPES.find((x) => x.id === event.treatment.type)?.label}
          </div>
          {event.treatment.provider && (
            <div className="text-xs text-glow-600">{event.treatment.provider}</div>
          )}
          {event.treatment.notes && (
            <div className="text-xs text-glow-700 italic mt-1">{event.treatment.notes}</div>
          )}
        </div>
      );
  }
}

function dateKey(iso: string): number {
  return Number(iso.replace(/-/g, ''));
}
