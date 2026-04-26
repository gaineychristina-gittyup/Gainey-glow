import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { db, TREATMENT_TYPES, type Treatment, type TreatmentType } from '../db/schema';
import { AFTERCARE } from '../data/aftercare';

export function AftercareList({ plan }: { plan: (typeof AFTERCARE)[TreatmentType] }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3 mt-2">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mb-1">
          Do
        </div>
        <ul className="space-y-1 text-xs text-glow-800 list-disc pl-4">
          {plan.do.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      </div>
      {plan.avoid.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-red-700 mb-1">
            Avoid
          </div>
          <ul className="space-y-1 text-xs text-glow-800 list-disc pl-4">
            {plan.avoid.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function TreatmentEditor({
  initial,
  onClose,
  onSave,
}: {
  initial: Treatment;
  onClose: () => void;
  onSave: (t: Treatment) => void;
}) {
  const [draft, setDraft] = useState<Treatment>(initial);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const update = <K extends keyof Treatment>(key: K, value: Treatment[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const plan = AFTERCARE[draft.type];

  async function del() {
    if (!initial.id) return;
    await db.treatments.delete(initial.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-3">
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg text-glow-800">
            {initial.id ? 'Edit treatment' : 'Log treatment'}
          </h3>
          <button className="btn-ghost p-2" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="label">Type</label>
            <select
              className="input"
              value={draft.type}
              onChange={(e) => update('type', e.target.value as TreatmentType)}
            >
              {TREATMENT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Custom name (optional)</label>
            <input
              className="input"
              value={draft.customName ?? ''}
              onChange={(e) => update('customName', e.target.value)}
              placeholder="e.g. Halo Laser session 1"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input
                type="date"
                className="input"
                value={draft.date}
                onChange={(e) => update('date', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Provider</label>
              <input
                className="input"
                value={draft.provider ?? ''}
                onChange={(e) => update('provider', e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea
              className="input min-h-[60px]"
              value={draft.notes ?? ''}
              onChange={(e) => update('notes', e.target.value)}
            />
          </div>

          <div className="rounded-xl bg-glow-50 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-glow-700 mb-1">
              Aftercare preview
            </div>
            <p className="text-xs text-glow-800">{plan.summary}</p>
            <AftercareList plan={plan} />
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-2 justify-end">
            {initial.id && !confirmingDelete && (
              <button
                type="button"
                className="btn-ghost text-red-600 mr-auto"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
            {initial.id && confirmingDelete && (
              <div className="flex items-center gap-1.5 mr-auto">
                <span className="text-xs text-red-700">Delete?</span>
                <button
                  type="button"
                  className="btn-ghost text-xs px-2 py-1"
                  onClick={() => setConfirmingDelete(false)}
                >
                  No
                </button>
                <button
                  type="button"
                  className="rounded-full bg-red-600 text-white text-xs font-medium px-3 py-1"
                  onClick={del}
                >
                  Yes
                </button>
              </div>
            )}
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={() => onSave(draft)}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
