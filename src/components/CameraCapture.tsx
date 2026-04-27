// Full-screen in-app camera optimized for close-up skin shots. Shows a small
// centered framing target ("fill this with skin") and a digital zoom slider so
// users can crop tight even when the front camera has a wide field of view.

import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Eye, EyeOff, Grid3x3, RefreshCcw, X, ZoomIn } from 'lucide-react';
import { db, ZONES, type Zone } from '../db/schema';

interface Props {
  zone: Zone;
  onZoneChange: (z: Zone) => void;
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}

const ZMIN = 1;
const ZMAX = 4;

export default function CameraCapture({ zone, onZoneChange, onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [ghost, setGhost] = useState(true);
  const [ghostOpacity, setGhostOpacity] = useState(0.4);
  const [ghostUrl, setGhostUrl] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [zoom, setZoom] = useState(1);

  // Most recent photo for the selected zone, used as a "ghost" overlay so
  // the user can frame the shot the same way every day.
  const reference = useLiveQuery(async () => {
    const all = await db.photos.where('zone').equals(zone).toArray();
    if (all.length === 0) return undefined;
    return all.reduce((a, b) => (a.takenAt > b.takenAt ? a : b));
  }, [zone]);

  useEffect(() => {
    if (!reference) {
      setGhostUrl(null);
      return;
    }
    const url = URL.createObjectURL(reference.blob);
    setGhostUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [reference]);

  useEffect(() => {
    let mounted = true;
    let stream: MediaStream | null = null;
    setError(null);
    setReady(false);
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 1440 },
            height: { ideal: 1440 },
          },
          audio: false,
        });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setReady(true);
        }
      } catch {
        setError("Couldn't access the camera. Allow camera permission and try again.");
      }
    })();
    return () => {
      mounted = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  // Reset zoom when switching cameras — different lenses, different baseline FOV.
  useEffect(() => {
    setZoom(1);
  }, [facing]);

  function snap() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    // Output a square crop centered on what the user sees, then apply digital
    // zoom by cropping a smaller centered region of the source frame.
    const side = Math.min(video.videoWidth, video.videoHeight);
    const sx0 = (video.videoWidth - side) / 2;
    const sy0 = (video.videoHeight - side) / 2;
    const z = Math.max(ZMIN, Math.min(ZMAX, zoom));
    const sw = side / z;
    const sh = side / z;
    const sx = sx0 + (side - sw) / 2;
    const sy = sy0 + (side - sh) / 2;
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(blob);
      },
      'image/jpeg',
      0.92,
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/60 text-white">
        <button
          onClick={onClose}
          aria-label="Close camera"
          className="p-2 rounded-full hover:bg-white/10"
        >
          <X size={20} />
        </button>
        <div className="text-xs uppercase tracking-wide opacity-80">
          {ZONES.find((z) => z.id === zone)?.label} · close-up
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowGrid((g) => !g)}
            aria-label={showGrid ? 'Hide rule-of-thirds grid' : 'Show rule-of-thirds grid'}
            title="Toggle rule-of-thirds grid"
            className={`p-2 rounded-full hover:bg-white/10 ${showGrid ? 'text-white' : 'text-white/40'}`}
          >
            <Grid3x3 size={18} />
          </button>
          {ghostUrl && (
            <button
              onClick={() => setGhost((g) => !g)}
              aria-label={ghost ? 'Hide previous photo overlay' : 'Show previous photo overlay'}
              title="Toggle previous-photo overlay"
              className="p-2 rounded-full hover:bg-white/10"
            >
              {ghost ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          )}
          <button
            onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
            aria-label="Switch camera"
            className="p-2 rounded-full hover:bg-white/10"
          >
            <RefreshCcw size={18} />
          </button>
        </div>
      </div>

      {/* Viewfinder. We wrap the video in a square area so what the user sees
          matches what gets captured (square crop, digital zoom applied via
          CSS scale on the live preview and via canvas crop on snap). */}
      <div className="relative flex-1 overflow-hidden flex items-center justify-center">
        <div className="relative aspect-square w-full max-h-full max-w-full overflow-hidden bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            style={{ transform: `${facing === 'user' ? 'scaleX(-1) ' : ''}scale(${zoom})` }}
            className="absolute inset-0 w-full h-full object-cover origin-center transition-transform"
          />

          {/* Ghost overlay: previous photo for this zone, semi-transparent */}
          {ghostUrl && ghost && (
            <img
              src={ghostUrl}
              alt=""
              aria-hidden
              style={{
                opacity: ghostOpacity,
                transform: `${facing === 'user' ? 'scaleX(-1) ' : ''}scale(${zoom})`,
              }}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none mix-blend-screen origin-center transition-transform"
            />
          )}

          {!ready && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm">
              Starting camera…
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/90 text-sm gap-2 p-4 text-center">
              <Camera size={28} className="opacity-60" />
              {error}
            </div>
          )}

          {/* Optional rule-of-thirds + close-up framing guide */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="xMidYMid slice"
          >
            {showGrid && (
              <g stroke="white" strokeOpacity="0.3" strokeWidth="0.2" fill="none">
                <line x1="33.33" y1="0" x2="33.33" y2="100" />
                <line x1="66.66" y1="0" x2="66.66" y2="100" />
                <line x1="0" y1="33.33" x2="100" y2="33.33" />
                <line x1="0" y1="66.66" x2="100" y2="66.66" />
              </g>
            )}

            <CloseUpGuide zone={zone} />
          </svg>
        </div>
      </div>

      {/* Zone picker */}
      <div className="bg-black/60 px-3 pt-2 pb-1 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {ZONES.map((z) => (
            <button
              key={z.id}
              onClick={() => onZoneChange(z.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                zone === z.id
                  ? 'bg-white text-glow-800'
                  : 'bg-white/15 text-white/90 hover:bg-white/25'
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      {/* Controls + capture */}
      <div className="bg-black flex flex-col items-center justify-center py-3 gap-3">
        <div className="flex items-center gap-2 text-white/80 text-[11px] w-full max-w-xs px-4">
          <ZoomIn size={14} className="shrink-0" aria-hidden />
          <input
            type="range"
            min={ZMIN * 100}
            max={ZMAX * 100}
            step={5}
            value={Math.round(zoom * 100)}
            onChange={(e) => setZoom(Number(e.target.value) / 100)}
            className="flex-1 accent-pink-400"
            aria-label="Zoom"
          />
          <span className="shrink-0 tabular-nums w-10 text-right">{zoom.toFixed(1)}×</span>
        </div>

        {ghostUrl && ghost && (
          <div className="flex items-center gap-2 text-white/80 text-[11px] w-full max-w-xs px-4">
            <span className="shrink-0">Ghost</span>
            <input
              type="range"
              min={10}
              max={75}
              value={Math.round(ghostOpacity * 100)}
              onChange={(e) => setGhostOpacity(Number(e.target.value) / 100)}
              className="flex-1 accent-pink-400"
              aria-label="Ghost overlay opacity"
            />
            <span className="shrink-0 tabular-nums w-8 text-right">
              {Math.round(ghostOpacity * 100)}%
            </span>
          </div>
        )}
        <button
          onClick={snap}
          aria-label="Capture"
          disabled={!ready || !!error}
          className="h-16 w-16 rounded-full bg-white border-4 border-white/40 active:scale-95 transition disabled:opacity-40"
        />
      </div>
    </div>
  );
}

function CloseUpGuide({ zone }: { zone: Zone }) {
  // Solid white lines with a faint dark drop-shadow so the overlay reads
  // cleanly on any skin tone or background.
  const C = 'rgba(255,255,255,0.95)';
  const SW = 0.4;
  const SHADOW = 'drop-shadow(0 0 1px rgba(0,0,0,0.7))';

  // Centered close-up target — small enough that filling it forces the user
  // to get the camera close to their skin. The shape varies by zone as a
  // gentle hint about what to fill it with, but they're all small and central.
  const target = (() => {
    switch (zone) {
      case 'full':
        return <ellipse cx="50" cy="50" rx="22" ry="28" />;
      case 'leftCheek':
      case 'rightCheek':
        return <ellipse cx="50" cy="50" rx="24" ry="22" />;
      case 'forehead':
        return <rect x="26" y="34" width="48" height="20" rx="3" />;
      case 'chin':
        return <rect x="26" y="46" width="48" height="20" rx="3" />;
      case 'nose':
        return <rect x="38" y="28" width="24" height="44" rx="3" />;
    }
  })();

  const hint = (() => {
    switch (zone) {
      case 'full':
        return 'Fill the oval with the area you want to track';
      case 'leftCheek':
        return 'Fill the oval with your left cheek skin';
      case 'rightCheek':
        return 'Fill the oval with your right cheek skin';
      case 'forehead':
        return 'Fill the box with your forehead skin';
      case 'chin':
        return 'Fill the box with your chin / jawline skin';
      case 'nose':
        return 'Fill the box with your nose / T-zone skin';
    }
  })();

  return (
    <g style={{ filter: SHADOW }}>
      {/* Dim everything outside the target so the close-up area reads as the
          subject. Uses an SVG mask so the overlay only darkens the surround. */}
      <defs>
        <mask id="closeup-mask">
          <rect x="0" y="0" width="100" height="100" fill="white" />
          <g fill="black">{target}</g>
        </mask>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="rgba(0,0,0,0.35)" mask="url(#closeup-mask)" />

      {/* Target outline */}
      <g fill="none" stroke={C} strokeWidth={SW} strokeDasharray="2 1.5">
        {target}
      </g>

      {/* Crosshair so users can tell their subject is centered */}
      <g stroke={C} strokeWidth={SW} strokeOpacity="0.7">
        <line x1="48" y1="50" x2="52" y2="50" />
        <line x1="50" y1="48" x2="50" y2="52" />
      </g>

      <text
        x="50"
        y="92"
        textAnchor="middle"
        fill="white"
        fontSize="3.4"
        fontWeight="600"
      >
        {hint}
      </text>
      <text
        x="50"
        y="97"
        textAnchor="middle"
        fill="white"
        fillOpacity="0.75"
        fontSize="2.6"
        fontWeight="500"
      >
        Get 4–6 in / 10–15 cm away · zoom in if needed
      </text>
    </g>
  );
}
