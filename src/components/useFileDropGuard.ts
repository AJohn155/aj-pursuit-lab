// Guard against dropping a file anywhere outside a drop zone.
//
// The upload boxes (DetectionConfirm, CsvImport) preventDefault on their own dragover/drop,
// but nothing did outside them — and the browser's default action for a file dropped on a
// page is to NAVIGATE to that file. Miss the box by a few pixels with a .fit and Chrome
// replaces the whole app with a blank page rendering unrecognised binary, which reads
// exactly like a crash. Nothing in the app runs at that point, so no error boundary can
// help: the fix has to be stopping the navigation.
//
// Listeners sit on window during the bubble phase, so a zone's own handler has already read
// the files by the time this runs; calling preventDefault again is harmless. Only file drags
// are swallowed — text/link drags keep working normally.

import { useEffect } from 'react'

function carriesFiles(e: DragEvent): boolean {
  const types = e.dataTransfer?.types
  return types ? Array.from(types).includes('Files') : false
}

export function useFileDropGuard() {
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      // dragover must also be cancelled — without it the drop event is never delivered and
      // the browser navigates regardless of what the drop handler would have done.
      if (carriesFiles(e)) e.preventDefault()
    }
    const onDrop = (e: DragEvent) => {
      if (carriesFiles(e)) e.preventDefault()
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])
}
