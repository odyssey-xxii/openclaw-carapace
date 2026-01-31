import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getSandboxManager } from "./sandbox-manager.js";

export function registerExecutionHook(api: OpenClawPluginApi) {
  const sandboxManager = getSandboxManager();

  api.on("before_tool_call", async (payload) => {
    // Only intercept Bash tool calls
    if (payload.tool !== "Bash") {
      return payload;
    }

    const userId = payload.context?.userId as string | undefined;
    if (!userId) {
      api.logger.warn("No userId in context, executing locally");
      return payload;
    }

    try {
      // Get or create user's sandbox
      await sandboxManager.getOrCreate(userId);

      // Execute command in E2B sandbox
      const command = payload.parameters.command as string;
      const result = await sandboxManager.execute(userId, command);

      // Return modified payload with E2B result
      return {
        ...payload,
        intercepted: true,
        result: {
          success: result.success,
          output: result.output || result.error || "",
          exitCode: result.exitCode,
        },
      };
    } catch (error) {
      api.logger.error(
        `Sandbox execution error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      return {
        ...payload,
        intercepted: true,
        result: {
          success: false,
          output: error instanceof Error ? error.message : "Sandbox execution failed",
          exitCode: 1,
        },
      };
    }
  });
}
