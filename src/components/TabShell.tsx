import { NavLink, Outlet } from 'react-router-dom'
import ajMark from '../assets/aj-mark.png'

const TABS = [
  { to: '/rides', label: 'Rides' },
  { to: '/compare', label: 'Compare' },
  { to: '/adjuster', label: 'Adjuster' },
  { to: '/watts-to-win', label: 'Watts to Win' },
  { to: '/pacing', label: 'Pacing' },
  { to: '/race-day', label: 'Race Day' },
  { to: '/calculators', label: 'Calculators' },
  { to: '/records', label: 'Records' },
  { to: '/settings', label: 'Settings' },
]

const linkClasses = ({ isActive }: { isActive: boolean }) =>
  [
    'block rounded-full px-4 py-2 text-sm font-medium transition-colors',
    isActive ? 'text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  ].join(' ')

const activePillStyle = { backgroundImage: 'var(--grad-primary)' }

const mobileLinkClasses = ({ isActive }: { isActive: boolean }) =>
  [
    'flex min-w-16 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
    isActive ? 'text-violet-600' : 'text-slate-500',
  ].join(' ')

/** The owner's AJ monogram, gradient-tinted via CSS mask (source mark is solid; the mask
 * carries the shape, the background carries the reference's blue→violet gradient). */
function AjMark({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={className}
      style={{
        backgroundImage: 'var(--grad-primary)',
        WebkitMaskImage: `url(${ajMark})`,
        maskImage: `url(${ajMark})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  )
}

export default function TabShell() {
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <nav className="hidden w-56 shrink-0 border-r border-slate-200/80 bg-white p-4 md:block">
        <div className="mb-6 flex items-center gap-2.5 px-2 pt-1">
          <AjMark className="block h-7 w-10" />
          <span className="text-base font-semibold tracking-tight text-slate-900">Pursuit Lab</span>
        </div>
        <ul className="space-y-1">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink to={tab.to} className={linkClasses} style={({ isActive }) => (isActive ? activePillStyle : undefined)}>
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 flex overflow-x-auto border-t border-slate-200/80 bg-white/90 backdrop-blur md:hidden">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className={mobileLinkClasses}>
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
