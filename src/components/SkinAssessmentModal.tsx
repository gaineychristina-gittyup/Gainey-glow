// AI assessment of a single photo. Shown after the user takes a picture
// (when a Gemini API key is configured) and again from the photo viewer.
// Persists the result in db.skinAssessments so it doesn't re-run.

import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Sparkles, X } from 'lucide-react';
import {
  CONCERNS,
  ZONES,
  db,
  type AssessmentSeverity,
  type PhotoEntry,
  type SkinAssessment,
} from '../db/schema';
import { fmtDate } from '../lib/date';
import { assessSkinFromImage } from '../lib/gemini';
import { getGeminiKey, getGeminiModel } from '../lib/settings';
import PhotoThumb from './PhotoThumb';

const SEVERITY_TONE: Record<AssessmentSeverity, string> = {
  mild: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  moderate: 'bg-amber-100 text-amber-800 border border-amber-200',
  pronounced: 'bg-red-100 text-red-800 border border-red-200',
};

export default function SkinAssessmentModal({
  photo,
  onClose,
}: {
  photo: PhotoEntry;
  onClose: () => void;
}) {
  const photoId = photo.id;

  // If we already assessed this photo before, surface the saved version
  // instead of re-running the API call.
  const saved = useLiveQuery(
    () =>
      photoId == null
        ? undefined
        : db.skinAssessments.where('photoId').equals(photoId).first(),
    [photoId],
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    // Wait for the live query to settle (undefined = still loading) before
    // deciding to make the API call.
    if (saved === undefined) return;
    if (saved) return;
    if (ranRef.current) return;
    if (photoId == null) return;
    if (!getGeminiKey()) {
      setError('Add your Gemini API key in Settings to run AI assessments.');
      return;
    }
    ranRef.current = true;
    void runAssessment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, photoId]);

  async function runAssessment() {
    if (photoId == null) return;
    setLoading(true);
    setError(null);
    try {
      const profile = await db.profile.get('me');
      const sensitivities = await db.sensitivities.toArray();
      const concernLabels = (profile?.primaryConcerns ?? []).map(
        (id) => CONCERNS.find((c) => c.id === id)?.label ?? id,
      );
      const result = await assessSkinFromImage({
        image: photo.blob,
        zone: photo.zone,
        concerns: concernLabels,
        sensitivities: sensitivities.map((s) => s.ingredient),
      });
      const row: SkinAssessment = {
        photoId,
        date: photo.date,
        createdAt: Date.now(),
        zone: photo.zone,
        model: getGeminiModel(),
        overall: result.overall,
        observations: result.observations,
        positives: result.positives,
        suggestions: result.suggestions,
      };
      // Upsert: if a row already exists (e.g. retry race), replace it. The
      // photoId index is unique so put() collapses races to a single row.
      const existing = await db.skinAssessments
        .where('photoId')
        .equals(photoId)
        .first();
      if (existing?.id) {
        await db.skinAssessments.put({ ...row, id: existing.id });
      } else {
        await db.skinAssessments.add(row);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to assess.');
    } finally {
      setLoading(false);
    }
  }

  async function reassess() {
    if (photoId == null) return;
    const existing = await db.skinAssessments
      .where('photoId')
      .equals(photoId)
      .first();
    if (existing?.id) await db.skinAssessments.delete(existing.id);
    ranRef.current = false;
    setError(null);
    await runAssessment();
    ranRef.current = true;
  }

  const zoneLabel = ZONES.find((z) => z.id === photo.zone)?.label ?? photo.zone;
  const showRetry = !loading && !!error && !!getGeminiKey();

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-3">
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2.5">
            <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-glow-200">
              <PhotoThumb
                blob={photo.thumb}
                alt=""
                className="h-full w-full object-cover"
              />
            </span>
            <div>
              <h3 className="font-display text-lg text-glow-800 flex items-center gap-1.5">
                <Sparkles size={16} className="text-glow-600" /> Skin assessment
              </h3>
              <p className="text-[11px] text-glow-600">
                {fmtDate(photo.date)} · {zoneLabel}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="btn-ghost p-1.5"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-glow-600 mb-3">
          AI read of what's visible in this photo. Informational only — not
          medical advice.
        </p>

        {loading && (
          <div className="text-sm text-glow-700 py-6 text-center">
            Asking Gemini…
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
            {error}
            {showRetry && (
              <button
                type="button"
                className="ml-2 underline font-medium"
                onClick={() => {
                  ranRef.current = false;
                  void runAssessment();
                  ranRef.current = true;
                }}
              >
                Retry
              </button>
            )}
          </div>
        )}

        {saved && !loading && !error && (
          <AssessmentBody assessment={saved} />
        )}

        <div className="mt-4 flex justify-end gap-2">
          {saved && !loading && (
            <button
              className="btn-soft text-xs"
              onClick={reassess}
              disabled={!getGeminiKey()}
              title="Run the assessment again"
            >
              <Sparkles size={14} /> Re-assess
            </button>
          )}
          <button className="btn-ghost text-xs" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function AssessmentBody({ assessment }: { assessment: SkinAssessment }) {
  return (
    <div className="space-y-3">
      {assessment.overall && (
        <p className="text-sm text-glow-900 leading-snug">{assessment.overall}</p>
      )}

      {assessment.observations.length > 0 && (
        <div>
          <div className="label">Observations</div>
          <ul className="space-y-1.5">
            {assessment.observations.map((o, i) => (
              <li
                key={i}
                className="rounded-xl border border-glow-200 bg-white/70 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-glow-900">
                    {o.label}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEVERITY_TONE[o.severity]}`}
                  >
                    {o.severity}
                  </span>
                </div>
                {o.note && (
                  <div className="mt-0.5 text-xs text-glow-700">{o.note}</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {assessment.positives.length > 0 && (
        <div>
          <div className="label">Looking good</div>
          <ul className="list-disc pl-4 space-y-0.5 text-xs text-glow-800">
            {assessment.positives.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {assessment.suggestions.length > 0 && (
        <div>
          <div className="label">Suggestions</div>
          <ul className="list-disc pl-4 space-y-0.5 text-xs text-glow-800">
            {assessment.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
