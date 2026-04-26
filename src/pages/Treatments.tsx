import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { TREATMENT_TYPES, db, type Treatment, type TreatmentType } from '../db/schema';
import { AFTERCARE } from '../data/aftercare';
import { fmtDate, relDays, todayISO, daysBetween } from '../lib/date';

const blank: Treatment = {
  type: 'facial',
  date: todayISO(),
};

export default function Treatments() {
  const [editing, setEditing] = useState<Treatment | null>(null);
  const treatments = useLiveQuery(
    () => db.treatments.orderBy('date').reverse().toArray(),
    [],
  );

  const activeAftercare = useMemo(() => {
    if (!treatments) return [];
    const today = todayISO();
    return treatments.filter((t) => {
      const plan = AFTERCARE[t.type];
      const elapsed = daysBetween(t.date, today);
      return elapsed >= 0 && elapsed <= plan.durationDays;
    });
  }, [treatments]);

  return (
    <div className="space-y-4">
      <section className="card flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl text-glow-800">Treatments</h2>
          <p className="text-xs text-glow-600">Log appointments and follow personalized aftercare.</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing({ ...blank })}>
          <Plus size={16} /> Log
        </button>
      </section>

      {activeAftercare.length > 0 && (
        <section className="card border-glow-300 bg-glow-50/80">
          <div className="flex items-center gap-2 text-glow-800 font-display text-lg mb-2">
            <CalendarClock size={18} /> Active aftercare
          </div>
          <div className="space-y-3">
            {activeAftercare.map((t) => {
              const plan = AFTERCARE[t.type];
              const elapsed = daysBetween(t.date, todayISO());
              const remaining = Math.max(0, plan.durationDays - elapsed);
              return (
                <div key={t.id} className="rounded-xl bg-white/80 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-medium text-glow-900">
                      {t.customName || TREATMENT_TYPES.find((x) => x.id === t.type)?.label}
                    </div>
                    <div className="text-[11px] text-glow-600">
                      {remaining === 0 ? 'last day' : `day ${elapsed + 1} of ${plan.durationDays + 1} · ${remaining}d left`}
                    </div>
                  </div>
                  <p className="text-xs text-glow-700 mt-0.5">{plan.summary}</p>
                  <AftercareList plan={plan} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(treatments?.length ?? 0) === 0 ? (
        <section className="card text-sm text-glow-600/80">
          No treatments logged yet.
        </section>
      ) : (
        treatments!.map((t) => (
          <TreatmentCard
            key={t.id}
            treatment={t}
            onEdit={() => setEditing(t)}
            onDelete={() => db.treatments.delete(t.id!)}
          />
        ))
      )}

      {editing && (
        <TreatmentEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (next) => {
            const cleaned: Treatment = {
              ...next,
              customName: next.customName?.trim() || undefined,
              provider: next.provider?.trim() || undefined,
              notes: next.notes?.trim() || undefined,
            };
            if (cleaned.id) await db.treatments.put(cleaned);
            else await db.treatments.add(cleaned);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function TreatmentCard({
  treatment,
  onEdit,
  onDelete,
}: {
  treatment: Treatment;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const plan = AFTERCARE[treatment.type];
  const [open, setOpen] = useState(false);
  return (
    <section className="card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="font-display text-lg text-glow-900">
              {treatment.customName || TREATMENT_TYPES.find((x) => x.id === treatment.type)?.label}
            </h3>
            <span className="chip">{relDays(treatment.date)}</span>
          </div>
          <p className="text-[11px] text-glow-500 mt-0.5">
            {fmtDate(treatment.date)}{treatment.provider ? ` · ${treatment.provider}` : ''}
          </p>
        </div>
        <div className="flex gap-1">
          <button className="btn-ghost p-2" onClick={onEdit} aria-label="Edit">
            <Pencil size={14} />
          </button>
          <button className="btn-ghost p-2 text-red-600" onClick={onDelete} aria-label="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {treatment.notes && (
        <p className="mt-2 text-xs text-glow-700 italic">{treatment.notes}</p>
      )}

      <button
        type="button"
        className="mt-3 text-xs font-semibold text-glow-700 underline"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Hide aftercare' : 'Show aftercare instructions'}
      </button>
      {open && (
        <div className="mt-2 rounded-xl bg-glow-50 p-3 text-xs text-glow-800">
          <p className="font-medium mb-2">{plan.summary}</p>
          <AftercareList plan={plan} />
        </div>
      )}
    </section>
  );
}

function AftercareList({ plan }: { plan: typeof AFTERCARE[TreatmentType] }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3 mt-2">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mb-1">Do</div>
        <ul className="space-y-1 text-xs text-glow-800 list-disc pl-4">
          {plan.do.map((d, i) => <li key={i}>{d}</li>)}
        </ul>
      </div>
      {plan.avoid.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-red-700 mb-1">Avoid</div>
          <ul className="space-y-1 text-xs text-glow-800 list-disc pl-4">
            {plan.avoid.map((a, i) => <li key={i}>{a}</li>)}
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
  const update = <K extends keyof Treatment>(key: K, value: Treatment[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const plan = AFTERCARE[draft.type];

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
                <option key={t.id} value={t.id}>{t.label}</option>
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
          <div className="grid grid-cols-2 gap-3">
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

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-primary" onClick={() => onSave(draft)}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
