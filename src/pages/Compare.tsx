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
            caption={caption.trim() || undefined}
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
        <h3 className="font-display text-lg text-glow-800 mb-3">All photos in this zone</h3>
        {sorted.length === 0 ? (
          <p className="text-sm text-glow-600/80">No photos for this zone yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {sorted.map((p) => (
              <SelectablePhoto
                key={p.id}
                photo={p}
                isBefore={(before?.id ?? -1) === p.id}
                isAfter={(after?.id ?? -1) === p.id}
                onPickAs={(role) => {
                  if (role === 'before') {
                    if ((before?.id ?? -1) === p.id) setBeforeId(undefined);
                    else {
                      if ((after?.id ?? -1) === p.id) setAfterId(undefined);
                      setBeforeId(p.id);
                    }
                  } else {
                    if ((after?.id ?? -1) === p.id) setAfterId(undefined);
                    else {
                      if ((before?.id ?? -1) === p.id) setBeforeId(undefined);
                      setAfterId(p.id);
                    }
                  }
                  setSliderState(DEFAULT_COMPARE_STATE);
                }}
                onView={() => setViewing(p)}
              />
            ))}
          </div>
        )}
        <p className="text-[11px] text-glow-500 mt-2">
          Tap <span className="font-semibold">B</span> or <span className="font-semibold">A</span> on any photo to set it as Before or After. Tap the corner icon to open it (also lets you change its date or zone).
        </p>
      </section>

      {viewing && <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />}
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

function SelectablePhoto({
  photo,
  isBefore,
  isAfter,
  onPickAs,
  onView,
}: {
  photo: PhotoEntry;
  isBefore: boolean;
  isAfter: boolean;
  onPickAs: (role: 'before' | 'after') => void;
  onView: () => void;
}) {
  return (
    <div
      className={`relative aspect-square rounded-xl overflow-hidden border-2 transition ${
        isBefore || isAfter ? 'border-glow-600' : 'border-transparent'
      }`}
    >
      <PhotoThumb blob={photo.thumb} className="w-full h-full object-cover" alt={photo.date} />
      <span className="absolute bottom-1 left-1 chip bg-white/90 text-[10px] pointer-events-none">
        {fmtDate(photo.date)}
      </span>
      <div className="absolute top-1 left-1 flex gap-1">
        <button
          type="button"
          onClick={() => onPickAs('before')}
          aria-pressed={isBefore}
          aria-label={isBefore ? 'Unset Before' : 'Set as Before'}
          className={`h-6 min-w-[24px] rounded-full text-[11px] font-bold flex items-center justify-center shadow-sm ${
            isBefore ? 'bg-glow-600 text-white' : 'bg-white/90 text-glow-700 hover:bg-white'
          }`}
        >
          B
        </button>
        <button
          type="button"
          onClick={() => onPickAs('after')}
          aria-pressed={isAfter}
          aria-label={isAfter ? 'Unset After' : 'Set as After'}
          className={`h-6 min-w-[24px] rounded-full text-[11px] font-bold flex items-center justify-center shadow-sm ${
            isAfter ? 'bg-glow-700 text-white' : 'bg-white/90 text-glow-700 hover:bg-white'
          }`}
        >
          A
        </button>
      </div>
      <button
        type="button"
        onClick={onView}
        aria-label="Open photo"
        className="absolute top-1 right-1 bg-white/90 hover:bg-white rounded-full p-1 shadow-sm"
      >
        <Maximize2 size={12} className="text-glow-800" />
      </button>
    </div>
  );
}
