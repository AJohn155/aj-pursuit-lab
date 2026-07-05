import { NavLink, Outlet } from 'react-router-dom'

const TABS = [
  { to: '/rides', label: 'Rides' },
  { to: '/compare', label: 'Compare' },
  { to: '/adjuster', label: 'Adjuster' },
  { to: '/watts-to-win', label: 'Watts to Win' },
  { to: '/gains', label: 'Gains' },
  { to: '/pacing', label: 'Pacing' },
  { to: '/race-day', label: 'Race Day' },
  { to: '/calculators', label: 'Calculators' },
  { to: '/records', label: 'Records' },
  { to: '/settings', label: 'Settings' },
]

const linkClasses = ({ isActive }: { isActive: boolean }) =>
  [
    'block rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-blue-600/90 text-white shadow-sm'
      : 'text-slate-300 hover:bg-white/10 hover:text-white',
  ].join(' ')

const mobileLinkClasses = ({ isActive }: { isActive: boolean }) =>
  [
    'flex min-w-16 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
    isActive ? 'text-blue-600' : 'text-slate-500',
  ].join(' ')

export default function TabShell() {
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <nav className="hidden w-56 shrink-0 bg-slate-900 p-4 md:block">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
            AJ
          </span>
          <span className="text-base font-semibold tracking-tight text-white">Pursuit Lab</span>
        </div>
        <ul className="space-y-1">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink to={tab.to} className={linkClasses}>
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
