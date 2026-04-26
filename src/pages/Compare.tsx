import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Maximize2 } from 'lucide-react';
import { db, ZONES, type Zone, type PhotoEntry } from '../db/schema';
import ZonePicker from '../components/ZonePicker';
import PhotoThumb from '../components/PhotoThumb';
import CompareSlider from '../components/CompareSlider';
import PhotoViewer from '../components/PhotoViewer';
import { fmtDate, fmtDateShort } from '../lib/date';

export default function Compare() {
  const [zone, setZone] = useState<Zone>('full');
  const [beforeId, setBeforeId] = useState<number | undefined>();
  const [afterId, setAfterId] = useState<number | undefined>();
  const [viewing, setViewing] = useState<PhotoEntry | null>(null);

  const photos = useLiveQuery(
    () => db.photos.where('zone').equals(zone).toArray(),
    [zone],
  );

  const sorted = useMemo(
    () => [...(photos ?? [])].sort((a, b) => a.takenAt - b.takenAt),
    [photos],
  );

  // Auto-pick oldest and newest when zone changes / photos load
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

  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="font-display text-xl text-glow-800 mb-3">Compare</h2>
        <label className="label">Zone</label>
        <ZonePicker value={zone} onChange={(z) => { setZone(z); setBeforeId(undefined); setAfterId(undefined); }} />
        <p className="text-[11px] text-glow-500 mt-2">
          {ZONES.find((z) => z.id === zone)?.label} — {sorted.length} photo{sorted.length === 1 ? '' : 's'}.
        </p>
      </section>

      {before && after && before.id !== after.id ? (
        <section className="card">
          <CompareSlider
            beforeBlob={before.blob}
            afterBlob={after.blob}
            beforeLabel={`Before · ${fmtDateShort(before.date)}`}
            afterLabel={`After · ${fmtDateShort(after.date)}`}
          />
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-glow-700 font-semibold">Before</div>
              <div className="text-glow-600">{fmtDate(before.date)}</div>
              {before.notes ? <div className="text-glow-500 mt-1">{before.notes}</div> : null}
            </div>
            <div>
              <div className="text-glow-700 font-semibold">After</div>
              <div className="text-glow-600">{fmtDate(after.date)}</div>
              {after.notes ? <div className="text-glow-500 mt-1">{after.notes}</div> : null}
            </div>
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
