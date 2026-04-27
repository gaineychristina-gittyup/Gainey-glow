// Full-screen single-photo viewer with delete and zone-change actions.

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Calendar, Trash2, X } from 'lucide-react';
import { db, ZONES, type PhotoEntry, type Zone } from '../db/schema';
import { fmtDate } from '../lib/date';

export default function PhotoViewer({
  photo: initialPhoto,
  onClose,
}: {
  photo: PhotoEntry;
  onClose: () => void;
}) {
  // Stay in sync with the DB so zone/date edits update the UI immediately.
  const live = useLiveQuery(
    () => (initialPhoto.id ? db.photos.get(initialPhoto.id) : undefined),
    [initialPhoto.id],
  );
  const photo = live ?? initialPhoto;

  const [src, setSrc] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(photo.blob);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [photo.blob]);

  async function setZone(z: Zone) {
    if (z === photo.zone || !photo.id) return;
    setBusy(true);
    try {
      await db.photos.update(photo.id, { zone: z });
    } finally {
      setBusy(false);
    }
  }

  async function setDate(date: string) {
    if (!photo.id || !date || date === photo.date) return;
    setBusy(true);
    try {
      // Treat the new date as local midnight for takenAt; keeps sort stable.
      const [y, m, d] = date.split('-').map(Number);
      const takenAt = new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
      await db.photos.update(photo.id, { date, takenAt });
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!photo.id) return;
    setBusy(true);
    try {
      await db.photos.delete(photo.id);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-white">
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold">{fmtDate(photo.date)}</span>
          <span className="text-[11px] opacity-80">
            {ZONES.find((z) => z.id === photo.zone)?.label}
          </span>
        </div>
        <label className="inline-flex items-center gap-1 bg-white/15 rounded-full px-2 py-1 text-[11px] cursor-pointer">
          <Calendar size={12} />
          <input
            type="date"
            value={photo.date}
            onChange={(e) => setDate(e.target.value)}
            disabled={busy}
            className="bg-transparent border-0 text-white text-[11px] outline-none [color-scheme:dark]"
          />
        </label>
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-2 rounded-full hover:bg-white/10"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-3">
        {src && (
          <img
            src={src}
            alt={`${photo.zone} on ${photo.date}`}
            className="max-h-full max-w-full rounded-xl"
          />
        )}
      </div>

      {photo.notes && (
        <div className="px-4 py-2 text-xs text-white/80 italic max-h-24 overflow-y-auto">
          {photo.notes}
        </div>
      )}

      <div className="bg-black/80 px-3 pt-2 pb-1">
        <div className="text-[10px] uppercase tracking-wide text-white/60 mb-1">
          Reclassify region
        </div>
        <div className="overflow-x-auto -mx-3 px-3">
          <div className="flex gap-2 min-w-max">
            {ZONES.map((z) => (
              <button
                key={z.id}
                onClick={() => setZone(z.id)}
                disabled={busy}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  photo.zone === z.id
                    ? 'bg-white text-glow-800'
                    : 'bg-white/15 text-white/90 hover:bg-white/25'
                }`}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-black flex items-center justify-end px-3 py-3 gap-2">
        {confirming ? (
          <>
            <span className="text-xs text-white/80 mr-2">Delete this photo?</span>
            <button
              className="rounded-full px-4 py-2 text-sm font-medium bg-white/15 text-white hover:bg-white/25"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="rounded-full px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700"
              onClick={del}
              disabled={busy}
            >
              Delete
            </button>
          </>
        ) : (
          <button
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium bg-red-600/90 text-white hover:bg-red-600"
            onClick={() => setConfirming(true)}
            disabled={busy}
          >
            <Trash2 size={16} /> Delete photo
          </button>
        )}
      </div>
    </div>
  );
}
