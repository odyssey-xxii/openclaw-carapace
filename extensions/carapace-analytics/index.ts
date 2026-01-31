import type { OpenClawPluginApi } from "../../src/plugins/types.js";
import type { GatewayRequestHandler } from "../../src/gateway/server-methods/types.js";

import { MetricsCollector } from "./src/metrics-collector.js";
import { MetricsAggregator } from "./src/aggregator.js";

export default function register(api: OpenClawPluginApi) {
  let collector: MetricsCollector;
  let aggregator: MetricsAggregator;

  // Initialize in service since we need stateDir from context
  let initialized = false;

  const ensureInitialized = (stateDir: string) => {
    if (!initialized) {
      collector = new MetricsCollector(stateDir);
      aggregator = new MetricsAggregator(collector);
      initialized = true;
    }
  };

  const extractPeriod = (req: any): "daily" | "weekly" | "monthly" => {
    try {
      const url = new URL(req.url || "http://localhost/");
      const period = url.searchParams.get("period");
      if (period === "weekly" || period === "monthly") {
        return period;
      }
      return "daily";
    } catch {
      return "daily";
    }
  };

  // Register gateway methods for dashboard access
  const usageHandler: GatewayRequestHandler = async (opts) => {
    try {
      const stateDir = api.runtime.state.resolveStateDir();
      ensureInitialized(stateDir);
      const period = extractPeriod(opts.req);
      const metrics = await aggregator.aggregate(period);
      opts.respond(true, metrics);
    } catch (error) {
      api.logger.error(`Analytics usage error: ${String(error)}`);
      opts.respond(false, null, { message: String(error) });
    }
  };

  const commandsHandler: GatewayRequestHandler = async (opts) => {
    try {
      const stateDir = api.runtime.state.resolveStateDir();
      ensureInitialized(stateDir);
      const period = extractPeriod(opts.req);
      const commands = await aggregator.getCommandBreakdown(period);
      opts.respond(true, commands);
    } catch (error) {
      api.logger.error(`Analytics commands error: ${String(error)}`);
      opts.respond(false, null, { message: String(error) });
    }
  };

  const channelsHandler: GatewayRequestHandler = async (opts) => {
    try {
      const stateDir = api.runtime.state.resolveStateDir();
      ensureInitialized(stateDir);
      const period = extractPeriod(opts.req);
      const channels = await aggregator.getChannelUsage(period);
      opts.respond(true, channels);
    } catch (error) {
      api.logger.error(`Analytics channels error: ${String(error)}`);
      opts.respond(false, null, { message: String(error) });
    }
  };

  const securityHandler: GatewayRequestHandler = async (opts) => {
    try {
      const stateDir = api.runtime.state.resolveStateDir();
      ensureInitialized(stateDir);
      const period = extractPeriod(opts.req);
      const security = await aggregator.getSecurityBreakdown(period);
      opts.respond(true, security);
    } catch (error) {
      api.logger.error(`Analytics security error: ${String(error)}`);
      opts.respond(false, null, { message: String(error) });
    }
  };

  api.registerGatewayMethod("carapace.analytics.usage", usageHandler);
  api.registerGatewayMethod("carapace.analytics.commands", commandsHandler);
  api.registerGatewayMethod("carapace.analytics.channels", channelsHandler);
  api.registerGatewayMethod("carapace.analytics.security", securityHandler);

  // Register hooks to collect metrics
  api.on(
    "after_tool_call",
    async (event, ctx) => {
      try {
        const stateDir = api.runtime.state.resolveStateDir();
        ensureInitialized(stateDir);
        const durationMs = event.durationMs || 0;
        const blocked = !!event.error;
        const approved = !blocked;
        const channelId = ctx.sessionKey?.split(":")[0] || "unknown";

        await collector.recordCommandExecution(channelId, approved, blocked, durationMs);
      } catch (error) {
        api.logger.error(`Failed to record command execution: ${String(error)}`);
      }
    },
    { priority: 100 }, // Low priority, don't interfere with other hooks
  );

  // Register cleanup service
  api.registerService({
    id: "carapace-analytics-cleanup",
    start: async (svcCtx) => {
      const stateDir = svcCtx.stateDir;
      ensureInitialized(stateDir);

      // Run cleanup daily
      const retentionDays = (api.pluginConfig?.retentionDays as number) || 90;
      const cleanup = async () => {
        try {
          await collector.deleteOldMetrics(retentionDays);
        } catch (error) {
          api.logger.error(`Analytics cleanup failed: ${String(error)}`);
        }
      };

      // Run immediately
      await cleanup();

      // Schedule daily cleanup at midnight
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const msUntilMidnight = tomorrow.getTime() - now.getTime();
      setTimeout(() => {
        cleanup().catch((e) => api.logger.error(`Cleanup error: ${String(e)}`));
        setInterval(() => {
          cleanup().catch((e) => api.logger.error(`Cleanup error: ${String(e)}`));
        }, 24 * 60 * 60 * 1000);
      }, msUntilMidnight);
    },
  });

  api.logger.info("Carapace Analytics extension loaded");
}
