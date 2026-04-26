import { useState } from 'react';
import { ExternalLink, Eye, EyeOff, X } from 'lucide-react';
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
  const [saved, setSaved] = useState(false);

  function save() {
    setGeminiKey(key.trim());
    setGeminiModel(model.trim() || 'gemini-2.5-flash');
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

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
            <span className="font-semibold"> Scan</span>. The key is stored locally on this
            device — never on a server we run.
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
            <label className="label">API key</label>
            <div className="flex gap-2">
              <input
                className="input flex-1 font-mono"
                type={show ? 'text' : 'password'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="AI..."
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

          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-ghost" onClick={onClose}>Close</button>
            <button className="btn-primary" onClick={save}>
              {saved ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
