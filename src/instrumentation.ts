export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeServerToken } = await import("./server/security/token");
    initializeServerToken();

    const { getDb } = await import("./server/db");
    getDb();
  }
}
