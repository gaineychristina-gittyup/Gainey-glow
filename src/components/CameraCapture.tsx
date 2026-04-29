// Full-screen in-app camera with a rule-of-thirds grid and zone-specific
// framing guides. Lets the user line up the same shot every day. Stays open
// across multiple captures so the user can shoot several zones in one
// session — the parent flushes the saved photos when the camera is closed.

import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Check, Eye, EyeOff, Loader2, RefreshCcw, X } from 'lucide-react';
import { db, ZONES, type Zone } from '../db/schema';

interface Props {
  zone: Zone;
  onZoneChange: (z: Zone) => void;
  onCapture: (blob: Blob) => void;
  onClose: () => void;
  // True while the parent is persisting the most recent capture. Drives the
  // shutter disabled state and the "Saved ✓" toast on the trailing edge.
  saving?: boolean;
  // Number of photos already saved in this camera session (resets when the
  // camera is closed). Surfaced in the top bar so the user has feedback that
  // each shot landed.
  sessionCount?: number;
}

export default function CameraCapture({
  zone,
  onZoneChange,
  onCapture,
  onClose,
  saving = false,
  sessionCount = 0,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [ghost, setGhost] = useState(true);
  const [ghostOpacity, setGhostOpacity] = useState(0.4);
  const [ghostUrl, setGhostUrl] = useState<string | null>(null);
  // Brief white flash when the shutter fires.
  const [flash, setFlash] = useState(false);
  // "Saved ✓" toast shown when the parent's saving prop transitions
  // true → false (i.e. the most recent capture finished persisting).
  const [savedToast, setSavedToast] = useState(false);
  const prevSaving = useRef(false);
  useEffect(() => {
    if (prevSaving.current && !saving) {
      setSavedToast(true);
      const t = window.setTimeout(() => setSavedToast(false), 1200);
      return () => window.clearTimeout(t);
    }
    prevSaving.current = saving;
  }, [saving]);

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
            width: { ideal: 1080 },
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

  function snap() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 220);
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
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-xs uppercase tracking-wide opacity-80 truncate">
            {ZONES.find((z) => z.id === zone)?.label}
          </div>
          {sessionCount > 0 && (
            <span
              className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-500/90 text-white text-[10px] font-semibold px-2 py-0.5"
              aria-label={`${sessionCount} photo${sessionCount === 1 ? '' : 's'} saved this session`}
            >
              <Check size={10} /> {sessionCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
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

      {/* Viewfinder */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover ${
            facing === 'user' ? 'scale-x-[-1]' : ''
          }`}
        />

        {/* Ghost overlay: previous photo for this zone, semi-transparent */}
        {ghostUrl && ghost && (
          <img
            src={ghostUrl}
            alt=""
            aria-hidden
            className={`absolute inset-0 w-full h-full object-cover pointer-events-none mix-blend-screen ${
              facing === 'user' ? 'scale-x-[-1]' : ''
            }`}
            style={{ opacity: ghostOpacity }}
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

        {/* Rule of thirds + zone guide */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 150"
          preserveAspectRatio="xMidYMid slice"
        >
          {/* Thirds */}
          <g stroke="white" strokeOpacity="0.35" strokeWidth="0.2" fill="none">
            <line x1="33.33" y1="0" x2="33.33" y2="150" />
            <line x1="66.66" y1="0" x2="66.66" y2="150" />
            <line x1="0" y1="50" x2="100" y2="50" />
            <line x1="0" y1="100" x2="100" y2="100" />
          </g>

          {/* Zone-specific guide */}
          <ZoneGuide zone={zone} />
        </svg>

        {/* Shutter flash */}
        <div
          className="absolute inset-0 bg-white pointer-events-none transition-opacity"
          style={{ opacity: flash ? 0.55 : 0, transitionDuration: flash ? '60ms' : '220ms' }}
          aria-hidden
        />

        {/* Saved toast (after parent finishes persisting) */}
        {savedToast && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/95 text-white px-3 py-1 text-xs font-semibold shadow-lg pointer-events-none">
            <Check size={12} /> Saved
          </div>
        )}
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

      {/* Capture */}
      <div className="bg-black flex flex-col items-center justify-center py-4 gap-3">
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
          disabled={!ready || !!error || saving}
          className="relative h-16 w-16 rounded-full bg-white border-4 border-white/40 active:scale-95 transition disabled:opacity-40 flex items-center justify-center"
        >
          {saving && <Loader2 size={22} className="text-glow-700 animate-spin" />}
        </button>
        <p className="text-[11px] text-white/60 -mt-1">
          {saving
            ? 'Saving last shot…'
            : sessionCount > 0
              ? 'Switch zones and snap again, or close when done.'
              : 'Camera stays open — keep snapping different zones.'}
        </p>
      </div>
    </div>
  );
}

function ZoneGuide({ zone }: { zone: Zone }) {
  // One color for the whole overlay so it reads cleanly against any
  // skin tone / background. Solid white with a faint dark drop-shadow.
  const C = 'rgba(255,255,255,0.95)';
  const SW = 0.5;
  const TEXT_FILL = 'white';
  const SHADOW = 'drop-shadow(0 0 1px rgba(0,0,0,0.7))';

  // Tiny labeled landmark marker.
  const Marker = ({ cx, cy, label, dx = 0, dy = -2 }: { cx: number; cy: number; label: string; dx?: number; dy?: number }) => (
    <g>
      <circle cx={cx} cy={cy} r="1.6" fill={C} />
      <circle cx={cx} cy={cy} r="3" fill="none" stroke={C} strokeWidth={SW} />
      <text
        x={cx + dx}
        y={cy + dy}
        textAnchor="middle"
        fill={TEXT_FILL}
        fontSize="3.2"
        fontWeight="600"
        style={{ filter: SHADOW }}
      >
        {label}
      </text>
    </g>
  );

  const Caption = ({ children, y = 142 }: { children: string; y?: number }) => (
    <text
      x="50"
      y={y}
      textAnchor="middle"
      fill={TEXT_FILL}
      fontSize="3.6"
      fontWeight="600"
      style={{ filter: SHADOW }}
    >
      {children}
    </text>
  );

  switch (zone) {
    case 'full':
      // Big oval — basically as much of the screen as we can without going
      // off the edges. Eye line at upper third, nose line splits centrally,
      // chin marker at the bottom of the oval.
      return (
        <g fill="none" stroke={C} strokeWidth={SW} strokeDasharray="2 1.5" style={{ filter: SHADOW }}>
          <ellipse cx="50" cy="72" rx="46" ry="62" />
          <line x1="50" y1="14" x2="50" y2="130" strokeDasharray="1.5 1" />
          <line x1="6" y1="60" x2="94" y2="60" strokeDasharray="1.5 1" />
          <Marker cx={26} cy={60} label="eye" dy={-4.5} />
          <Marker cx={74} cy={60} label="eye" dy={-4.5} />
          <Marker cx={50} cy={84} label="nose" dy={-4.5} />
          <Marker cx={50} cy={130} label="chin" dy={-4.5} />
          <Caption>Fit your whole face in the oval</Caption>
        </g>
      );

    case 'leftCheek':
      // User turns head ¾ to the right (mirrored selfie shows left side).
      // Ear sits on the LEFT edge, nose on the right, chin at the bottom.
      return (
        <g fill="none" stroke={C} strokeWidth={SW} strokeDasharray="2 1.5" style={{ filter: SHADOW }}>
          <ellipse cx="55" cy="72" rx="42" ry="58" />
          <line x1="6" y1="60" x2="94" y2="60" strokeDasharray="1.5 1" />
          <Marker cx={18} cy={66} label="ear" dy={-4.5} />
          <Marker cx={78} cy={72} label="nose tip" dy={-4.5} />
          <Marker cx={62} cy={126} label="chin" dy={-4.5} />
          <Caption>Turn head ¾ to the right · ear on the left, nose on the right</Caption>
        </g>
      );

    case 'rightCheek':
      // Mirror of leftCheek.
      return (
        <g fill="none" stroke={C} strokeWidth={SW} strokeDasharray="2 1.5" style={{ filter: SHADOW }}>
          <ellipse cx="45" cy="72" rx="42" ry="58" />
          <line x1="6" y1="60" x2="94" y2="60" strokeDasharray="1.5 1" />
          <Marker cx={82} cy={66} label="ear" dy={-4.5} />
          <Marker cx={22} cy={72} label="nose tip" dy={-4.5} />
          <Marker cx={38} cy={126} label="chin" dy={-4.5} />
          <Caption>Turn head ¾ to the left · ear on the right, nose on the left</Caption>
        </g>
      );

    case 'forehead':
      return (
        <g fill="none" stroke={C} strokeWidth={SW} strokeDasharray="2 1.5" style={{ filter: SHADOW }}>
          <rect x="10" y="30" width="80" height="34" rx="4" />
          <Marker cx={50} cy={64} label="brow" dy={-4.5} />
          <Caption>Frame just the forehead</Caption>
        </g>
      );

    case 'chin':
      return (
        <g fill="none" stroke={C} strokeWidth={SW} strokeDasharray="2 1.5" style={{ filter: SHADOW }}>
          <rect x="14" y="80" width="72" height="36" rx="4" />
          <Marker cx={50} cy={80} label="lip line" dy={-4.5} />
          <Marker cx={50} cy={116} label="chin" dy={-4.5} />
          <Caption>Frame jawline and chin</Caption>
        </g>
      );

    case 'nose':
      return (
        <g fill="none" stroke={C} strokeWidth={SW} strokeDasharray="2 1.5" style={{ filter: SHADOW }}>
          <rect x="28" y="42" width="44" height="58" rx="4" />
          <line x1="50" y1="42" x2="50" y2="100" strokeDasharray="1.5 1" />
          <Marker cx={50} cy={50} label="bridge" dy={-4.5} />
          <Marker cx={50} cy={88} label="tip" dy={-4.5} />
          <Caption>Center the nose / T-zone</Caption>
        </g>
      );
  }
}
