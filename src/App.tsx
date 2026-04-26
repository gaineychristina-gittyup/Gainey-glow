import { NavLink, Route, Routes } from 'react-router-dom';
import { Camera, Images, Layers, Sparkles, CalendarDays, FlaskConical } from 'lucide-react';
import Today from './pages/Today';
import Compare from './pages/Compare';
import Products from './pages/Products';
import Treatments from './pages/Treatments';
import Timeline from './pages/Timeline';
import Insights from './pages/Insights';

const NAV = [
  { to: '/', label: 'Today', icon: Camera, end: true },
  { to: '/compare', label: 'Compare', icon: Images },
  { to: '/products', label: 'Products', icon: FlaskConical },
  { to: '/treatments', label: 'Treatments', icon: Sparkles },
  { to: '/timeline', label: 'Timeline', icon: CalendarDays },
  { to: '/insights', label: 'Insights', icon: Layers },
];

export default function App() {
  return (
    <div className="min-h-full flex flex-col bg-gradient-to-b from-rose-50 via-pink-50 to-amber-50">
      <header className="px-4 pt-6 pb-3 max-w-3xl w-full mx-auto">
        <h1 className="font-display text-3xl text-glow-800 tracking-tight">
          Gainey Glow <span className="text-glow-400">✦</span>
        </h1>
        <p className="text-sm text-glow-700/80">Your daily skin journal.</p>
      </header>

      <main className="flex-1 px-4 pb-28 max-w-3xl w-full mx-auto">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/products" element={<Products />} />
          <Route path="/treatments" element={<Treatments />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/insights" element={<Insights />} />
        </Routes>
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-glow-100 bg-white/90 backdrop-blur">
        <ul className="max-w-3xl mx-auto grid grid-cols-6">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] ${
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
