import { Navigate, Route, Routes } from 'react-router-dom'
import TabShell from './components/TabShell'
import Rides from './pages/Rides'
import RideDetail from './pages/Rides/RideDetail'
import Compare from './pages/Compare'
import Adjuster from './pages/Adjuster'
import WattsToWin from './pages/WattsToWin'
import Pacing from './pages/Pacing'
import RaceDay from './pages/RaceDay'
import Calculators from './pages/Calculators'
import Records from './pages/Records'
import Settings from './pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route element={<TabShell />}>
        <Route index element={<Navigate to="/rides" replace />} />
        <Route path="rides" element={<Rides />} />
        <Route path="rides/:id" element={<RideDetail />} />
        <Route path="compare" element={<Compare />} />
        <Route path="adjuster" element={<Adjuster />} />
        <Route path="watts-to-win" element={<WattsToWin />} />
        {/* Gains moved under Calculators (owner request 2026-07); old links keep working. */}
        <Route path="gains" element={<Navigate to="/calculators?tab=gains" replace />} />
        <Route path="pacing" element={<Pacing />} />
        <Route path="race-day" element={<RaceDay />} />
        <Route path="calculators" element={<Calculators />} />
        <Route path="records" element={<Records />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/rides" replace />} />
      </Route>
    </Routes>
  )
}
