// Maps the Hatchable SDK import used by api/ and lib/ onto the Render-compatible shim.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "hatchable") return { url: new URL("./shim.js", import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
