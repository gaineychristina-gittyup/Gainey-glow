import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation } from 'react-router-dom';
import { ArrowLeftRight, Bookmark, Check, Maximize2 } from 'lucide-react';
import {
  db,
  TREATMENT_TYPES,
  ZONES,
  type Comparison,
  type PhotoEntry,
  type Zone,
} from '../db/schema';
import ZonePicker from '../components/ZonePicker';
import PhotoThumb from '../components/PhotoThumb';
import CompareSlider, { DEFAULT_COMPARE_STATE, type CompareSliderState } from '../components/CompareSlider';
import PhotoViewer from '../components/PhotoViewer';
import { daysBetween, fmtDate, fmtDateShort, todayISO } from '../lib/date';
import { renderComparisonPreview } from '../lib/comparison';

interface ReferencePoint {
  kind: 'product' | 'treatment';
  id: number;
  shortLabel: string;   // "Pico"
  fullLabel: string;    // "Pico Laser"
  date: string;         // ISO
}

export default function Compare() {
  const location = useLocation();
  const seed = (location.state ?? null) as
    | { zone?: Zone; beforeId?: number; afterId?: number }
    | null;
  const [zone, setZone] = useState<Zone>(seed?.zone ?? 'full');
  const [beforeId, setBeforeId] = useState<number | undefined>(seed?.beforeId);
  const [afterId, setAfterId] = useState<number | undefined>(seed?.afterId);

  // Re-seed if user navigates here again with different selections.
  useEffect(() => {
    if (!seed) return;
    if (seed.zone) setZone(seed.zone);
    if (seed.beforeId !== undefined) setBeforeId(seed.beforeId);
    if (seed.afterId !== undefined) setAfterId(seed.afterId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
  const [viewing, setViewing] = useState<PhotoEntry | null>(null);
  const [pickerRole, setPickerRole] = useState<'before' | 'after' | null>(null);
  const [caption, setCaption] = useState('');
  const [referenceKey, setReferenceKey] = useState<string>('date');
  const [sliderState, setSliderState] = useState<CompareSliderState>(DEFAULT_COMPARE_STATE);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const photos = useLiveQuery(() => db.photos.where('zone').equals(zone).toArray(), [zone]);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const treatments = useLiveQuery(() => db.treatments.toArray(), []);

  const sorted = useMemo(
    () => [...(photos ?? [])].sort((a, b) => a.date.localeCompare(b.date) || a.takenAt - b.takenAt),
    [photos],
  );

  const autoBefore = sorted[0];
  const autoAfter = sorted[sorted.length - 1];

  const before = useMemo(
    () => sorted.find((p) => p.id === beforeId) ?? autoBefore,
    [sorted, beforeId, autoBefore],
  );
  const after = useMemo(
    () => sorted.find((p) => p.id === afterId) ?? autoAfter,
    [sorted, afterId, autoAfter],
  );

  // Build the reference-point list (recent first) from products + treatments.
  const referencePoints = useMemo<ReferencePoint[]>(() => {
    const out: ReferencePoint[] = [];
    (treatments ?? []).forEach((t) => {
      const full =
        t.customName || TREATMENT_TYPES.find((x) => x.id === t.type)?.label || 'Treatment';
      out.push({
        kind: 'treatment',
        id: t.id!,
        shortLabel: shorten(full),
        fullLabel: full,
        date: t.date,
      });
    });
    (products ?? []).forEach((p) => {
      out.push({
        kind: 'product',
        id: p.id!,
        shortLabel: shorten(p.brand || p.name),
        fullLabel: p.name,
        date: p.startedOn,
      });
    });
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [treatments, products]);

  const reference = useMemo(() => {
    if (referenceKey === 'date') return undefined;
    const [kind, idStr] = referenceKey.split(':');
    const id = Number(idStr);
    return referencePoints.find((r) => r.kind === kind && r.id === id);
  }, [referenceKey, referencePoints]);

  const beforeLabel = reference
    ? `Before · ${refLabel(reference, before?.date)}`
    : `Before · ${before ? fmtDate(before.date) : ''}`;
  const afterLabel = reference
    ? `After · ${refLabel(reference, after?.date)}`
    : `After · ${after ? fmtDate(after.date) : ''}`;

  async function save() {
    if (!before || !after || !before.id || !after.id) return;
    setSaveStatus('saving');
    try {
      const preview = await renderComparisonPreview({
        before: before.blob,
        after: after.blob,
        sliderPos: sliderState.pos,
        caption: buildEmbeddedCaption(caption, beforeLabel, afterLabel),
        beforeTransform: sliderState.before,
        afterTransform: sliderState.after,
      });
      const cmp: Comparison = {
        date: todayISO(),
        savedAt: Date.now(),
        beforePhotoId: before.id,
        afterPhotoId: after.id,
        zone,
        sliderPos: sliderState.pos,
        caption: caption.trim() || undefined,
        beforeZoom: sliderState.before.zoom,
        beforePanX: sliderState.before.panX,
        beforePanY: sliderState.before.panY,
        afterZoom: sliderState.after.zoom,
        afterPanX: sliderState.after.panX,
        afterPanY: sliderState.after.panY,
        referenceKind: reference?.kind,
        referenceId: reference?.id,
        referenceLabel: reference?.shortLabel,
        referenceDate: reference?.date,
        preview,
      };
      await db.comparisons.add(cmp);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 1800);
    } catch {
      setSaveStatus('idle');
    }
  }

  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="font-display text-xl text-glow-800 mb-3">Compare</h2>
        <label className="label">Zone</label>
        <ZonePicker
          value={zone}
          onChange={(z) => {
            setZone(z);
            setBeforeId(undefined);
            setAfterId(undefined);
            setSliderState(DEFAULT_COMPARE_STATE);
          }}
        />
        <p className="text-[11px] text-glow-500 mt-2">
          {ZONES.find((z) => z.id === zone)?.label} — {sorted.length} photo
          {sorted.length === 1 ? '' : 's'}.
        </p>
      </section>

      {before && after && before.id !== after.id ? (
        <section className="card space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              className="btn-soft text-xs"
              onClick={() => {
                const b = beforeId ?? before.id;
                const a = afterId ?? after.id;
                setBeforeId(a);
                setAfterId(b);
                setSliderState((s) => ({
                  ...s,
                  before: s.after,
                  after: s.before,
                  active: s.active === 'before' ? 'after' : 'before',
                }));
              }}
              aria-label="Swap Before and After"
            >
              <ArrowLeftRight size={14} /> Swap B↔A
            </button>
          </div>
          <CompareSlider
            beforeBlob={before.blob}
            afterBlob={after.blob}
            beforeLabel={beforeLabel}
            afterLabel={afterLabel}
            caption={buildEmbeddedCaption(caption, beforeLabel, afterLabel) || undefined}
            state={sliderState}
            onStateChange={setSliderState}
          />

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Reference point</label>
              <select
                className="input"
                value={referenceKey}
                onChange={(e) => setReferenceKey(e.target.value)}
              >
                <option value="date">Date only</option>
                {referencePoints.length > 0 && <optgroup label="Treatments">
                  {referencePoints
                    .filter((r) => r.kind === 'treatment')
                    .map((r) => (
                      <option key={`t-${r.id}`} value={`treatment:${r.id}`}>
                        {r.shortLabel} · {fmtDateShort(r.date)}
                      </option>
                    ))}
                </optgroup>}
                {referencePoints.some((r) => r.kind === 'product') && (
                  <optgroup label="Products started">
                    {referencePoints
                      .filter((r) => r.kind === 'product')
                      .map((r) => (
                        <option key={`p-${r.id}`} value={`product:${r.id}`}>
                          {r.shortLabel} · {fmtDateShort(r.date)}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
              <p className="text-[11px] text-glow-500 mt-1">
                Labels become e.g. <code>{reference ? `${reference.shortLabel} +Nd` : 'Mar 15'}</code>.
              </p>
            </div>

            <div>
              <label className="label">Caption (optional)</label>
              <input
                className="input"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="e.g. Pico laser results"
              />
              <p className="text-[11px] text-glow-500 mt-1">
                Shown on the comparison and saved with it.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-glow-700 font-semibold">Before</div>
              <div className="text-glow-600">{fmtDate(before.date)}</div>
              {reference && (
                <div className="text-glow-500">{refLabel(reference, before.date)}</div>
              )}
              {before.notes ? <div className="text-glow-500 mt-1">{before.notes}</div> : null}
            </div>
            <div>
              <div className="text-glow-700 font-semibold">After</div>
              <div className="text-glow-600">{fmtDate(after.date)}</div>
              {reference && (
                <div className="text-glow-500">{refLabel(reference, after.date)}</div>
              )}
              {after.notes ? <div className="text-glow-500 mt-1">{after.notes}</div> : null}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              className="btn-primary"
              onClick={save}
              disabled={saveStatus === 'saving'}
            >
              {saveStatus === 'saved' ? <Check size={16} /> : <Bookmark size={16} />}
              {saveStatus === 'saved' ? 'Saved to Timeline' : 'Save to Timeline'}
            </button>
          </div>
        </section>
      ) : (
        <section className="card">
          <p className="text-sm text-glow-600/80">
            You need at least two photos in this zone to compare.
          </p>
        </section>
      )}

      <section className="card">
        <h3 className="font-display text-lg text-glow-800 mb-2">Pick photos</h3>
        {sorted.length === 0 ? (
          <p className="text-sm text-glow-600/80">No photos for this zone yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <PickerTile
                role="before"
                photo={before}
                onOpen={() => setPickerRole('before')}
                onClear={() => setBeforeId(undefined)}
              />
              <PickerTile
                role="after"
                photo={after}
                onOpen={() => setPickerRole('after')}
                onClear={() => setAfterId(undefined)}
              />
            </div>
            <p className="text-[11px] text-glow-500 mt-2">
              Tap a tile to pick its photo. Older dates are usually Before, newer dates After.
            </p>
          </>
        )}
      </section>

      {pickerRole && (
        <PhotoPickerModal
          role={pickerRole}
          photos={sorted}
          currentBeforeId={before?.id}
          currentAfterId={after?.id}
          onPick={(p) => {
            if (pickerRole === 'before') {
              if ((after?.id ?? -1) === p.id) setAfterId(undefined);
              setBeforeId(p.id);
            } else {
              if ((before?.id ?? -1) === p.id) setBeforeId(undefined);
              setAfterId(p.id);
            }
            setSliderState(DEFAULT_COMPARE_STATE);
            setPickerRole(null);
          }}
          onClose={() => setPickerRole(null)}
          onView={(p) => {
            setViewing(p);
            setPickerRole(null);
          }}
        />
      )}

      {viewing && <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function PickerTile({
  role,
  photo,
  onOpen,
  onClear,
}: {
  role: 'before' | 'after';
  photo: PhotoEntry | undefined;
  onOpen: () => void;
  onClear: () => void;
}) {
  const label = role === 'before' ? 'Before' : 'After';
  return (
    <div className="rounded-2xl border border-glow-200 overflow-hidden">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full aspect-square bg-glow-50 relative focus:outline-none focus:ring-2 focus:ring-glow-500"
        aria-label={`Choose ${label} photo`}
      >
        {photo ? (
          <PhotoThumb blob={photo.thumb} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-glow-600">
            Tap to choose
          </div>
        )}
        <span className="absolute top-2 left-2 chip bg-white/90 text-glow-800 text-[10px] font-semibold uppercase tracking-wide">
          {label}
        </span>
      </button>
      <div className="px-3 py-2 flex items-baseline justify-between gap-2 bg-white/60">
        <div className="text-xs text-glow-800 truncate">
          {photo ? fmtDate(photo.date) : <span className="text-glow-500">No photo</span>}
        </div>
        {photo && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-glow-600 hover:text-red-700 hover:underline"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function PhotoPickerModal({
  role,
  photos,
  currentBeforeId,
  currentAfterId,
  onPick,
  onClose,
  onView,
}: {
  role: 'before' | 'after';
  photos: PhotoEntry[];
  currentBeforeId?: number;
  currentAfterId?: number;
  onPick: (p: PhotoEntry) => void;
  onClose: () => void;
  onView: (p: PhotoEntry) => void;
}) {
  const label = role === 'before' ? 'Before' : 'After';
  // Show oldest-first when picking Before, newest-first when picking After.
  const ordered = role === 'before' ? photos : [...photos].reverse();
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black/60">
      <div className="bg-white shadow-md mt-auto sm:my-auto sm:mx-auto sm:max-w-lg sm:rounded-2xl rounded-t-2xl flex flex-col max-h-[85vh] sm:max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-glow-100">
          <h3 className="font-display text-lg text-glow-800">Choose {label} photo</h3>
          <button
            type="button"
            className="btn-ghost p-2"
            onClick={onClose}
            aria-label="Close picker"
          >
            <Maximize2 size={16} className="rotate-45" />
          </button>
        </div>
        <div className="overflow-y-auto p-3 grid grid-cols-3 gap-2">
          {ordered.map((p) => {
            const isB = currentBeforeId === p.id;
            const isA = currentAfterId === p.id;
            const taken = isB || isA;
            const role2 = isB ? 'B' : isA ? 'A' : null;
            return (
              <div
                key={p.id}
                className="relative rounded-xl overflow-hidden border-2 border-transparent"
              >
                <button
                  type="button"
                  className="absolute inset-0 block focus:outline-none focus:ring-2 focus:ring-glow-500"
                  onClick={() => onPick(p)}
                  aria-label={`Use as ${label}: ${p.date}`}
                >
                  <PhotoThumb blob={p.thumb} className="w-full h-full object-cover aspect-square" />
                </button>
                <span className="absolute bottom-1 left-1 chip bg-white/90 text-[10px] font-medium pointer-events-none">
                  {fmtDate(p.date)}
                </span>
                {role2 && (
                  <span className="absolute top-1 left-1 chip bg-glow-600 text-white text-[10px] pointer-events-none">
                    {role2}
                  </span>
                )}
                <button
                  type="button"
                  className="absolute top-1 right-1 bg-white/90 hover:bg-white rounded-full p-1 shadow-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onView(p);
                  }}
                  aria-label="Open photo details"
                >
                  <Maximize2 size={12} className="text-glow-800" />
                </button>
                {taken && role2 !== (role === 'before' ? 'B' : 'A') && (
                  <span className="absolute inset-x-0 bottom-0 bg-glow-600/80 text-white text-[10px] text-center py-0.5 pointer-events-none">
                    will swap roles
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function shorten(s: string): string {
  // First word, capped at ~12 chars.
  const w = s.split(/\s+/)[0] || s;
  return w.length > 12 ? w.slice(0, 12) : w;
}

function refLabel(ref: ReferencePoint, photoDate?: string): string {
  if (!photoDate) return ref.shortLabel;
  const d = daysBetween(ref.date, photoDate);
  if (d === 0) return `${ref.shortLabel} day 0`;
  return `${ref.shortLabel} ${d > 0 ? '+' : ''}${d}d`;
}

function buildEmbeddedCaption(custom: string, beforeLabel: string, afterLabel: string): string {
  const parts = [custom.trim(), `${stripPrefix(beforeLabel)} → ${stripPrefix(afterLabel)}`].filter(
    Boolean,
  );
  return parts.join(' · ');
}

function stripPrefix(s: string): string {
  return s.replace(/^Before · |^After · /, '');
}

