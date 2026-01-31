import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getSandboxManager } from "./src/sandbox-manager.js";
import { registerExecutionHook } from "./src/execution-hook.js";
import type { SandboxConfig } from "./src/types.js";

const e2bSandboxPlugin = {
  id: "carapace-e2b-sandbox",
  name: "Carapace E2B Sandbox",
  description:
    "E2B cloud sandbox execution for Carapace, providing isolated command execution in per-user sandboxes",
  configSchema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      e2bApiKey: { type: "string" },
      enablePersistence: { type: "boolean" },
      s3BucketName: { type: "string" },
      idleTimeoutMinutes: { type: "number" },
    },
  },

  register(api: OpenClawPluginApi) {
    const config: SandboxConfig = {
      e2bApiKey: api.config?.e2bApiKey as string | undefined,
      enablePersistence: (api.config?.enablePersistence as boolean | undefined) ?? true,
      s3BucketName: api.config?.s3BucketName as string | undefined,
      idleTimeoutMinutes: (api.config?.idleTimeoutMinutes as number | undefined) ?? 50,
    };

    const sandboxManager = getSandboxManager(config);

    // Register execution hook
    registerExecutionHook(api);

    // Register service for lifecycle management
    api.registerService({
      id: "carapace-e2b-sandbox",
      start: async () => {
        api.logger.info("[E2B] Sandbox service started");
      },
      stop: async () => {
        api.logger.info("[E2B] Terminating all sandboxes before shutdown...");
        await sandboxManager.terminateAll();
        api.logger.info("[E2B] All sandboxes terminated");
      },
    });

    // Gateway methods for sandbox management
    api.registerGatewayMethod("carapace.sandbox.status", async (req) => {
      try {
        const userId = req.query?.userId as string | undefined;
        if (!userId) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: "userId parameter required" }),
          };
        }

        const status = await sandboxManager.getStatus(userId);
        return {
          statusCode: 200,
          body: JSON.stringify(status),
        };
      } catch (error) {
        api.logger.error(`[E2B] Status error: ${error}`);
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: error instanceof Error ? error.message : "Status check failed",
          }),
        };
      }
    });

    api.registerGatewayMethod("carapace.sandbox.create", async (req) => {
      try {
        const userId = req.query?.userId as string | undefined;
        if (!userId) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: "userId parameter required" }),
          };
        }

        const sandbox = await sandboxManager.getOrCreate(userId);
        const status = await sandboxManager.getStatus(userId);

        return {
          statusCode: 200,
          body: JSON.stringify({ success: true, status }),
        };
      } catch (error) {
        api.logger.error(`[E2B] Create error: ${error}`);
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: error instanceof Error ? error.message : "Sandbox creation failed",
          }),
        };
      }
    });

    api.registerGatewayMethod("carapace.sandbox.kill", async (req) => {
      try {
        const userId = req.query?.userId as string | undefined;
        if (!userId) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: "userId parameter required" }),
          };
        }

        await sandboxManager.terminate(userId);

        return {
          statusCode: 200,
          body: JSON.stringify({ success: true }),
        };
      } catch (error) {
        api.logger.error(`[E2B] Kill error: ${error}`);
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: error instanceof Error ? error.message : "Sandbox termination failed",
          }),
        };
      }
    });

    api.registerGatewayMethod("carapace.sandbox.hibernate", async (req) => {
      try {
        const userId = req.query?.userId as string | undefined;
        if (!userId) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: "userId parameter required" }),
          };
        }

        await sandboxManager.hibernate(userId);

        return {
          statusCode: 200,
          body: JSON.stringify({ success: true }),
        };
      } catch (error) {
        api.logger.error(`[E2B] Hibernate error: ${error}`);
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: error instanceof Error ? error.message : "Sandbox hibernation failed",
          }),
        };
      }
    });

    api.logger.info("[E2B] Sandbox plugin registered successfully");
  },
};

export default e2bSandboxPlugin;
