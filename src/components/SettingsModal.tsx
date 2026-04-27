import { useEffect, useRef, useState } from 'react';
import { Check, Database, Download, ExternalLink, Eye, EyeOff, Lock, Upload, X } from 'lucide-react';
import {
  getGeminiKey,
  getGeminiModel,
  setGeminiKey,
  setGeminiModel,
} from '../lib/settings';
import { exportAll, importAll, suggestedFilename } from '../lib/backup';
import { getStorageInfo, requestPersistentStorage, type StorageInfo } from '../lib/storage';

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState(getGeminiKey());
  const [model, setModel] = useState(getGeminiModel());
  const [show, setShow] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const firstRender = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backupBusy, setBackupBusy] = useState<'idle' | 'export' | 'import'>('idle');
  const [backupMsg, setBackupMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [persistBusy, setPersistBusy] = useState(false);

  useEffect(() => {
    void getStorageInfo().then(setStorage);
  }, []);

  async function handleMakePersistent() {
    setPersistBusy(true);
    try {
      await requestPersistentStorage();
      setStorage(await getStorageInfo());
    } finally {
      setPersistBusy(false);
    }
  }

  async function handleExport() {
    setBackupBusy('export');
    setBackupMsg(null);
    try {
      const { blob, summary } = await exportAll();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = suggestedFilename();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const total = Object.values(summary.counts).reduce((s, n) => s + n, 0);
      setBackupMsg({
        kind: 'ok',
        text: `Saved ${total} rows (${formatBytes(summary.bytes)}).`,
      });
    } catch (e) {
      setBackupMsg({ kind: 'err', text: errMessage(e) });
    } finally {
      setBackupBusy('idle');
    }
  }

  async function handleImport(file: File) {
    const ok = window.confirm(
      'Importing replaces ALL current data on this device with the contents of the file. Continue?',
    );
    if (!ok) return;
    setBackupBusy('import');
    setBackupMsg(null);
    try {
      const summary = await importAll(file);
      const total = Object.values(summary.counts).reduce((s, n) => s + n, 0);
      setBackupMsg({ kind: 'ok', text: `Imported ${total} rows.` });
    } catch (e) {
      setBackupMsg({ kind: 'err', text: errMessage(e) });
    } finally {
      setBackupBusy('idle');
    }
  }

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

        <section className="space-y-2 mt-6 pt-4 border-t border-glow-100">
          <h4 className="font-display text-base text-glow-800 inline-flex items-center gap-2">
            <Database size={16} /> On-device storage
          </h4>
          <p className="text-xs text-glow-600">
            Photos and notes live in this browser's IndexedDB. Granting
            persistent storage tells the browser not to evict your data
            when disk space gets tight.
          </p>
          {storage ? (
            <>
              <div className="rounded-lg bg-glow-50 border border-glow-100 px-3 py-2 text-xs text-glow-700">
                <div className="flex justify-between">
                  <span>Used</span>
                  <span className="font-medium tabular-nums">{formatBytes(storage.usage)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Available</span>
                  <span className="font-medium tabular-nums">
                    {storage.quota > 0 ? formatBytes(storage.quota) : 'unknown'}
                  </span>
                </div>
                {storage.quota > 0 && (
                  <div className="mt-2 h-1.5 rounded-full bg-glow-200 overflow-hidden">
                    <div
                      className="h-full bg-glow-600"
                      style={{
                        width: `${Math.min(100, (storage.usage / storage.quota) * 100).toFixed(1)}%`,
                      }}
                    />
                  </div>
                )}
              </div>
              {storage.persistent ? (
                <p className="text-[11px] text-emerald-700 inline-flex items-center gap-1">
                  <Check size={12} /> Storage is persistent on this device.
                </p>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-glow-500">
                    Not yet persistent — the browser may evict data under
                    storage pressure.
                  </p>
                  <button
                    type="button"
                    className="btn-soft text-xs shrink-0"
                    onClick={handleMakePersistent}
                    disabled={persistBusy}
                  >
                    <Lock size={12} />
                    {persistBusy ? 'Asking…' : 'Make persistent'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-[11px] text-glow-500">
              Storage stats are not available in this browser.
            </p>
          )}
        </section>

        <section className="space-y-2 mt-6 pt-4 border-t border-glow-100">
          <h4 className="font-display text-base text-glow-800">Backup &amp; restore</h4>
          <p className="text-xs text-glow-600">
            All your data lives on this device. Export a single JSON file
            (photos included) you can save to iCloud Drive, Google Drive, or
            email-to-self, and import on any device or after clearing site
            data.
          </p>

          <div className="flex gap-2 flex-wrap pt-1">
            <button
              type="button"
              className="btn-soft"
              onClick={handleExport}
              disabled={backupBusy !== 'idle'}
            >
              <Download size={14} />
              {backupBusy === 'export' ? 'Exporting…' : 'Export to file'}
            </button>
            <button
              type="button"
              className="btn-soft"
              onClick={() => fileInputRef.current?.click()}
              disabled={backupBusy !== 'idle'}
            >
              <Upload size={14} />
              {backupBusy === 'import' ? 'Importing…' : 'Import from file'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void handleImport(f);
              }}
            />
          </div>

          {backupMsg && (
            <p
              className={`text-[11px] mt-1 ${
                backupMsg.kind === 'ok' ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {backupMsg.text}
            </p>
          )}
          <p className="text-[11px] text-glow-500">
            Importing replaces everything on this device with the file's
            contents.
          </p>
        </section>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}
