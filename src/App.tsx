import { useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { Camera, Images, Layers, CalendarDays, FlaskConical, Settings } from 'lucide-react';
import Today from './pages/Today';
import Compare from './pages/Compare';
import Products from './pages/Products';
import Timeline from './pages/Timeline';
import Insights from './pages/Insights';
import SettingsModal from './components/SettingsModal';
import { useGeminiKey } from './lib/settings';

const NAV = [
  { to: '/', label: 'Today', icon: Camera, end: true },
  { to: '/compare', label: 'Compare', icon: Images },
  { to: '/products', label: 'Products', icon: FlaskConical },
  { to: '/timeline', label: 'Timeline', icon: CalendarDays },
  { to: '/insights', label: 'Insights', icon: Layers },
];

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const apiKey = useGeminiKey();
  return (
    <div className="min-h-full flex flex-col bg-gradient-to-b from-[#b89888] via-[#8a6657] to-[#4a342d]">
      <header className="px-4 pt-6 pb-3 max-w-3xl w-full mx-auto flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl text-rose-50 tracking-tight drop-shadow-sm">
            GaineyGlow <span className="text-glow-300">✦</span>
          </h1>
          <p className="text-sm text-rose-100/80">Your daily skin journal.</p>
        </div>
        <button
          className="relative p-2 mt-1 rounded-full text-rose-50 hover:bg-white/15 transition active:scale-95"
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
        >
          <Settings size={20} />
          {apiKey && (
            <span
              className="absolute top-1 right-1 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[#8a6657]"
              aria-label="Gemini API key saved"
            />
          )}
        </button>
      </header>

      <main className="flex-1 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] max-w-3xl w-full mx-auto">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/products" element={<Products />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/insights" element={<Insights />} />
        </Routes>
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      <nav
        className="fixed bottom-0 inset-x-0 z-30 border-t border-glow-100 bg-white/90 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="max-w-3xl mx-auto grid grid-cols-5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `w-full flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] ${
                    isActive ? 'text-glow-700' : 'text-glow-400 hover:text-glow-600'
                  }`
                }
              >
                <Icon size={20} />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
