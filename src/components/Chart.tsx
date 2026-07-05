// Shared Plotly chart wrapper (SPEC §2: "Use one consistent chart wrapper component").
//
// plotly.js-dist-min is a self-contained pre-built bundle (no separate `plotly.js` peer
// package needed). react-plotly.js's default export hardcodes an import of the full
// `plotly.js` package, so this binds its dependency-injectable factory entry point to the
// dist-min build instead — same component API, no extra ~1 MB dependency.
//
// 2026-07 redesign: charts inherit the app's Space Grotesk type, the reference palette
// (violet/cyan/mint first), and quiet cool-gray gridlines. Axis defaults are deep-merged
// per axis (a page setting `xaxis.title` must not wipe the default gridcolor).

import createPlotlyComponent from 'react-plotly.js/factory'
import PlotlyDistMin from 'plotly.js-dist-min'
import type { Data, Layout, LayoutAxis } from 'plotly.js'

const Plot = createPlotlyComponent(PlotlyDistMin)

export interface ChartProps {
  data: Data[]
  layout?: Partial<Layout>
  height?: number
  /** Accessible label describing what the chart shows. */
  ariaLabel: string
}

const AXIS_DEFAULTS: Partial<LayoutAxis> = {
  gridcolor: '#eef1f6',
  zerolinecolor: '#e2e8f0',
  linecolor: '#e6e9f0',
}

const DEFAULT_LAYOUT: Partial<Layout> = {
  margin: { l: 48, r: 16, t: 24, b: 40 },
  font: {
    family: "'Space Grotesk Variable', ui-sans-serif, system-ui, sans-serif",
    size: 12,
    color: '#475569',
  },
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  colorway: ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#84cc16'],
  legend: { orientation: 'h', y: -0.25 },
  hovermode: 'closest',
}

/** Deep-merges the axis defaults into every x/y axis key the caller supplies (plus the
 * primary two), so per-page axis settings extend rather than replace the theme. */
function mergeLayout(layout: Partial<Layout> | undefined): Partial<Layout> {
  const merged: Record<string, unknown> = { ...DEFAULT_LAYOUT, ...layout }
  const axisKeys = new Set(['xaxis', 'yaxis'])
  for (const key of Object.keys(layout ?? {})) {
    if (/^(x|y)axis\d*$/.test(key)) axisKeys.add(key)
  }
  for (const key of axisKeys) {
    merged[key] = { ...AXIS_DEFAULTS, ...((layout as Record<string, unknown> | undefined)?.[key] as object | undefined) }
  }
  return merged as Partial<Layout>
}

/** The one consistent chart component every page should render Plotly figures through. */
export default function Chart({ data, layout, height = 320, ariaLabel }: ChartProps) {
  return (
    <div role="img" aria-label={ariaLabel} style={{ width: '100%', height }}>
      <Plot
        data={data}
        layout={{ ...mergeLayout(layout), autosize: true }}
        useResizeHandler
        style={{ width: '100%', height: '100%' }}
        config={{ displaylogo: false, responsive: true }}
      />
    </div>
  )
}
