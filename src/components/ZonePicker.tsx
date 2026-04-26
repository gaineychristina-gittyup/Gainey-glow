import { ZONES, type Zone } from '../db/schema';

interface Props {
  value: Zone;
  onChange: (z: Zone) => void;
  className?: string;
}

export default function ZonePicker({ value, onChange, className }: Props) {
  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ''}`}>
      {ZONES.map((z) => (
        <button
          key={z.id}
          type="button"
          onClick={() => onChange(z.id)}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            value === z.id
              ? 'bg-glow-600 text-white border-glow-600 shadow-sm'
              : 'bg-white/70 text-glow-700 border-glow-200 hover:bg-glow-50'
          }`}
        >
          {z.label}
        </button>
      ))}
    </div>
  );
}
