import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, FlaskConical, Sparkles, CircleStop } from 'lucide-react';
import { db, ZONES, TREATMENT_TYPES, PRODUCT_STEPS, type PhotoEntry } from '../db/schema';
import { fmtDate } from '../lib/date';
import PhotoThumb from '../components/PhotoThumb';
import PhotoViewer from '../components/PhotoViewer';

type Event =
  | { kind: 'photo'; date: string; sortKey: number; photos: PhotoEntry[] }
  | { kind: 'product-start'; date: string; sortKey: number; product: { name: string; brand?: string; step: string } }
  | { kind: 'product-stop'; date: string; sortKey: number; product: { name: string; brand?: string; step: string } }
  | { kind: 'treatment'; date: string; sortKey: number; treatment: { type: string; customName?: string; provider?: string; notes?: string } };

export default function Timeline() {
  const [viewing, setViewing] = useState<PhotoEntry | null>(null);
  const photos = useLiveQuery(() => db.photos.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const treatments = useLiveQuery(() => db.treatments.toArray(), []);

  const events: Event[] = useMemo(() => {
    const out: Event[] = [];

    // Group photos by date
    const photoMap = new Map<string, PhotoEntry[]>();
    (photos ?? []).forEach((p) => {
      const arr = photoMap.get(p.date) ?? [];
      arr.push(p);
      photoMap.set(p.date, arr);
    });
    photoMap.forEach((list, date) => {
      out.push({ kind: 'photo', date, sortKey: dateKey(date), photos: list });
    });

    (products ?? []).forEach((p) => {
      out.push({
        kind: 'product-start',
        date: p.startedOn,
        sortKey: dateKey(p.startedOn) - 0.1,
        product: { name: p.name, brand: p.brand, step: p.step },
      });
      if (p.stoppedOn) {
        out.push({
          kind: 'product-stop',
          date: p.stoppedOn,
          sortKey: dateKey(p.stoppedOn) - 0.05,
          product: { name: p.name, brand: p.brand, step: p.step },
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

  if (events.length === 0) {
    return (
      <div className="card text-sm text-glow-600/80">
        Your timeline will fill in as you log photos, products, and treatments.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="font-display text-xl text-glow-800">Timeline</h2>
        <p className="text-xs text-glow-600">Everything that's happened to your skin, in order.</p>
      </section>

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

      {viewing && <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />}
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
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-glow-700">
          {fmtDate(event.date)}
        </span>
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
        <div className="grid grid-cols-4 gap-1.5">
          {event.photos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPhoto(p)}
              className="relative block focus:outline-none focus:ring-2 focus:ring-glow-500 rounded-lg"
            >
              <PhotoThumb blob={p.thumb} className="aspect-square w-full object-cover rounded-lg" />
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
