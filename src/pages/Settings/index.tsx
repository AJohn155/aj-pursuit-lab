import AuthPanel from './AuthPanel'
import BackupPanel from './BackupPanel'
import GlobalParams from './GlobalParams'
import VenueManager from './VenueManager'
import { T } from '../../components/EditableText'

export default function Settings() {
  return (
    <div className="space-y-6">
      <T as="h1" className="text-2xl font-semibold text-slate-900" id="settings.index.settings" d="Settings" />
      <AuthPanel />
      <GlobalParams />
      <BackupPanel />
      <VenueManager />
    </div>
  )
}
