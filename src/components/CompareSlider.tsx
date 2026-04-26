import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Minus, Plus, RotateCcw } from 'lucide-react';

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

const IDENTITY: ImageTransform = { zoom: 1, panX: 0, panY: 0 };

export const DEFAULT_COMPARE_STATE: CompareSliderState = {
  pos: 50,
  before: { ...IDENTITY },
  after: { ...IDENTITY },
  active: 'after',
};

const ZMIN = 1;
const ZMAX = 3;

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
  const [internal, setInternal] = useState<CompareSliderState>(DEFAULT_COMPARE_STATE);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<
    | { mode: 'pan'; startX: number; startY: number; panX: number; panY: number; side: 'before' | 'after' }
    | { mode: 'slide'; startX: number; startPos: number }
    | null
  >(null);
  const pinchRef = useRef<{ d0: number; zoom: number; side: 'before' | 'after' } | null>(null);

  const s = state ?? internal;
  const updateState = (next: CompareSliderState) => {
    if (onStateChange) onStateChange(next);
    else setInternal(next);
  };
  const updateActive = (patch: Partial<ImageTransform>) => {
    const t = { ...s[s.active], ...patch };
    updateState({ ...s, [s.active]: t });
  };
  const setPos = (pos: number) => updateState({ ...s, pos });
  const setActive = (active: 'before' | 'after') => updateState({ ...s, active });

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

  function clampPan(zoom: number, panX: number, panY: number) {
    const el = containerRef.current;
    if (!el) return { panX, panY };
    const w = el.clientWidth;
    const h = el.clientHeight;
    const maxX = ((zoom - 1) * w) / 2;
    const maxY = ((zoom - 1) * h) / 2;
    return {
      panX: Math.max(-maxX, Math.min(maxX, panX)),
      panY: Math.max(-maxY, Math.min(maxY, panY)),
    };
  }

  // Decide which side a pointer event targets, based on the slider position.
  function sideFromX(clientX: number): 'before' | 'after' {
    const el = containerRef.current;
    if (!el) return s.active;
    const rect = el.getBoundingClientRect();
    const xPct = ((clientX - rect.left) / rect.width) * 100;
    return xPct < s.pos ? 'before' : 'after';
  }

  function onPointerDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('button[data-role="ui"]')) return;
    const isHandle = !!target.closest('[data-role="slider-handle"]');
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    if (isHandle) {
      dragRef.current = { mode: 'slide', startX: e.clientX, startPos: s.pos };
      return;
    }

    const side = sideFromX(e.clientX);
    if (side !== s.active) setActive(side);
    if (s[side].zoom <= 1) return;
    dragRef.current = {
      mode: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      panX: s[side].panX,
      panY: s[side].panY,
      side,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === 'slide') {
      const el = containerRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const dx = e.clientX - d.startX;
      const next = Math.max(0, Math.min(100, d.startPos + (dx / w) * 100));
      setPos(next);
      return;
    }
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const t = s[d.side];
    const next = clampPan(t.zoom, d.panX + dx, d.panY + dy);
    updateState({ ...s, [d.side]: { ...t, ...next } });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const side = sideFromX(e.clientX);
    if (side !== s.active) setActive(side);
    const t = s[side];
    const next = Math.max(ZMIN, Math.min(ZMAX, t.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
    const clamped = clampPan(next, t.panX, t.panY);
    updateState({ ...s, [side]: { zoom: next, ...clamped } });
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const side = sideFromX(cx);
    if (side !== s.active) setActive(side);
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    pinchRef.current = { d0: Math.hypot(dx, dy), zoom: s[side].zoom, side };
  }
  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length !== 2 || !pinchRef.current) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const d = Math.hypot(dx, dy);
    const z = Math.max(ZMIN, Math.min(ZMAX, pinchRef.current.zoom * (d / pinchRef.current.d0)));
    const t = s[pinchRef.current.side];
    const clamped = clampPan(z, t.panX, t.panY);
    updateState({ ...s, [pinchRef.current.side]: { zoom: z, ...clamped } });
  }
  function onTouchEnd() {
    pinchRef.current = null;
  }

  function setActiveZoom(next: number) {
    const z = Math.max(ZMIN, Math.min(ZMAX, next));
    const t = s[s.active];
    const clamped = clampPan(z, t.panX, t.panY);
    updateActive({ zoom: z, ...clamped });
  }
  function resetActive() {
    updateActive({ ...IDENTITY });
  }

  const beforeStyle = transformStyle(s.before);
  const afterStyle = transformStyle(s.after);
  const activeT = s[s.active];

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
        {/* Before fills the whole canvas (left side); After is clipped to the
            right of the slider via clip-path, so the convention is consistent
            with most before/after sliders. */}
        <img
          src={before}
          alt="before"
          className="block w-full h-auto"
          draggable={false}
          style={beforeStyle}
        />
        <img
          src={after}
          alt="after"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{
            ...afterStyle,
            clipPath: `inset(0 0 0 ${s.pos}%)`,
            WebkitClipPath: `inset(0 0 0 ${s.pos}%)`,
          }}
          draggable={false}
        />
        <div
          className="absolute top-0 bottom-0 w-px bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.4)] pointer-events-none"
          style={{ left: `${s.pos}%` }}
        />
        {/* Draggable handle on the divider; pan still works on the rest of the image. */}
        <div
          data-role="slider-handle"
          role="slider"
          aria-label="Compare position"
          aria-valuenow={Math.round(s.pos)}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setPos(Math.max(0, s.pos - 2));
            if (e.key === 'ArrowRight') setPos(Math.min(100, s.pos + 2));
          }}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-10 w-10 rounded-full bg-white/95 shadow-lg flex items-center justify-center cursor-ew-resize border-2 border-glow-600 touch-none"
          style={{ left: `${s.pos}%` }}
        >
          <ArrowLeftRight size={16} className="text-glow-700 pointer-events-none" />
        </div>
        {beforeLabel && (
          <span
            className={`absolute top-2 left-2 chip pointer-events-none ${
              s.active === 'before' ? 'bg-glow-600 text-white' : 'bg-white/90 text-glow-800'
            }`}
          >
            {beforeLabel}
          </span>
        )}
        {afterLabel && (
          <span
            className={`absolute top-2 right-2 chip pointer-events-none ${
              s.active === 'after' ? 'bg-glow-600 text-white' : 'bg-white/90 text-glow-800'
            }`}
          >
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
        <>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-glow-600">Adjust</span>
            <div className="inline-flex rounded-full border border-glow-200 overflow-hidden">
              {(['before', 'after'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => setActive(side)}
                  className={`px-3 py-1 text-xs font-medium transition ${
                    s.active === side
                      ? 'bg-glow-600 text-white'
                      : 'bg-white text-glow-700 hover:bg-glow-50'
                  }`}
                >
                  {side === 'before' ? 'Before' : 'After'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 ml-auto text-xs text-glow-700">
              <button
                type="button"
                className="btn-ghost p-1.5"
                onClick={() => setActiveZoom(activeT.zoom - 0.25)}
                disabled={activeT.zoom <= ZMIN}
                aria-label="Zoom out"
              >
                <Minus size={14} />
              </button>
              <span className="tabular-nums w-12 text-center">{activeT.zoom.toFixed(2)}×</span>
              <button
                type="button"
                className="btn-ghost p-1.5"
                onClick={() => setActiveZoom(activeT.zoom + 0.25)}
                disabled={activeT.zoom >= ZMAX}
                aria-label="Zoom in"
              >
                <Plus size={14} />
              </button>
              <button
                type="button"
                className="btn-ghost p-1.5"
                onClick={resetActive}
                disabled={
                  activeT.zoom === 1 && activeT.panX === 0 && activeT.panY === 0
                }
                aria-label="Reset this side"
                title="Reset this side"
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </div>
          <p className="text-[11px] text-glow-500">
            Pan/zoom only affects the side selected above. Drag to pan, pinch or
            ⌘/Ctrl + scroll to zoom. Tapping a side selects it automatically.
          </p>
        </>
      )}
    </div>
  );
}

function transformStyle(t: ImageTransform): React.CSSProperties {
  return {
    transform: `translate(${t.panX}px, ${t.panY}px) scale(${t.zoom})`,
    transformOrigin: 'center center',
  };
}
