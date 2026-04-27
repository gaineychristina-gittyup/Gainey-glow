// Shown after the user picks files via "Upload old". Each item gets its
// own zone picker and shows the detected capture date. An optional
// "Auto-detect with Gemini" button classifies the zone of every item.

import { useEffect, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { db, ZONES, type Zone } from '../db/schema';
import { fmtDateShort } from '../lib/date';
import { readPhotoDate, type DateSource } from '../lib/exif';
import { compressForStorage, makeThumbnail } from '../lib/image';
import { classifyPhotoZone } from '../lib/gemini';
import { getGeminiKey } from '../lib/settings';
import { requestPersistentStorage } from '../lib/storage';

interface PendingItem {
  file: File;
  thumbUrl: string;
  thumbBlob: Blob;
  width: number;
  height: number;
  date: string;
  takenAt: number;
  source: DateSource;
  zone: Zone;
  classifying?: boolean;
}

export default function UploadReviewModal({
  files,
  defaultZone,
  onClose,
  onSaved,
}: {
  files: File[];
  defaultZone: Zone;
  onClose: () => void;
  onSaved: (saved: { count: number; earliest?: string; latest?: string; withExif: number }) => void;
}) {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let revoked = false;
    (async () => {
      const out: PendingItem[] = [];
      for (const file of files) {
        const { date, takenAt, source } = await readPhotoDate(file);
        const { thumb, width, height } = await makeThumbnail(file, 480);
        out.push({
          file,
          thumbBlob: thumb,
          thumbUrl: URL.createObjectURL(thumb),
          width,
          height,
          date,
          takenAt,
          source,
          zone: defaultZone,
        });
      }
      if (!revoked) {
        setItems(out);
        setLoading(false);
      } else {
        out.forEach((i) => URL.revokeObjectURL(i.thumbUrl));
      }
    })();
    return () => {
      revoked = true;
    };
  }, [files, defaultZone]);

  // Clean up object URLs when modal unmounts
  useEffect(() => {
    return () => {
      items.forEach((i) => URL.revokeObjectURL(i.thumbUrl));
    };
  }, [items]);

  const setZone = (idx: number, zone: Zone) =>
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, zone } : it)));

  async function autoClassify() {
    setClassifyError(null);
    if (!getGeminiKey()) {
      setClassifyError('Add your Gemini API key in Settings to auto-detect zones.');
      return;
    }
    setClassifying(true);
    try {
      for (let i = 0; i < items.length; i += 1) {
        setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, classifying: true } : it)));
        try {
          const z = await classifyPhotoZone(items[i].thumbBlob);
          setItems((arr) =>
            arr.map((it, idx) => (idx === i ? { ...it, zone: z, classifying: false } : it)),
          );
        } catch {
          setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, classifying: false } : it)));
        }
      }
    } finally {
      setClassifying(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      let withExif = 0;
      const dates: string[] = [];
      for (const it of items) {
        if (it.source === 'exif') withExif += 1;
        const compressed = await compressForStorage(it.file);
        await db.photos.add({
          date: it.date,
          takenAt: it.takenAt,
          zone: it.zone,
          blob: compressed.blob,
          thumb: it.thumbBlob,
          width: compressed.width,
          height: compressed.height,
        });
        dates.push(it.date);
      }
      void requestPersistentStorage();
      const sorted = [...dates].sort();
      onSaved({
        count: items.length,
        earliest: sorted[0],
        latest: sorted[sorted.length - 1],
        withExif,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-3">
      <div className="card w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-lg text-glow-800">
            Review {files.length} photo{files.length === 1 ? '' : 's'}
          </h3>
          <button className="btn-ghost p-2" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-glow-600 mb-3">
          Assign a face zone to each photo. Capture date is read from each photo's
          EXIF metadata when available.
        </p>

        <div className="flex justify-between items-center mb-3 gap-2">
          <button
            type="button"
            className="btn-soft text-xs"
            onClick={autoClassify}
            disabled={classifying || loading || items.length === 0}
          >
            {classifying ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            Auto-detect zones
          </button>
          <span className="text-[11px] text-glow-500">
            {classifying ? 'Classifying with Gemini…' : ''}
          </span>
        </div>

        {classifyError && (
          <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
            {classifyError}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-glow-600/80 py-6 text-center">Reading photos…</div>
        ) : (
          <ul className="space-y-3">
            {items.map((it, idx) => (
              <li key={idx} className="flex gap-3 items-start">
                <img
                  src={it.thumbUrl}
                  alt=""
                  className="w-20 h-20 object-cover rounded-xl flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-glow-700">
                      {fmtDateShort(it.date)}
                    </span>
                    <span className="text-[10px] text-glow-500">
                      {it.source === 'exif'
                        ? 'from EXIF'
                        : it.source === 'fileModified'
                        ? 'file modified'
                        : 'today'}
                    </span>
                    {it.classifying && (
                      <Loader2 size={11} className="animate-spin text-glow-500" />
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {ZONES.map((z) => (
                      <button
                        key={z.id}
                        type="button"
                        onClick={() => setZone(idx, z.id)}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium border transition ${
                          it.zone === z.id
                            ? 'bg-glow-600 text-white border-glow-600'
                            : 'bg-white text-glow-700 border-glow-200 hover:bg-glow-50'
                        }`}
                      >
                        {z.label}
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2 pt-4 mt-3 border-t border-glow-100">
          <button className="btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={save}
            disabled={loading || saving || items.length === 0}
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : null}
            Save {items.length}
          </button>
        </div>
      </div>
    </div>
  );
}
