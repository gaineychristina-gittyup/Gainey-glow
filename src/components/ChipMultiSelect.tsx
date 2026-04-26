interface Option<T extends string> {
  id: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T[];
  onChange: (next: T[]) => void;
  className?: string;
}

export default function ChipMultiSelect<T extends string>({
  options,
  value,
  onChange,
  className,
}: Props<T>) {
  const toggle = (id: T) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };
  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ''}`}>
      {options.map((o) => {
        const active = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => toggle(o.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              active
                ? 'bg-glow-600 text-white border-glow-600'
                : 'bg-white/70 text-glow-700 border-glow-200 hover:bg-glow-50'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
