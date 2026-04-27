import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation } from 'react-router-dom';
import { Camera, Check, ChevronLeft, ChevronRight, GripVertical, Plus, RotateCcw, Sparkles, Sun, Moon, Trash2, Upload } from 'lucide-react';
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
  const skips = useLiveQuery(
    () => db.routineSkips.where('date').equals(date).toArray(),
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

  // Hide a product from today's routine without altering its schedule. Also
  // clears any "done" log so it doesn't reappear if the user restores it.
  async function deleteForToday(productId: number, period: 'am' | 'pm') {
    const log = await db.routineLogs
      .where('[date+productId+period]')
      .equals([date, productId, period])
      .first();
    if (log?.id) await db.routineLogs.delete(log.id);
    const skip = await db.routineSkips
      .where('[date+productId+period]')
      .equals([date, productId, period])
      .first();
    if (!skip) {
      await db.routineSkips.add({ date, productId, period });
    }
  }

  async function restoreSkips(period: 'am' | 'pm') {
    const ids = (skips ?? [])
      .filter((s) => s.period === period && s.id != null)
      .map((s) => s.id!) ;
    if (ids.length) await db.routineSkips.bulkDelete(ids);
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
  const skipKey = (productId: number, period: 'am' | 'pm') => `${productId}-${period}`;
  const skippedSet = new Set(
    (skips ?? []).map((s) => skipKey(s.productId, s.period)),
  );
  const isSkipped = (productId: number, period: 'am' | 'pm') =>
    skippedSet.has(skipKey(productId, period));
  const am = [...scheduledAm, ...adHocAm].filter((p) => !isSkipped(p.id!, 'am'));
  const pm = [...scheduledPm, ...adHocPm].filter((p) => !isSkipped(p.id!, 'pm'));
  const skippedProductsFor = (period: 'am' | 'pm') =>
    products.filter((p) => p.id != null && isSkipped(p.id, period));
  const isAdHoc = (productId: number, period: 'am' | 'pm') =>
    period === 'am'
      ? adHocAm.some((p) => p.id === productId)
      : adHocPm.some((p) => p.id === productId);
  const candidatesFor = (period: 'am' | 'pm') =>
    products.filter(
      (p) =>
        p.id != null &&
        !(period === 'am' ? scheduledAm : scheduledPm).includes(p) &&
        !(period === 'am' ? adHocAm : adHocPm).includes(p) &&
        !isSkipped(p.id, period),
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
          onDelete={(id) => deleteForToday(id, 'am')}
          isAdHoc={(id) => isAdHoc(id, 'am')}
          candidates={candidatesFor('am')}
          skipped={skippedProductsFor('am')}
          onRestoreSkipped={() => restoreSkips('am')}
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
          onDelete={(id) => deleteForToday(id, 'pm')}
          isAdHoc={(id) => isAdHoc(id, 'pm')}
          candidates={candidatesFor('pm')}
          skipped={skippedProductsFor('pm')}
          onRestoreSkipped={() => restoreSkips('pm')}
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
      <div className="grid grid-cols-6 gap-1 text-xs select-none">
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
  onDelete,
  isAdHoc,
  candidates,
  skipped,
  onRestoreSkipped,
  onAdd,
  onReorder,
  onAskAi,
}: {
  icon: React.ReactNode;
  label: string;
  products: Product[];
  isDone: (productId: number) => boolean;
  onToggle: (productId: number) => void;
  onDelete: (productId: number) => Promise<void>;
  isAdHoc: (productId: number) => boolean;
  candidates: Product[];
  skipped: Product[];
  onRestoreSkipped: () => Promise<void>;
  onAdd: (productId: number) => Promise<void>;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onAskAi: () => void;
}) {
  const [adding, setAdding] = useState(false);
  // Reorder is gated behind a long-press: tap = toggle, swipe-left = delete,
  // long-press on any row puts the column into edit mode where drag handles
  // appear and rows can be rearranged. This prevents accidental drags while
  // also keeping swipe-to-delete unambiguous.
  const [editMode, setEditMode] = useState(false);
  // Once in edit mode, dnd-kit handles drag from the visible grip handle on
  // the right; no activation distance needed since the handle is explicit.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 4 } }),
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
        {editMode ? (
          <button
            type="button"
            onClick={() => setEditMode(false)}
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-glow-600 text-white px-2 py-0.5 text-[10px] font-medium hover:bg-glow-700"
          >
            Done
          </button>
        ) : (
          <button
            type="button"
            onClick={onAskAi}
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-glow-100 text-glow-800 px-2 py-0.5 text-[10px] font-medium hover:bg-glow-200"
            title="Ask AI for the best layering order"
          >
            <Sparkles size={10} /> AI order
          </button>
        )}
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
                  editMode={editMode}
                  onToggle={() => onToggle(p.id!)}
                  onDelete={() => onDelete(p.id!)}
                  onEnterEditMode={() => setEditMode(true)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {editMode && (
        <p className="mt-1 text-[11px] text-glow-500 italic">
          Drag the handles to rearrange · tap Done when finished
        </p>
      )}

      {skipped.length > 0 && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-glow-50 border border-glow-100 px-2.5 py-1.5">
          <span className="text-[11px] text-glow-700 truncate">
            {skipped.length} skipped today
            {skipped.length <= 2 && (
              <span className="text-glow-500">
                {' · '}
                {skipped.map((p) => p.name).join(', ')}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => onRestoreSkipped()}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-glow-700 hover:text-glow-900"
          >
            <RotateCcw size={11} /> Restore
          </button>
        </div>
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

const SWIPE_REVEAL_X = -88;
const SWIPE_DIRECTION_LOCK_PX = 4;
const LONG_PRESS_MS = 450;
const LONG_PRESS_MAX_MOVE = 8;

function SortableRoutineRow({
  product,
  done,
  adHoc,
  editMode,
  onToggle,
  onDelete,
  onEnterEditMode,
}: {
  product: Product;
  done: boolean;
  adHoc: boolean;
  editMode: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onEnterEditMode: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: product.id!,
    disabled: !editMode,
  });
  const liStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  const stepLabel =
    PRODUCT_STEPS.find((s) => s.id === product.step)?.label ?? product.step;

  // Committed swipe position (0 = closed, SWIPE_REVEAL_X = delete revealed).
  const [swipeX, setSwipeX] = useState(0);
  // Live drag offset while the finger is down. null when not actively swiping.
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const startRef = useRef<{
    x: number;
    y: number;
    lock: 'none' | 'h' | 'v';
    longPressTimer: number | null;
  } | null>(null);
  // Set when the gesture committed a horizontal drag (or fired a long-press),
  // so the trailing click from the same pointer interaction is swallowed.
  const swipedRef = useRef(false);

  // Drag (dnd-kit reorder) cancels any in-progress swipe state.
  useEffect(() => {
    if (isDragging) {
      setDragOffset(null);
      startRef.current = null;
    }
  }, [isDragging]);

  // Leaving edit mode snaps any open swipe closed.
  useEffect(() => {
    if (editMode) {
      setSwipeX(0);
      setDragOffset(null);
    }
  }, [editMode]);

  function cancelLongPress() {
    const s = startRef.current;
    if (s && s.longPressTimer != null) {
      clearTimeout(s.longPressTimer);
      s.longPressTimer = null;
    }
  }

  const offset = dragOffset !== null ? dragOffset : swipeX;
  const fgStyle: React.CSSProperties = {
    transform: `translateX(${offset}px)`,
    transition: dragOffset === null ? 'transform 0.2s ease' : 'none',
    // In edit mode, dnd-kit owns the gesture on its own handle, so the row
    // body can scroll freely. Otherwise, lock horizontal so the browser
    // doesn't steal our swipe.
    touchAction: editMode ? 'auto' : 'pan-y',
  };

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (isDragging) return;
    const target = e.target as HTMLElement;
    // Don't engage when the user starts on the reorder handle or the delete
    // button beneath the row.
    if (target.closest('[data-no-swipe]')) return;

    // Schedule a long-press → enter edit mode. Cancelled by movement, lift,
    // or swipe-direction lock.
    let timer: number | null = null;
    if (!editMode) {
      timer = window.setTimeout(() => {
        onEnterEditMode();
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(15);
          } catch {
            /* ignore */
          }
        }
        swipedRef.current = true; // suppress the trailing click
        const s = startRef.current;
        if (s) s.longPressTimer = null;
      }, LONG_PRESS_MS);
    }
    startRef.current = { x: e.clientX, y: e.clientY, lock: 'none', longPressTimer: timer };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const s = startRef.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;

    // Movement past the long-press tolerance cancels the press.
    if (
      s.longPressTimer != null &&
      (Math.abs(dx) > LONG_PRESS_MAX_MOVE || Math.abs(dy) > LONG_PRESS_MAX_MOVE)
    ) {
      cancelLongPress();
    }

    // Reorder mode owns the row; no swipe in edit mode.
    if (editMode) return;

    if (s.lock === 'none') {
      if (Math.abs(dx) < SWIPE_DIRECTION_LOCK_PX && Math.abs(dy) < SWIPE_DIRECTION_LOCK_PX) {
        return;
      }
      if (Math.abs(dx) > Math.abs(dy)) {
        s.lock = 'h';
        cancelLongPress();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      } else {
        // Vertical scroll wins; bail so the page can pan.
        s.lock = 'v';
        cancelLongPress();
        startRef.current = null;
        return;
      }
    }

    if (s.lock === 'h') {
      const next = Math.min(0, Math.max(SWIPE_REVEAL_X * 1.3, swipeX + dx));
      setDragOffset(next);
      e.preventDefault();
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const s = startRef.current;
    cancelLongPress();
    if (s?.lock === 'h' && dragOffset !== null) {
      const final = dragOffset < SWIPE_REVEAL_X / 2 ? SWIPE_REVEAL_X : 0;
      setSwipeX(final);
      swipedRef.current = true;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    setDragOffset(null);
    startRef.current = null;
  }

  function onPointerCancel() {
    cancelLongPress();
    setDragOffset(null);
    startRef.current = null;
  }

  function handleToggleClick(e: React.MouseEvent) {
    if (swipedRef.current) {
      swipedRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (swipeX !== 0) {
      // Tap on a revealed row closes it instead of toggling done.
      e.preventDefault();
      setSwipeX(0);
      return;
    }
    if (editMode) {
      // In edit mode, tap toggles done as usual; reorder is via the handle.
      onToggle();
      return;
    }
    onToggle();
  }

  function handleDelete() {
    setSwipeX(0);
    onDelete();
  }

  const revealed = swipeX !== 0 || (dragOffset !== null && dragOffset < -4);

  return (
    <li ref={setNodeRef} style={liStyle}>
      <div className="relative overflow-hidden rounded-xl">
        <button
          type="button"
          data-no-swipe
          onClick={handleDelete}
          aria-label={`Remove ${product.name} from today`}
          tabIndex={revealed ? 0 : -1}
          className="absolute inset-y-0 right-0 flex items-center justify-center gap-1 bg-red-500 text-white text-xs font-semibold rounded-r-xl"
          style={{ width: Math.abs(SWIPE_REVEAL_X) }}
        >
          <Trash2 size={14} /> Delete
        </button>
        <div
          style={fgStyle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          className={`relative w-full flex items-stretch gap-1 rounded-xl border ${editMode ? 'pl-2 pr-1' : 'pl-2 pr-2'} text-left text-sm select-none ${
            done
              ? 'bg-glow-100 border-glow-300 text-glow-900'
              : 'bg-white border-glow-200 text-glow-800'
          } ${adHoc ? 'border-dashed' : ''}`}
        >
          <button
            type="button"
            onClick={handleToggleClick}
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
          {editMode && (
            <span
              data-no-swipe
              {...attributes}
              {...listeners}
              aria-label="Drag to reorder"
              className="flex items-center justify-center shrink-0 self-stretch -mr-1 px-3 text-glow-500 hover:text-glow-800 hover:bg-glow-100 active:bg-glow-200 cursor-grab active:cursor-grabbing touch-none rounded-r-xl"
            >
              <GripVertical size={22} />
            </span>
          )}
        </div>
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
