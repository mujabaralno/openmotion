export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeServerToken } = await import("./server/security/token");
    initializeServerToken();

    const { getDb } = await import("./server/db");
    getDb();
    const { recoverInterruptedSteps } = await import("./server/pipeline/state");
    recoverInterruptedSteps();

    const {
      initializeWorkspace,
      WorkspaceInitializationError,
    } = await import("./server/workspace/init");

    try {
      const workspace = initializeWorkspace();
      const { seedProductionFiles } = await import("./server/pipeline/prompts");
      seedProductionFiles();
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

    const { installAgentShutdownHandlers } = await import(
      "./server/agents/registry"
    );
    installAgentShutdownHandlers();
  }
}
