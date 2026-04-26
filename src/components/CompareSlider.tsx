import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';

export interface CompareSliderState {
  pos: number;
  zoom: number;
  panX: number;
  panY: number;
}

interface Props {
  beforeBlob: Blob;
  afterBlob: Blob;
  beforeLabel?: string;
  afterLabel?: string;
  caption?: string;
  state?: CompareSliderState;
  onStateChange?: (s: CompareSliderState) => void;
  controls?: boolean;
}

const DEFAULT_STATE: CompareSliderState = { pos: 50, zoom: 1, panX: 0, panY: 0 };

export default function CompareSlider({
  beforeBlob,
  afterBlob,
  beforeLabel,
  afterLabel,
  caption,
  state,
  onStateChange,
  controls = true,
}: Props) {
  const [before, setBefore] = useState<string>();
  const [after, setAfter] = useState<string>();
  const [internal, setInternal] = useState<CompareSliderState>(DEFAULT_STATE);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const pinchRef = useRef<{ d0: number; zoom: number } | null>(null);

  const s = state ?? internal;
  const update = (patch: Partial<CompareSliderState>) => {
    const next = { ...s, ...patch };
    if (onStateChange) onStateChange(next);
    else setInternal(next);
  };

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

  const transform = `translate(${s.panX}px, ${s.panY}px) scale(${s.zoom})`;

  function clampPan(zoom: number, panX: number, panY: number) {
    const el = containerRef.current;
    if (!el) return { panX, panY };
    const w = el.clientWidth;
    const h = el.clientHeight;
    // Allow the image to pan up to (zoom-1)*size/2 in each direction.
    const maxX = ((zoom - 1) * w) / 2;
    const maxY = ((zoom - 1) * h) / 2;
    return {
      panX: Math.max(-maxX, Math.min(maxX, panX)),
      panY: Math.max(-maxY, Math.min(maxY, panY)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    // Avoid hijacking the slider input and the zoom buttons.
    const target = e.target as HTMLElement;
    if (target.closest('input[type="range"]') || target.closest('button')) return;
    if (s.zoom <= 1) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: s.panX, panY: s.panY };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const next = clampPan(s.zoom, dragRef.current.panX + dx, dragRef.current.panY + dy);
    update(next);
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return; // pinch-zoom on trackpad sends ctrl
    e.preventDefault();
    const next = Math.max(1, Math.min(3, s.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
    update({ zoom: next, ...clampPan(next, s.panX, s.panY) });
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 2) return;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    pinchRef.current = { d0: Math.hypot(dx, dy), zoom: s.zoom };
  }
  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length !== 2 || !pinchRef.current) return;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const d = Math.hypot(dx, dy);
    const zoom = Math.max(1, Math.min(3, pinchRef.current.zoom * (d / pinchRef.current.d0)));
    update({ zoom, ...clampPan(zoom, s.panX, s.panY) });
  }
  function onTouchEnd() {
    pinchRef.current = null;
  }

  function setZoom(next: number) {
    const z = Math.max(1, Math.min(3, next));
    update({ zoom: z, ...clampPan(z, s.panX, s.panY) });
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-2xl bg-black select-none touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <img
          src={before}
          alt="before"
          className="block w-full h-auto"
          draggable={false}
          style={{ transform, transformOrigin: 'center center' }}
        />
        <div
          className="absolute inset-0 overflow-hidden pointer-events-none"
          style={{ width: `${s.pos}%` }}
        >
          <img
            src={after}
            alt="after"
            className="block h-full w-auto max-w-none object-cover"
            style={{
              width: `${10000 / s.pos}%`,
              transform,
              transformOrigin: 'center center',
            }}
            draggable={false}
          />
        </div>
        <div
          className="absolute top-0 bottom-0 w-px bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.4)] pointer-events-none"
          style={{ left: `${s.pos}%` }}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={s.pos}
          onChange={(e) => update({ pos: Number(e.target.value) })}
          className="slider-handle absolute inset-0 w-full h-full cursor-ew-resize"
          aria-label="Compare slider"
        />
        {beforeLabel && (
          <span className="absolute top-2 left-2 chip bg-white/90 text-glow-800 pointer-events-none">
            {beforeLabel}
          </span>
        )}
        {afterLabel && (
          <span className="absolute top-2 right-2 chip bg-white/90 text-glow-800 pointer-events-none">
            {afterLabel}
          </span>
        )}
        {caption && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[90%] text-center pointer-events-none">
            <div
              className="inline-block px-3 py-1.5 rounded-xl bg-black/55 text-white text-sm font-medium leading-tight"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
            >
              {caption}
            </div>
          </div>
        )}
      </div>

      {controls && (
        <div className="flex items-center gap-2 text-xs text-glow-700">
          <button
            type="button"
            className="btn-ghost p-1.5"
            onClick={() => setZoom(s.zoom - 0.25)}
            disabled={s.zoom <= 1}
            aria-label="Zoom out"
          >
            <Minus size={14} />
          </button>
          <span className="tabular-nums w-12 text-center">{s.zoom.toFixed(2)}×</span>
          <button
            type="button"
            className="btn-ghost p-1.5"
            onClick={() => setZoom(s.zoom + 0.25)}
            aria-label="Zoom in"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            className="btn-ghost p-1.5 ml-auto"
            onClick={() => update({ ...DEFAULT_STATE, pos: s.pos })}
            disabled={s.zoom === 1 && s.panX === 0 && s.panY === 0}
            aria-label="Reset zoom and pan"
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      )}
      {controls && s.zoom > 1 && (
        <p className="text-[11px] text-glow-500">
          Drag to pan · pinch or ⌘/Ctrl + scroll to zoom.
        </p>
      )}
    </div>
  );
}
