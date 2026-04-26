import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, Eye, EyeOff, X } from 'lucide-react';
import {
  getGeminiKey,
  getGeminiModel,
  setGeminiKey,
  setGeminiModel,
} from '../lib/settings';

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState(getGeminiKey());
  const [model, setModel] = useState(getGeminiModel());
  const [show, setShow] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const firstRender = useRef(true);

  // Auto-save with a tiny debounce so each keystroke isn't a write.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      setGeminiKey(key.trim());
      setGeminiModel(model.trim() || 'gemini-2.5-flash');
      setSavedAt(Date.now());
    }, 350);
    return () => clearTimeout(t);
  }, [key, model]);

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-3">
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg text-glow-800">Settings</h3>
          <button className="btn-ghost p-2" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <section className="space-y-2">
          <h4 className="font-display text-base text-glow-800">Gemini product scanner</h4>
          <p className="text-xs text-glow-600">
            Add your own Google Gemini API key to scan product photos and auto-fill name,
            brand, ingredients and concerns. Photos are sent to Google only when you tap
            <span className="font-semibold"> Scan</span>. The key is stored on this device
            (localStorage) — it persists across visits and never goes to a server we run.
          </p>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-glow-700 underline inline-flex items-center gap-1"
          >
            Get a free Gemini API key <ExternalLink size={12} />
          </a>

          <div>
            <div className="flex items-center justify-between">
              <label className="label mb-0">API key</label>
              {key.trim() ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                  <Check size={12} /> Saved on this device
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex gap-2">
              <input
                className="input flex-1 font-mono"
                type={show ? 'text' : 'password'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="AI..."
                autoComplete="off"
                spellCheck={false}
              />
              <button
                className="btn-ghost p-2"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? 'Hide' : 'Show'}
                type="button"
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {key.trim() && (
              <button
                type="button"
                className="mt-2 text-[11px] text-red-600 hover:underline"
                onClick={() => setKey('')}
              >
                Clear API key
              </button>
            )}
          </div>

          <div>
            <label className="label">Model</label>
            <input
              className="input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gemini-2.5-flash"
            />
            <p className="text-[11px] text-glow-500 mt-1">
              Default: <code>gemini-2.5-flash</code>. Use <code>gemini-2.5-pro</code> for slower
              but more accurate results.
            </p>
          </div>

          <div className="flex justify-between items-center pt-2">
            <span className="text-[11px] text-glow-500 min-h-[1em]">
              {savedAt > 0 && Date.now() - savedAt < 2000 ? 'Saved ✓' : ''}
            </span>
            <button className="btn-primary" onClick={onClose}>Done</button>
          </div>
        </section>
      </div>
    </div>
  );
}
