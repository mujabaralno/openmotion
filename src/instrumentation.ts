export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeServerToken } = await import("./server/security/token");
    initializeServerToken();

    const { getDb } = await import("./server/db");
    getDb();

    const {
      initializeWorkspace,
      WorkspaceInitializationError,
    } = await import("./server/workspace/init");

    try {
      const workspace = initializeWorkspace();
      console.info(`[workspace] siap di ${workspace.workspaceRoot}`);
    } catch (error) {
      if (error instanceof WorkspaceInitializationError) {
        console.error(
          `[workspace] ${error.message}\nPerbaikan: ${error.fix}`,
        );
      } else {
        console.error("[workspace] gagal diinisialisasi:", error);
      }
    }
  }
}
