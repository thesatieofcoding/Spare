// `astro check` resolves .astro imports itself; plain tsc needs this shim.
declare module "*.astro" {
  const component: import("astro/runtime/server/index.js").AstroComponentFactory;
  export default component;
}
