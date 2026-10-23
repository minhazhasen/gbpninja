// Runs once when the server starts. Node-only work lives in instrumentation-node.ts so the edge bundle never sees node: imports.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { prepareDatabase } = await import("./instrumentation-node");
    await prepareDatabase();
  }
}
