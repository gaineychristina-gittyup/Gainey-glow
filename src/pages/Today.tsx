import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation } from 'react-router-dom';
import { Camera, Check, ChevronLeft, ChevronRight, GripVertical, Plus, Sparkles, Sun, Moon, Upload } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { db, PRODUCT_STEPS, STEP_CHIP_CLASSES, ZONES, type PhotoEntry, type Product, type Zone } from '../db/schema';
import { todayISO, fmtDate, relDays, fmtDateShort, shiftDate } from '../lib/date';
import { compressForStorage, makeThumbnail } from '../lib/image';
import { requestPersistentStorage } from '../lib/storage';
import { askLayeringOrder } from '../lib/gemini';
import { getGeminiKey } from '../lib/settings';
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
  const location = useLocation();
  const seedDate = (location.state as { date?: string } | null)?.date;
  const [date, setDate] = useState<string>(seedDate ?? todayISO());
  useEffect(() => {
    const d = (location.state as { date?: string } | null)?.date;
    if (d) setDate(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
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
    return all
      .filter(
        (p) =>
          p.inRotation &&
          (!p.startedOn || p.startedOn <= date) &&
          (!p.stoppedOn || p.stoppedOn >= date),
      )
      .sort((a, b) => {
        const ao = a.sortOrder;
        const bo = b.sortOrder;
        if (ao !== undefined && bo !== undefined) return ao - bo;
        if (ao !== undefined) return -1;
        if (bo !== undefined) return 1;
        if (a.startedOn && b.startedOn) return b.startedOn.localeCompare(a.startedOn);
        if (a.startedOn) return -1;
        if (b.startedOn) return 1;
        return 0;
      });
  }, [date]);

  const treatmentsRecent = useLiveQuery(async () => {
    const all = await db.treatments.orderBy('date').reverse().toArray();
    return all.slice(0, 3);
  }, []);

  // Live capture from the in-app camera — uses selected date and zone.
  async function handleCameraSnap(blob: Blob) {
    setBusy(true);
    setSummary(null);
    try {
      const compressed = await compressForStorage(blob);
      const { thumb } = await makeThumbnail(compressed.blob, 480);
      await db.photos.add({
        date,
        takenAt: Date.now(),
        zone,
        blob: compressed.blob,
        thumb,
        width: compressed.width,
        height: compressed.height,
        notes: notes.trim() || undefined,
      });
      void requestPersistentStorage();
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

      <SkinRatingCard date={date} />

      <section className="card">
        <h3 className="font-display text-lg text-glow-800 mb-3">Captured today</h3>
        {(photosToday?.length ?? 0) === 0 ? (
          <p className="text-sm text-glow-600/80">No photos yet for {fmtDate(date)}.</p>
        ) : (
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
            {(photosToday ?? [])
              .slice()
              .sort((a, b) => a.takenAt - b.takenAt)
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setViewing(p)}
                  className="relative shrink-0 h-14 w-14 sm:h-16 sm:w-16 rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-glow-500"
                  aria-label={`${ZONES.find((z) => z.id === p.zone)?.label} photo`}
                >
                  <PhotoThumb
                    blob={p.thumb}
                    alt={`${p.zone} on ${p.date}`}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[8px] py-0.5 text-center pointer-events-none truncate">
                    {ZONES.find((z) => z.id === p.zone)?.label.split(' ')[0]}
                  </span>
                </button>
              ))}
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
  const [layeringFor, setLayeringFor] = useState<{
    period: 'am' | 'pm';
    list: Product[];
  } | null>(null);

  async function reorderRoutine(list: Product[], fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    const all = await db.products.toArray();
    const orderMap = new Map<number, number>();
    next.forEach((p, i) => orderMap.set(p.id!, i));
    const updates = all.map((p) => ({
      ...p,
      sortOrder: orderMap.has(p.id!)
        ? orderMap.get(p.id!)
        : (p.sortOrder ?? 9999) + next.length,
    }));
    await db.products.bulkPut(updates);
  }

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

  // Compute today's weekday (0=Sun..6=Sat) from the selected date.
  const [y, mo, d] = date.split('-').map(Number);
  const weekday = new Date(y, (mo ?? 1) - 1, d ?? 1).getDay();
  function periodActive(p: Product, period: 'am' | 'pm') {
    if (!p.timeOfDay.includes(period)) return false;
    const days = p.schedule?.[period];
    if (!days || days.length === 0) return true; // every day by default
    return days.includes(weekday);
  }
  // Scheduled and ad-hoc (any logged-but-not-scheduled) products per period.
  const scheduledAm = products.filter((p) => periodActive(p, 'am'));
  const scheduledPm = products.filter((p) => periodActive(p, 'pm'));
  const adHocIds = (period: 'am' | 'pm') =>
    new Set(
      (logs ?? [])
        .filter((l) => l.period === period)
        .map((l) => l.productId),
    );
  const adHocAm = products.filter(
    (p) => p.id != null && adHocIds('am').has(p.id) && !scheduledAm.includes(p),
  );
  const adHocPm = products.filter(
    (p) => p.id != null && adHocIds('pm').has(p.id) && !scheduledPm.includes(p),
  );
  const am = [...scheduledAm, ...adHocAm];
  const pm = [...scheduledPm, ...adHocPm];
  const isAdHoc = (productId: number, period: 'am' | 'pm') =>
    period === 'am'
      ? adHocAm.some((p) => p.id === productId)
      : adHocPm.some((p) => p.id === productId);
  const candidatesFor = (period: 'am' | 'pm') =>
    products.filter(
      (p) =>
        p.id != null &&
        !(period === 'am' ? scheduledAm : scheduledPm).includes(p) &&
        !(period === 'am' ? adHocAm : adHocPm).includes(p),
    );

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
      (p) => p.id === l.productId && periodActive(p, l.period),
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

      <div className="grid sm:grid-cols-2 gap-3 min-w-0">
        <RoutineColumn
          icon={<Sun size={16} className="text-amber-500" />}
          label="AM"
          products={am}
          isDone={(id) => isDone(id, 'am')}
          onToggle={(id) => toggle(id, 'am')}
          isAdHoc={(id) => isAdHoc(id, 'am')}
          candidates={candidatesFor('am')}
          onAdd={async (id) => {
            await db.routineLogs.add({ date, productId: id, period: 'am' });
          }}
          onReorder={(from, to) => reorderRoutine(am, from, to)}
          onAskAi={() => setLayeringFor({ period: 'am', list: am })}
        />
        <RoutineColumn
          icon={<Moon size={16} className="text-indigo-500" />}
          label="PM"
          products={pm}
          isDone={(id) => isDone(id, 'pm')}
          onToggle={(id) => toggle(id, 'pm')}
          isAdHoc={(id) => isAdHoc(id, 'pm')}
          candidates={candidatesFor('pm')}
          onAdd={async (id) => {
            await db.routineLogs.add({ date, productId: id, period: 'pm' });
          }}
          onReorder={(from, to) => reorderRoutine(pm, from, to)}
          onAskAi={() => setLayeringFor({ period: 'pm', list: pm })}
        />
      </div>

      {layeringFor && (
        <LayeringAdviceModal
          period={layeringFor.period}
          products={layeringFor.list}
          onClose={() => setLayeringFor(null)}
          onApplyOrder={async (orderedIds: number[]) => {
            // Reassign sortOrder according to the new order; products not in
            // the list keep their existing relative order at the end.
            const all = await db.products.toArray();
            const orderMap = new Map<number, number>();
            orderedIds.forEach((id, i) => orderMap.set(id, i));
            const updates = all
              .map((p) => ({
                ...p,
                sortOrder: orderMap.has(p.id!)
                  ? orderMap.get(p.id!)
                  : (p.sortOrder ?? 9999) + orderedIds.length,
              }));
            await db.products.bulkPut(updates);
            setLayeringFor(null);
          }}
        />
      )}
    </section>
  );
}


function SkinRatingCard({ date }: { date: string }) {
  const rating = useLiveQuery(
    () => db.skinRatings.where('date').equals(date).first(),
    [date],
  );
  const persisted = rating?.rating ?? 0;
  const persistedNotes = rating?.notes ?? '';
  const [local, setLocal] = useState(persisted);
  const [notesDraft, setNotesDraft] = useState(persistedNotes);
  const [savedAt, setSavedAt] = useState(0);
  useEffect(() => {
    setLocal(persisted);
    setNotesDraft(persistedNotes);
  }, [persisted, persistedNotes, date]);

  async function persist(v: number, notes: string) {
    const trimmed = notes.trim();
    if (rating?.id) {
      if (v === 0 && !trimmed) {
        await db.skinRatings.delete(rating.id);
      } else {
        await db.skinRatings.update(rating.id, {
          rating: v,
          notes: trimmed || undefined,
        });
      }
    } else if (v > 0 || trimmed) {
      await db.skinRatings.add({ date, rating: v, notes: trimmed || undefined });
    }
  }

  async function pickRating(v: number) {
    setLocal(v);
    await persist(v, notesDraft);
  }

  async function submitNotes() {
    await persist(local, notesDraft);
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt((s) => (Date.now() - s > 1500 ? 0 : s)), 1700);
  }

  const labels = ['Awful', 'Meh', 'OK', 'Good', 'Glowing'];
  const notesDirty = notesDraft.trim() !== persistedNotes.trim();

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
          value={local}
          onChange={(e) => setLocal(Math.round(Number(e.target.value)))}
          onPointerUp={(e) => pickRating(Math.round(Number((e.target as HTMLInputElement).value)))}
          onKeyUp={(e) => pickRating(Math.round(Number((e.target as HTMLInputElement).value)))}
          className="flex-1 accent-pink-500"
          aria-label="Skin rating, 0 to 5"
        />
        <div className="text-2xl font-display tabular-nums w-10 text-right text-glow-900">
          {local === 0 ? '—' : local}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-6 gap-1 text-xs select-none">
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => pickRating(n)}
            className={`rounded-full py-1 font-medium border transition ${
              n === local
                ? 'bg-glow-600 text-white border-glow-600'
                : 'bg-white/70 text-glow-700 border-glow-200 hover:bg-glow-50'
            }`}
            aria-label={`Set rating to ${n === 0 ? 'cleared' : n}`}
          >
            {n === 0 ? '—' : n}
          </button>
        ))}
      </div>
      {local > 0 && (
        <div className="mt-2 text-xs text-glow-700 italic">{labels[local - 1]}</div>
      )}

      <label className="label mt-3">Notes</label>
      <textarea
        className="input min-h-[60px]"
        placeholder="What's going on with your skin today? Breakouts, dryness, products tried, weather, sleep…"
        value={notesDraft}
        onChange={(e) => setNotesDraft(e.target.value)}
      />
      <div className="mt-2 flex items-center justify-end gap-2 text-[11px]">
        {savedAt > 0 && Date.now() - savedAt < 1500 && (
          <span className="text-emerald-700 font-medium">Saved ✓</span>
        )}
        <button
          type="button"
          className="btn-primary"
          onClick={submitNotes}
          disabled={!notesDirty}
        >
          Save notes
        </button>
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
  isAdHoc,
  candidates,
  onAdd,
  onReorder,
  onAskAi,
}: {
  icon: React.ReactNode;
  label: string;
  products: Product[];
  isDone: (productId: number) => boolean;
  onToggle: (productId: number) => void;
  isAdHoc: (productId: number) => boolean;
  candidates: Product[];
  onAdd: (productId: number) => Promise<void>;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onAskAi: () => void;
}) {
  const [adding, setAdding] = useState(false);
  // Drag handle is isolated on the right edge with `touch-none`, so it doesn't
  // collide with vertical scrolling. Activate on a small drag distance for
  // immediate, thumb-friendly reordering (no long-press required).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 6 } }),
  );
  const ids = products.map((p) => p.id!);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(active.id as number);
    const to = ids.indexOf(over.id as number);
    if (from < 0 || to < 0) return;
    onReorder(from, to);
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-glow-700 mb-2">
        {icon} {label}
        <button
          type="button"
          onClick={onAskAi}
          className="ml-auto inline-flex items-center gap-1 rounded-full bg-glow-100 text-glow-800 px-2 py-0.5 text-[10px] font-medium hover:bg-glow-200"
          title="Ask AI for the best layering order"
        >
          <Sparkles size={10} /> AI order
        </button>
      </div>
      {products.length === 0 ? (
        <p className="text-xs text-glow-500">No {label.toLowerCase()} products scheduled.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1.5">
              {products.map((p) => (
                <SortableRoutineRow
                  key={p.id}
                  product={p}
                  done={isDone(p.id!)}
                  adHoc={isAdHoc(p.id!)}
                  onToggle={() => onToggle(p.id!)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <button
        type="button"
        onClick={() => setAdding(true)}
        disabled={candidates.length === 0}
        className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-glow-300 px-3 py-2 text-xs font-medium text-glow-700 hover:bg-glow-50 disabled:opacity-40"
      >
        <Plus size={14} />
        {candidates.length === 0 ? 'No more products to add' : `Add another ${label.toUpperCase()} product`}
      </button>

      {adding && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-3">
          <div className="card w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display text-lg text-glow-800">Add to {label}</h3>
              <button className="btn-ghost text-xs" onClick={() => setAdding(false)}>Close</button>
            </div>
            <p className="text-xs text-glow-600 mb-3">
              Mark a product you used today even though it isn't on the schedule. It'll show
              as <span className="italic">ad-hoc</span> with a dashed border.
            </p>
            {candidates.length === 0 ? (
              <p className="text-sm text-glow-600/80">No more active products to add.</p>
            ) : (
              <ul className="space-y-1.5">
                {candidates.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={async () => {
                        await onAdd(p.id!);
                        setAdding(false);
                      }}
                      className="w-full text-left rounded-xl border border-glow-200 bg-white hover:bg-glow-50 px-3 py-2"
                    >
                      <div className="text-sm font-medium text-glow-900 truncate">{p.name}</div>
                      {p.brand && (
                        <div className="text-[11px] text-glow-500 truncate">{p.brand}</div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SortableRoutineRow({
  product,
  done,
  adHoc,
  onToggle,
}: {
  product: Product;
  done: boolean;
  adHoc: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: product.id!,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  const stepLabel =
    PRODUCT_STEPS.find((s) => s.id === product.step)?.label ?? product.step;
  return (
    <li ref={setNodeRef} style={style}>
      <div
        className={`w-full flex items-stretch gap-1 rounded-xl border pl-2 pr-1 text-left text-sm ${
          done
            ? 'bg-glow-100 border-glow-300 text-glow-900'
            : 'bg-white border-glow-200 text-glow-800'
        } ${adHoc ? 'border-dashed' : ''}`}
      >
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 min-w-0 text-left py-2"
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-md border shrink-0 ${
              done ? 'bg-glow-600 border-glow-600 text-white' : 'border-glow-300 bg-white'
            }`}
            aria-hidden
          >
            {done && <Check size={14} />}
          </span>
          <span
            className={`w-20 shrink-0 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-medium truncate ${STEP_CHIP_CLASSES[product.step]}`}
            title={stepLabel}
          >
            {stepLabel}
          </span>
          <span className="flex-1 min-w-0 overflow-hidden">
            <span
              className={`block truncate text-sm ${done ? 'line-through opacity-70' : ''}`}
            >
              {product.brand && (
                <span className="font-bold text-glow-900">{product.brand} </span>
              )}
              <span className="font-medium">{product.name}</span>
            </span>
            {adHoc && (
              <span className="block text-[11px] text-glow-700 truncate">ad-hoc</span>
            )}
          </span>
        </button>
        <span
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="flex items-center justify-center shrink-0 self-stretch -mr-1 px-3 text-glow-500 hover:text-glow-800 hover:bg-glow-100 active:bg-glow-200 cursor-grab active:cursor-grabbing touch-none rounded-r-xl"
        >
          <GripVertical size={22} />
        </span>
      </div>
    </li>
  );
}


function LayeringAdviceModal({
  period,
  products,
  onClose,
  onApplyOrder,
}: {
  period: 'am' | 'pm';
  products: Product[];
  onClose: () => void;
  onApplyOrder: (orderedIds: number[]) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<import('../lib/gemini').LayeringPlan | null>(null);

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
        const result = await askLayeringOrder({
          period,
          products: products.map((p) => ({
            id: p.id!,
            name: p.name,
            brand: p.brand,
            step: p.step,
            ingredients: p.ingredients,
          })),
        });
        if (!cancelled) setPlan(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to get plan.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-3">
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-lg text-glow-800 flex items-center gap-1.5">
            <Sparkles size={16} className="text-glow-600" /> {period.toUpperCase()} layering
          </h3>
          <button className="btn-ghost text-xs" onClick={onClose}>Close</button>
        </div>
        <p className="text-xs text-glow-600 mb-3">
          AI suggested order, with wait times between steps. Informational only.
        </p>
        {loading && (
          <div className="text-sm text-glow-700 py-6 text-center">Asking Gemini…</div>
        )}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        )}
        {plan && (
          <ol className="space-y-2 list-decimal pl-5">
            {plan.order.map((step) => {
              const p = products.find((x) => x.id === step.productId);
              if (!p) return null;
              return (
                <li key={step.productId}>
                  <div className="text-sm font-medium text-glow-900">
                    {p.brand ? <span className="font-bold">{p.brand} </span> : null}
                    {p.name}
                  </div>
                  <div className="text-xs text-glow-700">{step.reason}</div>
                  {step.waitMinutesAfter > 0 && (
                    <div className="text-[11px] text-amber-700 mt-0.5">
                      wait {step.waitMinutesAfter} min before next step
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {plan && plan.notes.length > 0 && (
          <div className="mt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-glow-700 mb-1">
              Notes
            </div>
            <ul className="list-disc pl-4 text-xs text-glow-800 space-y-0.5">
              {plan.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          {plan && (
            <button
              className="btn-primary"
              onClick={() => onApplyOrder(plan.order.map((s) => s.productId))}
            >
              Apply this order
            </button>
          )}
          <button className="btn-ghost" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
