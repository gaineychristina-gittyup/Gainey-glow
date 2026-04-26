import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Check, ChevronLeft, ChevronRight, Sun, Moon, Upload } from 'lucide-react';
import { db, ZONES, type PhotoEntry, type Product, type Zone } from '../db/schema';
import { todayISO, fmtDate, relDays, fmtDateShort, shiftDate } from '../lib/date';
import { makeThumbnail } from '../lib/image';
import ZonePicker from '../components/ZonePicker';
import PhotoThumb from '../components/PhotoThumb';
import CameraCapture from '../components/CameraCapture';
import UploadReviewModal from '../components/UploadReviewModal';
import PhotoViewer from '../components/PhotoViewer';

interface UploadSummary {
  count: number;
  withExif: number;
  earliest?: string;
  latest?: string;
}

export default function Today() {
  const [zone, setZone] = useState<Zone>('full');
  const [date, setDate] = useState<string>(todayISO());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [reviewFiles, setReviewFiles] = useState<File[] | null>(null);
  const [viewing, setViewing] = useState<PhotoEntry | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

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

  // Live capture from the in-app camera — uses selected date and zone.
  async function handleCameraSnap(blob: Blob) {
    setBusy(true);
    setSummary(null);
    try {
      const { thumb, width, height } = await makeThumbnail(blob, 480);
      await db.photos.add({
        date,
        takenAt: Date.now(),
        zone,
        blob,
        thumb,
        width,
        height,
        notes: notes.trim() || undefined,
      });
      setNotes('');
      setSummary({ count: 1, withExif: 0, earliest: date, latest: date });
    } finally {
      setBusy(false);
      setCameraOpen(false);
    }
  }

  // Upload existing photos — open the review modal where the user can
  // assign per-photo zones (optionally with Gemini auto-detect).
  function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setSummary(null);
    setReviewFiles(Array.from(files));
    if (uploadRef.current) uploadRef.current.value = '';
  }

  return (
    <div className="space-y-5">
      <section className="card">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h2 className="font-display text-xl text-glow-800">
            {date === todayISO() ? "Today's check-in" : fmtDate(date)}
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn-ghost p-2"
              onClick={() => setDate(shiftDate(date, -1))}
              aria-label="Previous day"
            >
              <ChevronLeft size={16} />
            </button>
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className="input w-auto text-xs"
            />
            <button
              type="button"
              className="btn-ghost p-2"
              onClick={() => setDate(shiftDate(date, +1))}
              disabled={date >= todayISO()}
              aria-label="Next day"
            >
              <ChevronRight size={16} />
            </button>
            {date !== todayISO() && (
              <button
                type="button"
                className="btn-soft text-[11px] px-2 py-1"
                onClick={() => setDate(todayISO())}
              >
                Today
              </button>
            )}
          </div>
        </div>
        <p className="text-[11px] text-glow-500 -mt-2 mb-3">
          Step back through previous days to log products you used or upload old photos.
        </p>

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
            onClick={() => setCameraOpen(true)}
            disabled={busy}
          >
            <Camera size={18} /> Take photo
          </button>
          <button
            className="btn-soft flex-1"
            onClick={() => uploadRef.current?.click()}
            disabled={busy}
          >
            <Upload size={18} /> Upload old
          </button>
        </div>

        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => handleUpload(e.target.files)}
        />

        {summary && (
          <UploadSummaryNote summary={summary} onDismiss={() => setSummary(null)} />
        )}

        <p className="text-[11px] text-glow-500 mt-2">
          Photos are stored locally on this device. The in-app camera shows a
          rule-of-thirds grid and a face-zone outline so framing stays consistent
          day to day. Uploads read each photo's capture date from its EXIF
          metadata.
        </p>
      </section>

      {cameraOpen && (
        <CameraCapture
          zone={zone}
          onZoneChange={setZone}
          onCapture={handleCameraSnap}
          onClose={() => setCameraOpen(false)}
        />
      )}

      {reviewFiles && (
        <UploadReviewModal
          files={reviewFiles}
          defaultZone={zone}
          onClose={() => setReviewFiles(null)}
          onSaved={(s) => {
            setReviewFiles(null);
            setSummary(s);
          }}
        />
      )}

      {viewing && <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />}

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
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setViewing(p)}
                        className="relative block focus:outline-none focus:ring-2 focus:ring-glow-500 rounded-xl"
                      >
                        <PhotoThumb
                          blob={p.thumb}
                          alt={`${z.label} on ${p.date}`}
                          className="aspect-square w-full object-cover rounded-xl"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <SkinRatingCard date={date} />

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

function UploadSummaryNote({
  summary,
  onDismiss,
}: {
  summary: UploadSummary;
  onDismiss: () => void;
}) {
  const { count, withExif, earliest, latest } = summary;
  const range =
    earliest && latest
      ? earliest === latest
        ? fmtDateShort(earliest)
        : `${fmtDateShort(earliest)} – ${fmtDateShort(latest)}`
      : '';
  return (
    <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-start gap-2">
      <Check size={16} className="text-emerald-700 mt-0.5" />
      <div className="flex-1 text-xs text-emerald-900">
        <div className="font-semibold">
          Saved {count} photo{count === 1 ? '' : 's'}
          {range && ` · ${range}`}
        </div>
        {withExif > 0 ? (
          <div className="text-emerald-800/80">
            Read capture date from EXIF on {withExif} of {count}.
          </div>
        ) : (
          <div className="text-emerald-800/80">
            No EXIF date found — used the file's modified date.
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-emerald-700 text-xs font-medium hover:underline"
      >
        Dismiss
      </button>
    </div>
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

function SkinRatingCard({ date }: { date: string }) {
  const rating = useLiveQuery(
    () => db.skinRatings.where('date').equals(date).first(),
    [date],
  );
  const value = rating?.rating ?? 0;

  async function setRating(v: number) {
    if (rating?.id) {
      if (v === 0) await db.skinRatings.delete(rating.id);
      else await db.skinRatings.update(rating.id, { rating: v });
    } else if (v > 0) {
      await db.skinRatings.add({ date, rating: v });
    }
  }

  const labels = ['Awful', 'Meh', 'OK', 'Good', 'Glowing'];
  return (
    <section className="card">
      <h3 className="font-display text-lg text-glow-800 mb-1">Skin rating</h3>
      <p className="text-xs text-glow-600 mb-2">
        How does your skin look and feel today? 1 = awful, 5 = glowing.
      </p>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={5}
          step={1}
          value={value}
          onChange={(e) => setRating(Number(e.target.value))}
          className="flex-1 accent-pink-500"
          aria-label="Skin rating, 0 to 5"
        />
        <div className="text-2xl font-display tabular-nums w-10 text-right text-glow-900">
          {value === 0 ? '—' : value}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-glow-500 px-1 select-none">
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className={`px-1 ${n === value ? 'text-glow-800 font-semibold' : ''}`}
            aria-label={`Set rating to ${n === 0 ? 'cleared' : n}`}
          >
            {n === 0 ? 'clear' : n}
          </button>
        ))}
      </div>
      {value > 0 && (
        <div className="mt-1 text-xs text-glow-700 italic">{labels[value - 1]}</div>
      )}
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
