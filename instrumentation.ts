export async function register() {
  console.log(`Registering instrumentation for ${process.env.NEXT_RUNTIME}`);
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("Importing node instrumentation.");
    await import("./instrumentation.node.js");
  }
}
