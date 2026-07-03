import AuthPanel from './AuthPanel'
import BackupPanel from './BackupPanel'
import GlobalParams from './GlobalParams'
import VenueManager from './VenueManager'

export default function Settings() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
      <AuthPanel />
      <GlobalParams />
      <BackupPanel />
      <VenueManager />
    </div>
  )
}
