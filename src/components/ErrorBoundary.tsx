// App-wide crash guard. Without a boundary, any throw during render unmounts the whole
// React tree and leaves a blank white page with nothing to report — which is exactly what
// an upload crash looked like from the outside. This catches the throw, keeps the tab nav
// alive, and shows the message + stack with a copy button so a failure can be reported
// instead of guessed at.

import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Changing this value clears a caught error — pass the route key so navigating away recovers. */
  resetKey?: string
  /** Pre-set failure to display instead of the children — for errors thrown before render
   * (app startup), which no boundary can catch on its own. */
  error?: Error | null
}

interface State {
  error: Error | null
  componentStack: string | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null })
    // Keep the raw throw in the console too — the stack there has source-mapped frames.
    console.error('Uncaught render error:', error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null, componentStack: null })
    }
  }

  render() {
    const { componentStack } = this.state
    const error = this.props.error ?? this.state.error
    if (!error) return this.props.children

    const report = [
      `${error.name}: ${error.message}`,
      '',
      error.stack ?? '(no stack)',
      '',
      'Component stack:',
      componentStack ?? '(none)',
    ].join('\n')

    return (
      <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
        <h2 className="text-sm font-semibold text-red-900">This screen hit an error</h2>
        <p className="text-sm text-red-800">
          Your saved rides are untouched — nothing was lost. Switch tabs to keep working, or copy the
          detail below so the bug can be fixed.
        </p>
        <p className="rounded-lg bg-white px-3 py-2 font-mono text-sm text-red-900">
          {error.name}: {error.message}
        </p>
        <details className="text-xs text-red-800">
          <summary className="cursor-pointer font-medium">Stack trace</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-white p-3 text-[11px] leading-relaxed text-slate-700">
            {report}
          </pre>
        </details>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(report)}
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100"
          >
            Copy error detail
          </button>
          <button
            type="button"
            onClick={() => this.setState({ error: null, componentStack: null })}
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
}
