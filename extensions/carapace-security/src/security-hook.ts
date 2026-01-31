import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { SecurityClassifier } from "./classifier.js";
import { LLMAuditor } from "./auditor.js";
import { getAuditStore } from "./audit-store.js";
import { getApprovalHandler } from "./approval-handler.js";
import { RateLimiter } from "./rate-limiter.js";
import { AnomalyDetector } from "./anomaly-detector.js";
import {
  detectPromptInjection,
  sanitizeInput,
  type InjectionDetectionResult,
} from "@carapace-os/auditor";
import { isPlatformUserAuthorized } from "@carapace/shared";

export function registerSecurityHook(api: OpenClawPluginApi, rateLimiter?: RateLimiter, anomalyDetector?: AnomalyDetector) {
  const classifier = new SecurityClassifier();
  const _auditor = new LLMAuditor();
  const auditStore = getAuditStore();
  const _approvalHandler = getApprovalHandler();

  api.on(
    "before_tool_call",
    async (event: any, ctx: any) => {
      // Only audit Bash/shell tool calls
      if (event.toolName !== "Bash") return;

      const command = event.params.command as string | undefined;
      if (!command || command.trim().length === 0) return;

      const userId = ctx.agentId || ctx.userId || "unknown";
      const channelId = ctx.channel || ctx.channelId || "unknown";

      // Extract platform user ID from context
      const platformUserId = ctx.platformUserId || ctx.message?.from?.id || "unknown";

      // Check platform user authorization before processing any command
      try {
        const isAuthorized = await isPlatformUserAuthorized(userId, channelId, platformUserId);
        if (!isAuthorized) {
          api.logger.warn(
            `[AUTHORIZATION] Platform user ${platformUserId} on ${channelId} is not authorized to use Carapace (userId: ${userId})`
          );

          // Log authorization failure to audit store
          const entry = auditStore.createEntry(
            command,
            "red",
            "block",
            `User not authorized. Platform user: ${platformUserId}, Channel: ${channelId}`,
            userId,
            channelId
          );
          api.logger.info(`[AUDIT] Authorization failure logged as entry ${entry.id}`);

          return {
            block: true,
            blockReason: "You don't have access to this Carapace account. Sign up at https://carapace.dev",
          };
        }
      } catch (error) {
        api.logger.error(`[AUTHORIZATION] Error checking authorization: ${error}`);
        // Fail safe - block on error to avoid unauthorized access
        return {
          block: true,
          blockReason: "Authorization check failed. Please try again later.",
        };
      }

      try {
        // Check for prompt injection attacks first (before any other processing)
        const injectionDetection = detectPromptInjection(command);
        if (injectionDetection.isInjection && injectionDetection.confidence > 0.5) {
          api.logger.warn(
            `[PROMPT-INJECTION] Detected attack for user ${userId}: ${injectionDetection.reason}`
          );

          // Log injection attempt to audit store
          const entry = auditStore.createEntry(
            command,
            "red",
            "block",
            `Prompt injection detected: ${injectionDetection.reason}`,
            userId,
            channelId
          );
          api.logger.info(`[AUDIT] Injection attempt logged as entry ${entry.id}`);

          return {
            block: true,
            blockReason: `Security blocked: ${injectionDetection.reason}`,
          };
        }

        // Check rate limit if enabled
        if (rateLimiter) {
          const rateLimitCheck = rateLimiter.check(userId, channelId);
          if (!rateLimitCheck.allowed) {
            api.logger.warn(
              `[SECURITY] Rate limit exceeded for user ${userId}. Retry after ${rateLimitCheck.retryAfterMs}ms`
            );
            return {
              block: true,
              blockReason: `Rate limit exceeded. Try again in ${Math.ceil((rateLimitCheck.retryAfterMs || 0) / 1000)} seconds`,
            };
          }
        }

        // First try pattern-based classification
        const classificationResult = classifier.classifyCommand(command);

        // Check for anomalies if detector is available
        let anomalyAnalysis = null;
        let finalLevel = classificationResult.level;
        let finalAction = classificationResult.action;
        let finalReason = classificationResult.reason;

        if (anomalyDetector) {
          anomalyAnalysis = await anomalyDetector.analyze(userId, command);

          // Escalate GREEN to YELLOW if anomaly detected
          if (classificationResult.level === "green" && anomalyAnalysis.isAnomaly) {
            finalLevel = "yellow";
            finalAction = "ask";
            finalReason = `Anomaly detected: ${anomalyAnalysis.factors.join(", ")}`;
          }

          // Escalate YELLOW to RED if high anomaly score
          if (classificationResult.level === "yellow" && anomalyAnalysis.score >= 0.7) {
            finalLevel = "red";
            finalAction = "block";
            finalReason = `High anomaly score (${(anomalyAnalysis.score * 100).toFixed(1)}%): ${anomalyAnalysis.factors.join(", ")}`;
          }
        }

        // Log the audit entry
        const entry = auditStore.createEntry(
          command,
          finalLevel,
          finalAction,
          finalReason,
          userId,
          channelId
        );

        api.logger.info(
          `[SECURITY] ${finalLevel.toUpperCase()} ${finalAction}: ${command.substring(0, 80)}`
        );

        if (anomalyAnalysis) {
          api.logger.info(
            `[ANOMALY] Score: ${(anomalyAnalysis.score * 100).toFixed(1)}% | ${anomalyAnalysis.factors.join(" | ")}`
          );
        }

        // Handle blocking
        if (finalAction === "block") {
          return {
            block: true,
            blockReason: `Command blocked for security: ${finalReason}`,
          };
        }

        // Handle approval request
        if (finalAction === "ask") {
          // Attach audit entry ID so approval handler can link them
          return {
            params: {
              ...event.params,
              _auditEntryId: entry.id,
              _securityLevel: finalLevel,
              _securityReason: finalReason,
            },
          };
        }

        // Allow for GREEN commands
        return {
          params: {
            ...event.params,
            _auditEntryId: entry.id,
          },
        };
      } catch (error) {
        api.logger.error(`[SECURITY] Classification error: ${error}`);
        // Fail safe - allow but log for review
        return {
          params: {
            ...event.params,
            _classificationError: true,
          },
        };
      }
    },
    { priority: 100 }
  );
}
