import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { db, type Insight } from '../db/schema';

export function InsightEditor({
  initial,
  onClose,
  onSave,
}: {
  initial: Insight;
  onClose: () => void;
  onSave: (i: Insight) => void;
}) {
  const [draft, setDraft] = useState<Insight>(initial);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const update = <K extends keyof Insight>(key: K, value: Insight[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const canSave = draft.text.trim().length > 0;

  async function del() {
    if (!initial.id) return;
    await db.insights.delete(initial.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-3">
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg text-glow-800">
            {initial.id ? 'Edit insight' : 'Add insight'}
          </h3>
          <button className="btn-ghost p-2" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
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
            <label className="label">Title (optional)</label>
            <input
              className="input"
              value={draft.title ?? ''}
              onChange={(e) => update('title', e.target.value)}
              placeholder="e.g. Tretinoin is finally settling"
            />
          </div>
          <div>
            <label className="label">Insight</label>
            <textarea
              className="input min-h-[140px]"
              value={draft.text}
              onChange={(e) => update('text', e.target.value)}
              placeholder="What did you notice today? Patterns, reactions, wins, things to revisit…"
              autoFocus
            />
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
            <button
              type="button"
              className="btn-primary"
              disabled={!canSave}
              onClick={() => onSave(draft)}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
