import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bookmark, Check, Maximize2 } from 'lucide-react';
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
import CompareSlider, { type CompareSliderState } from '../components/CompareSlider';
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
  const [zone, setZone] = useState<Zone>('full');
  const [beforeId, setBeforeId] = useState<number | undefined>();
  const [afterId, setAfterId] = useState<number | undefined>();
  const [viewing, setViewing] = useState<PhotoEntry | null>(null);
  const [caption, setCaption] = useState('');
  const [referenceKey, setReferenceKey] = useState<string>('date');
  const [sliderState, setSliderState] = useState<CompareSliderState>({
    pos: 50,
    zoom: 1,
    panX: 0,
    panY: 0,
  });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const photos = useLiveQuery(() => db.photos.where('zone').equals(zone).toArray(), [zone]);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const treatments = useLiveQuery(() => db.treatments.toArray(), []);

  const sorted = useMemo(
    () => [...(photos ?? [])].sort((a, b) => a.takenAt - b.takenAt),
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
    : `Before · ${before ? fmtDateShort(before.date) : ''}`;
  const afterLabel = reference
    ? `After · ${refLabel(reference, after?.date)}`
    : `After · ${after ? fmtDateShort(after.date) : ''}`;

  async function save() {
    if (!before || !after || !before.id || !after.id) return;
    setSaveStatus('saving');
    try {
      const preview = await renderComparisonPreview({
        before: before.blob,
        after: after.blob,
        sliderPos: sliderState.pos,
        caption: buildEmbeddedCaption(caption, beforeLabel, afterLabel),
      });
      const cmp: Comparison = {
        date: todayISO(),
        savedAt: Date.now(),
        beforePhotoId: before.id,
        afterPhotoId: after.id,
        zone,
        sliderPos: sliderState.pos,
        caption: caption.trim() || undefined,
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
            setSliderState({ pos: 50, zoom: 1, panX: 0, panY: 0 });
          }}
        />
        <p className="text-[11px] text-glow-500 mt-2">
          {ZONES.find((z) => z.id === zone)?.label} — {sorted.length} photo
          {sorted.length === 1 ? '' : 's'}.
        </p>
      </section>

      {before && after && before.id !== after.id ? (
        <section className="card space-y-3">
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
                onPick={() => {
                  if ((before?.id ?? -1) === p.id) {
                    setBeforeId(undefined);
                  } else if ((after?.id ?? -1) === p.id) {
                    setAfterId(undefined);
                  } else if (!beforeId) {
                    setBeforeId(p.id);
                  } else {
                    setAfterId(p.id);
                  }
                  setSliderState({ pos: 50, zoom: 1, panX: 0, panY: 0 });
                }}
                onView={() => setViewing(p)}
              />
            ))}
          </div>
        )}
        <p className="text-[11px] text-glow-500 mt-2">
          Tap a photo to set it as Before or After. Tap the corner icon to view or delete it.
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
  onPick,
  onView,
}: {
  photo: PhotoEntry;
  isBefore: boolean;
  isAfter: boolean;
  onPick: () => void;
  onView: () => void;
}) {
  return (
    <div
      className={`relative aspect-square rounded-xl overflow-hidden border-2 transition ${
        isBefore || isAfter ? 'border-glow-600' : 'border-transparent'
      }`}
    >
      <button
        type="button"
        onClick={onPick}
        className="absolute inset-0 block focus:outline-none"
        aria-label={`Select photo from ${photo.date}`}
      >
        <PhotoThumb blob={photo.thumb} className="w-full h-full object-cover" alt={photo.date} />
      </button>
      <span className="absolute bottom-1 left-1 chip bg-white/90 text-[10px] pointer-events-none">
        {fmtDateShort(photo.date)}
      </span>
      {isBefore && (
        <span className="absolute top-1 left-1 chip bg-glow-600 text-white pointer-events-none">B</span>
      )}
      {isAfter && (
        <span className="absolute bottom-1 right-1 chip bg-glow-600 text-white pointer-events-none">A</span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onView();
        }}
        aria-label="Open photo"
        className="absolute top-1 right-1 bg-white/90 hover:bg-white rounded-full p-1 shadow-sm"
      >
        <Maximize2 size={12} className="text-glow-800" />
      </button>
    </div>
  );
}
