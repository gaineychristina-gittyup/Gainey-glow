import { useEffect, useState } from 'react';

interface Props {
  beforeBlob: Blob;
  afterBlob: Blob;
  beforeLabel?: string;
  afterLabel?: string;
}

export default function CompareSlider({ beforeBlob, afterBlob, beforeLabel, afterLabel }: Props) {
  const [before, setBefore] = useState<string>();
  const [after, setAfter] = useState<string>();
  const [pos, setPos] = useState(50);

  useEffect(() => {
    const a = URL.createObjectURL(beforeBlob);
    const b = URL.createObjectURL(afterBlob);
    setBefore(a);
    setAfter(b);
    return () => {
      URL.revokeObjectURL(a);
      URL.revokeObjectURL(b);
    };
  }, [beforeBlob, afterBlob]);

  if (!before || !after) return null;

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-black select-none">
      <img src={before} alt="before" className="block w-full h-auto" draggable={false} />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${pos}%` }}
      >
        <img
          src={after}
          alt="after"
          className="block h-full w-auto max-w-none object-cover"
          style={{ width: `${10000 / pos}%` }}
          draggable={false}
        />
      </div>
      <div
        className="absolute top-0 bottom-0 w-px bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.4)] pointer-events-none"
        style={{ left: `${pos}%` }}
      />
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        className="slider-handle absolute inset-0 w-full h-full cursor-ew-resize"
        aria-label="Compare slider"
      />
      {beforeLabel && (
        <span className="absolute top-2 left-2 chip bg-white/90 text-glow-800">
          {beforeLabel}
        </span>
      )}
      {afterLabel && (
        <span className="absolute top-2 right-2 chip bg-white/90 text-glow-800">
          {afterLabel}
        </span>
      )}
    </div>
  );
}
