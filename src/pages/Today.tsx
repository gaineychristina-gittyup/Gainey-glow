import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Check, Sun, Moon, Upload, Trash2 } from 'lucide-react';
import { db, FEEL_TAGS, ZONES, type FeelTag, type Product, type Zone } from '../db/schema';
import { todayISO, fmtDate, relDays } from '../lib/date';
import { makeThumbnail } from '../lib/image';
import ZonePicker from '../components/ZonePicker';
import PhotoThumb from '../components/PhotoThumb';

export default function Today() {
  const [zone, setZone] = useState<Zone>('full');
  const [date, setDate] = useState<string>(todayISO());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const photosToday = useLiveQuery(
    () => db.photos.where('date').equals(date).toArray(),
    [date],
  );

  const productsToday = useLiveQuery(async () => {
    const all = await db.products.toArray();
    return all.filter(
      (p) => p.startedOn <= date && (!p.stoppedOn || p.stoppedOn >= date),
    );
  }, [date]);

  const treatmentsRecent = useLiveQuery(async () => {
    const all = await db.treatments.orderBy('date').reverse().toArray();
    return all.slice(0, 3);
  }, []);

  const grouped = useMemo(() => {
    const out: Record<Zone, typeof photosToday> = {
      full: [],
      forehead: [],
      leftCheek: [],
      rightCheek: [],
      chin: [],
      nose: [],
    };
    (photosToday ?? []).forEach((p) => {
      out[p.zone] = [...(out[p.zone] ?? []), p];
    });
    return out;
  }, [photosToday]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const { thumb, width, height } = await makeThumbnail(file, 480);
        await db.photos.add({
          date,
          takenAt: Date.now(),
          zone,
          blob: file,
          thumb,
          width,
          height,
          notes: notes.trim() || undefined,
        });
      }
      setNotes('');
      if (fileRef.current) fileRef.current.value = '';
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl text-glow-800">
            {date === todayISO() ? "Today's check-in" : fmtDate(date)}
          </h2>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input w-auto text-xs"
          />
        </div>

        <label className="label">Zone</label>
        <ZonePicker value={zone} onChange={setZone} />

        <label className="label mt-4">Notes (optional)</label>
        <textarea
          className="input min-h-[60px]"
          placeholder="How does your skin feel today? Any breakouts, redness, dryness?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="mt-4 flex gap-2">
          <button
            className="btn-primary flex-1"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <Camera size={18} /> Take photo
          </button>
          <button
            className="btn-soft flex-1"
            onClick={() => {
              if (fileRef.current) {
                fileRef.current.removeAttribute('capture');
                fileRef.current.click();
              }
            }}
            disabled={busy}
          >
            <Upload size={18} /> Upload
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="user"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files).then(() => {
            if (fileRef.current) fileRef.current.setAttribute('capture', 'user');
          })}
        />
        <p className="text-[11px] text-glow-500 mt-2">
          Photos are stored locally on this device. Nothing is uploaded.
        </p>
      </section>

      <FeelTagsSection date={date} />

      <section className="card">
        <h3 className="font-display text-lg text-glow-800 mb-3">Captured today</h3>
        {(photosToday?.length ?? 0) === 0 ? (
          <p className="text-sm text-glow-600/80">No photos yet for {fmtDate(date)}.</p>
        ) : (
          <div className="space-y-3">
            {ZONES.map((z) =>
              (grouped[z.id]?.length ?? 0) === 0 ? null : (
                <div key={z.id}>
                  <div className="text-xs font-semibold text-glow-700 mb-1.5">{z.label}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {grouped[z.id]!.map((p) => (
                      <div key={p.id} className="relative group">
                        <PhotoThumb
                          blob={p.thumb}
                          alt={`${z.label} on ${p.date}`}
                          className="aspect-square w-full object-cover rounded-xl"
                        />
                        <button
                          onClick={() => db.photos.delete(p.id!)}
                          aria-label="Delete photo"
                          className="absolute top-1 right-1 bg-white/90 rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                        >
                          <Trash2 size={14} className="text-red-600" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <RoutineChecklist date={date} products={productsToday ?? []} />

      {/* recent treatments */}
      {treatmentsRecent && treatmentsRecent.length > 0 && (
        <section className="card">
          <h3 className="font-display text-lg text-glow-800 mb-2">Recent treatments</h3>
          <ul className="space-y-1.5">
            {treatmentsRecent.map((t) => (
              <li key={t.id} className="flex items-center justify-between text-sm">
                <span className="text-glow-900 font-medium">
                  {t.customName || t.type}
                </span>
                <span className="text-xs text-glow-500">{relDays(t.date)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FeelTagsSection({ date }: { date: string }) {
  const checkin = useLiveQuery(
    () => db.checkins.where('date').equals(date).first(),
    [date],
  );
  const tags = checkin?.tags ?? [];

  async function toggle(tag: FeelTag) {
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    if (checkin?.id) {
      if (next.length === 0) await db.checkins.delete(checkin.id);
      else await db.checkins.update(checkin.id, { tags: next });
    } else if (next.length > 0) {
      await db.checkins.add({ date, tags: next });
    }
  }

  const toneClass = (selected: boolean, tone: 'good' | 'neutral' | 'bad') => {
    if (!selected) return 'bg-white/70 text-glow-700 border-glow-200 hover:bg-glow-50';
    if (tone === 'good') return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    if (tone === 'bad') return 'bg-amber-100 text-amber-800 border-amber-300';
    return 'bg-glow-200 text-glow-900 border-glow-300';
  };

  return (
    <section className="card">
      <h3 className="font-display text-lg text-glow-800 mb-1">How does it feel?</h3>
      <p className="text-xs text-glow-600 mb-3">Tap any that apply for this day.</p>
      <div className="flex flex-wrap gap-2">
        {FEEL_TAGS.map((t) => {
          const selected = tags.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${toneClass(selected, t.tone)}`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                  selected ? 'bg-glow-600 border-glow-600 text-white' : 'border-glow-300 bg-white'
                }`}
                aria-hidden
              >
                {selected && <Check size={10} />}
              </span>
              {t.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RoutineChecklist({ date, products }: { date: string; products: Product[] }) {
  const logs = useLiveQuery(
    () => db.routineLogs.where('date').equals(date).toArray(),
    [date],
  );

  const isDone = (productId: number, period: 'am' | 'pm') =>
    !!logs?.find((l) => l.productId === productId && l.period === period);

  async function toggle(productId: number, period: 'am' | 'pm') {
    const existing = await db.routineLogs
      .where('[date+productId+period]')
      .equals([date, productId, period])
      .first();
    if (existing?.id) {
      await db.routineLogs.delete(existing.id);
    } else {
      await db.routineLogs.add({ date, productId, period });
    }
  }

  const am = products.filter((p) => p.timeOfDay.includes('am'));
  const pm = products.filter((p) => p.timeOfDay.includes('pm'));

  if (products.length === 0) {
    return (
      <section className="card">
        <h3 className="font-display text-lg text-glow-800 mb-2">Routine</h3>
        <p className="text-sm text-glow-600/80">
          No products active on this date — add them on the Products tab.
        </p>
      </section>
    );
  }

  const total = am.length + pm.length;
  const done = (logs ?? []).filter((l) =>
    products.some(
      (p) => p.id === l.productId && p.timeOfDay.includes(l.period),
    ),
  ).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <section className="card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display text-lg text-glow-800">Routine</h3>
        <span className="text-xs text-glow-600">
          {done}/{total} {pct === 100 ? '· complete ✓' : ''}
        </span>
      </div>
      <div className="h-1.5 mb-3 rounded-full bg-glow-100 overflow-hidden">
        <div className="h-full bg-glow-500 transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <RoutineColumn
          icon={<Sun size={16} className="text-amber-500" />}
          label="AM"
          products={am}
          isDone={(id) => isDone(id, 'am')}
          onToggle={(id) => toggle(id, 'am')}
        />
        <RoutineColumn
          icon={<Moon size={16} className="text-indigo-500" />}
          label="PM"
          products={pm}
          isDone={(id) => isDone(id, 'pm')}
          onToggle={(id) => toggle(id, 'pm')}
        />
      </div>
    </section>
  );
}

function RoutineColumn({
  icon,
  label,
  products,
  isDone,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  products: Product[];
  isDone: (productId: number) => boolean;
  onToggle: (productId: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-glow-700 mb-2">
        {icon} {label}
      </div>
      {products.length === 0 ? (
        <p className="text-xs text-glow-500">No {label.toLowerCase()} products.</p>
      ) : (
        <ul className="space-y-1.5">
          {products.map((p) => {
            const done = isDone(p.id!);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onToggle(p.id!)}
                  className={`w-full flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${
                    done
                      ? 'bg-glow-100 border-glow-300 text-glow-900'
                      : 'bg-white border-glow-200 text-glow-800 hover:bg-glow-50'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                      done ? 'bg-glow-600 border-glow-600 text-white' : 'border-glow-300 bg-white'
                    }`}
                    aria-hidden
                  >
                    {done && <Check size={14} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block truncate font-medium ${done ? 'line-through opacity-70' : ''}`}>
                      {p.name}
                    </span>
                    {p.brand && (
                      <span className="block text-[11px] text-glow-500 truncate">{p.brand}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
