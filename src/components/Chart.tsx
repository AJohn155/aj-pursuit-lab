// Shared Plotly chart wrapper (SPEC §2: "Use one consistent chart wrapper component").
//
// plotly.js-dist-min is a self-contained pre-built bundle (no separate `plotly.js` peer
// package needed). react-plotly.js's default export hardcodes an import of the full
// `plotly.js` package, so this binds its dependency-injectable factory entry point to the
// dist-min build instead — same component API, no extra ~1 MB dependency.

import createPlotlyComponent from 'react-plotly.js/factory'
import PlotlyDistMin from 'plotly.js-dist-min'
import type { Data, Layout } from 'plotly.js'

const Plot = createPlotlyComponent(PlotlyDistMin)

export interface ChartProps {
  data: Data[]
  layout?: Partial<Layout>
  height?: number
  /** Accessible label describing what the chart shows. */
  ariaLabel: string
}

const DEFAULT_LAYOUT: Partial<Layout> = {
  margin: { l: 48, r: 16, t: 24, b: 40 },
  font: { family: 'ui-sans-serif, system-ui, sans-serif', size: 12, color: '#334155' },
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  legend: { orientation: 'h', y: -0.25 },
  hovermode: 'closest',
}

/** The one consistent chart component every page should render Plotly figures through. */
export default function Chart({ data, layout, height = 320, ariaLabel }: ChartProps) {
  return (
    <div role="img" aria-label={ariaLabel} style={{ width: '100%', height }}>
      <Plot
        data={data}
        layout={{ ...DEFAULT_LAYOUT, ...layout, autosize: true }}
        useResizeHandler
        style={{ width: '100%', height: '100%' }}
        config={{ displaylogo: false, responsive: true }}
      />
    </div>
  )
}
