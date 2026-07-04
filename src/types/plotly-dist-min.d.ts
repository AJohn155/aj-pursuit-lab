// plotly.js-dist-min ships no types of its own (it's the same runtime API as `plotly.js`,
// just pre-bundled). @types/plotly.js is a types-only DefinitelyTyped package with no
// matching runtime module, so it can only supply named types (Data, Layout, Config, ...),
// not a typed default export here — createPlotlyComponent only needs `object` anyway.
declare module 'plotly.js-dist-min' {
  const Plotly: object
  export default Plotly
}
