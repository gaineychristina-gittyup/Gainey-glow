import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Upload, Trash2 } from 'lucide-react';
import { db, ZONES, type Zone } from '../db/schema';
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

      <section className="card">
        <h3 className="font-display text-lg text-glow-800 mb-2">Routine in use</h3>
        {(productsToday?.length ?? 0) === 0 ? (
          <p className="text-sm text-glow-600/80">
            No products logged for this date yet — add them on the Products tab.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {productsToday!.map((p) => (
              <li key={p.id} className="flex items-center justify-between text-sm">
                <span>
                  <span className="font-medium text-glow-900">{p.name}</span>
                  {p.brand ? <span className="text-glow-600"> · {p.brand}</span> : null}
                </span>
                <span className="text-xs text-glow-500">
                  {p.timeOfDay.length === 2 ? 'AM/PM' : p.timeOfDay.join('').toUpperCase()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

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
