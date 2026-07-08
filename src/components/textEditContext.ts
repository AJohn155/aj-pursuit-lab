// Context + hook for the app-wide text-edit mode (owner request 2026-07 round 4, item 15).
// Split from EditableText.tsx so that file only exports components (react-refresh rule).

import { createContext, useContext } from 'react'

export const TextEditContext = createContext<{ editing: boolean; setEditing: (v: boolean) => void }>({
  editing: false,
  setEditing: () => {},
})

export function useTextEdit() {
  return useContext(TextEditContext)
}
