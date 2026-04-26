// Side-by-side comparison view. (The interactive slider with per-image
// pan/zoom is parked for now — it lives in git history if we revive it.)
// The CompareSliderState type is kept so saved Comparison records stay
// type-compatible.

import { useEffect, useState } from 'react';

export interface ImageTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export interface CompareSliderState {
  pos: number;
  before: ImageTransform;
  after: ImageTransform;
  active: 'before' | 'after';
}

const IDENTITY: ImageTransform = { zoom: 1, panX: 0, panY: 0 };

export const DEFAULT_COMPARE_STATE: CompareSliderState = {
  pos: 50,
  before: { ...IDENTITY },
  after: { ...IDENTITY },
  active: 'after',
};

interface Props {
  beforeBlob: Blob;
  afterBlob: Blob;
  beforeLabel?: string;
  afterLabel?: string;
  caption?: string;
}

export default function CompareSlider({
  beforeBlob,
  afterBlob,
  beforeLabel,
  afterLabel,
  caption,
}: Props) {
  const [before, setBefore] = useState<string>();
  const [after, setAfter] = useState<string>();

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
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1 rounded-2xl overflow-hidden bg-black">
        <div className="relative bg-black">
          <img
            src={before}
            alt="before"
            className="block w-full h-full object-cover"
            draggable={false}
          />
          {beforeLabel && (
            <span className="absolute top-2 left-2 chip bg-white/90 text-glow-800 text-[10px] pointer-events-none max-w-[calc(100%-1rem)] truncate">
              {beforeLabel}
            </span>
          )}
        </div>
        <div className="relative bg-black">
          <img
            src={after}
            alt="after"
            className="block w-full h-full object-cover"
            draggable={false}
          />
          {afterLabel && (
            <span className="absolute top-2 right-2 chip bg-white/90 text-glow-800 text-[10px] pointer-events-none max-w-[calc(100%-1rem)] truncate">
              {afterLabel}
            </span>
          )}
        </div>
      </div>
      {caption && (
        <div className="rounded-xl bg-glow-50 px-3 py-2 text-sm text-glow-900 text-center">
          {caption}
        </div>
      )}
    </div>
  );
}
