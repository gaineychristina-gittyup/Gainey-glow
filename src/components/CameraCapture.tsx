// Full-screen in-app camera with a rule-of-thirds grid and zone-specific
// framing guides. Lets the user line up the same shot every day.

import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCcw, X } from 'lucide-react';
import { ZONES, type Zone } from '../db/schema';

interface Props {
  zone: Zone;
  onZoneChange: (z: Zone) => void;
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}

export default function CameraCapture({ zone, onZoneChange, onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

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
          {ZONES.find((z) => z.id === zone)?.label}
        </div>
        <button
          onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
          aria-label="Switch camera"
          className="p-2 rounded-full hover:bg-white/10"
        >
          <RefreshCcw size={18} />
        </button>
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
      <div className="bg-black flex items-center justify-center py-5">
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

function ZoneGuide({ zone }: { zone: Zone }) {
  const stroke = 'rgba(236, 72, 153, 0.85)';
  const strokeWidth = 0.6;

  switch (zone) {
    case 'full':
      // Large oval covering the whole face + nose vertical + eye horizontal
      return (
        <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="2 1.5">
          <ellipse cx="50" cy="68" rx="30" ry="42" />
          {/* Vertical nose line — face should be split symmetrically by it */}
          <line x1="50" y1="26" x2="50" y2="110" strokeDasharray="1.5 1" />
          {/* Horizontal eye line — eyes sit on this line */}
          <line x1="22" y1="58" x2="78" y2="58" strokeDasharray="1.5 1" />
          <text x="50" y="22" textAnchor="middle" fill="white" fillOpacity="0.9" fontSize="3">
            eye line
          </text>
          <text x="50" y="138" textAnchor="middle" fill="white" fillOpacity="0.85" fontSize="3">
            Line up nose with the vertical line · eyes on the horizontal
          </text>
        </g>
      );
    case 'leftCheek':
      // Oval shifted right (face turned to show left side)
      return (
        <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="2 1.5">
          <ellipse cx="62" cy="68" rx="26" ry="38" />
          <line x1="22" y1="58" x2="84" y2="58" strokeDasharray="1.5 1" />
          <text x="50" y="138" textAnchor="middle" fill="white" fillOpacity="0.85" fontSize="3">
            Turn head ¾ to the right · eyes on the line
          </text>
        </g>
      );
    case 'rightCheek':
      return (
        <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="2 1.5">
          <ellipse cx="38" cy="68" rx="26" ry="38" />
          <line x1="16" y1="58" x2="78" y2="58" strokeDasharray="1.5 1" />
          <text x="50" y="138" textAnchor="middle" fill="white" fillOpacity="0.85" fontSize="3">
            Turn head ¾ to the left · eyes on the line
          </text>
        </g>
      );
    case 'forehead':
      return (
        <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="2 1.5">
          <rect x="25" y="38" width="50" height="22" rx="3" />
          <text x="50" y="135" textAnchor="middle" fill="white" fillOpacity="0.85" fontSize="3">
            Frame just the forehead
          </text>
        </g>
      );
    case 'chin':
      return (
        <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="2 1.5">
          <rect x="32" y="86" width="36" height="20" rx="3" />
          <text x="50" y="135" textAnchor="middle" fill="white" fillOpacity="0.85" fontSize="3">
            Frame jawline + chin
          </text>
        </g>
      );
    case 'nose':
      return (
        <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="2 1.5">
          <rect x="40" y="58" width="20" height="30" rx="3" />
          <text x="50" y="135" textAnchor="middle" fill="white" fillOpacity="0.85" fontSize="3">
            Center the nose / T-zone
          </text>
        </g>
      );
  }
}
