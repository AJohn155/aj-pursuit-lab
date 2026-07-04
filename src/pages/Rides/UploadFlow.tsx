// Upload flow orchestration (SPEC §5.1): drop .fit → detection confirm → metadata form →
// save & analyze → navigate to the ride's detail page.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DetectionConfirm from './DetectionConfirm'
import type { DetectionConfirmResult } from './DetectionConfirm'
import MetadataForm from './MetadataForm'

export default function UploadFlow() {
  const [detection, setDetection] = useState<DetectionConfirmResult | null>(null)
  const navigate = useNavigate()

  if (!detection) {
    return <DetectionConfirm onConfirm={setDetection} />
  }

  return (
    <MetadataForm
      detection={detection}
      onCancel={() => setDetection(null)}
      onSaved={(rideId) => navigate(`/rides/${rideId}`)}
    />
  )
}
