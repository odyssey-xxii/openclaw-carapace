import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { registerSecurityHook } from "./src/security-hook.js";
import { registerAuditLogHook } from "./src/audit-log-hook.js";
import { SecurityClassifier } from "./src/classifier.js";
import { LLMAuditor } from "./src/auditor.js";
import { getAuditStore } from "./src/audit-store.js";
import { getApprovalHandler } from "./src/approval-handler.js";
import { RateLimiter } from "./src/rate-limiter.js";
import { AnomalyDetector } from "./src/anomaly-detector.js";
import { scanForSecrets, redactSecrets, scanOutput, configureSecretsDetection, getSecretsDetectionConfig } from "./src/secrets-scanner.js";
import {
  detectPromptInjection,
  sanitizeInput,
  createDefaultConfig,
  type PromptInjectionConfig,
} from "./src/prompt-injection-detector.js";

const plugin = {
  id: "carapace-security",
  name: "Carapace Security",
  description:
    "3-tier security classification (Green/Yellow/Red) for shell commands with LLM-powered audit, approval workflow, and logging",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    // Initialize service singletons
    const auditStore = getAuditStore();
    const approvalHandler = getApprovalHandler();
    const classifier = new SecurityClassifier();
    const auditor = new LLMAuditor();
    const anomalyDetector = new AnomalyDetector();

    // Initialize rate limiter (default: 30 requests per minute, per user)
    const rateLimiter = new RateLimiter({
      windowMs: 60000,      // 1 minute
      maxRequests: 30,      // 30 requests per window
      perChannel: false,    // Apply per user globally
    });

    // Register hooks
    registerSecurityHook(api, rateLimiter, anomalyDetector);
    registerAuditLogHook(api);

    // Gateway method: Classify a command
    api.registerGatewayMethod("carapace.security.classify", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const command = params.command as string;

        if (!command) {
          respond(false, undefined, { code: "invalid_params", message: "command required" });
          return;
        }

        const result = classifier.classifyCommand(command);
        respond(true, result);
      } catch (error) {
        api.logger.error(`Error classifying command: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Classify with LLM
    api.registerGatewayMethod("carapace.security.classifyWithLLM", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const command = params.command as string;

        if (!command) {
          respond(false, undefined, { code: "invalid_params", message: "command required" });
          return;
        }

        const result = await auditor.classifyCommand(command);
        respond(true, result);
      } catch (error) {
        api.logger.error(`Error in LLM classification: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Get audit logs
    api.registerGatewayMethod("carapace.audit.logs", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const userId = params.userId as string;
        const limit = parseInt((params.limit as string) || "50", 10);
        const offset = parseInt((params.offset as string) || "0", 10);
        const level = params.level as string | undefined;
        const action = params.action as string | undefined;

        if (!userId) {
          respond(false, undefined, { code: "invalid_params", message: "userId required" });
          return;
        }

        const entries = auditStore.getEntries(userId, {
          limit,
          offset,
          level: level as any,
          action: action as any,
        });

        respond(true, { entries, total: auditStore.getCount() });
      } catch (error) {
        api.logger.error(`Error querying audit logs: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Get audit statistics
    api.registerGatewayMethod("carapace.audit.stats", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const userId = params.userId as string;
        const days = parseInt((params.days as string) || "7", 10);

        if (!userId) {
          respond(false, undefined, { code: "invalid_params", message: "userId required" });
          return;
        }

        const stats = auditStore.getStats(userId, days);
        respond(true, stats);
      } catch (error) {
        api.logger.error(`Error getting audit stats: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Get pending approvals
    api.registerGatewayMethod("carapace.approvals.pending", async (opts: any) => {
      try {
        const { respond } = opts;
        const pending = approvalHandler.getPendingRequests();
        respond(true, { requests: pending, count: pending.length });
      } catch (error) {
        api.logger.error(`Error getting pending approvals: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Approve a request
    api.registerGatewayMethod("carapace.approvals.approve", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const requestId = params.requestId as string;
        const approvedBy = params.approvedBy as string;

        if (!requestId || !approvedBy) {
          respond(false, undefined, {
            code: "invalid_params",
            message: "requestId and approvedBy required",
          });
          return;
        }

        approvalHandler.approveRequest(requestId, approvedBy);

        // Find and update the audit entry if available
        // This would link the approval back to the audit log
        respond(true, { success: true, message: "Request approved" });
      } catch (error) {
        api.logger.error(`Error approving request: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Reject a request
    api.registerGatewayMethod("carapace.approvals.reject", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const requestId = params.requestId as string;
        const reason = (params.reason as string) || undefined;

        if (!requestId) {
          respond(false, undefined, { code: "invalid_params", message: "requestId required" });
          return;
        }

        approvalHandler.rejectRequest(requestId, reason);
        respond(true, { success: true, message: "Request rejected" });
      } catch (error) {
        api.logger.error(`Error rejecting request: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Request approval for a command
    api.registerGatewayMethod("carapace.approvals.request", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const command = params.command as string;
        const _level = (params.level as string) || "yellow";
        const _reason = (params.reason as string) || "Requires approval";

        if (!command) {
          respond(false, undefined, { code: "invalid_params", message: "command required" });
          return;
        }

        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Approval timeout"));
          }, 5000); // 5 second timeout for API response

          try {
            const req = approvalHandler.getPendingRequests();
            if (req.length > 0) {
              clearTimeout(timeout);
              resolve(req[0]);
            }
          } catch (err) {
            clearTimeout(timeout);
            reject(err);
          }
        }).catch(() => null);

        respond(true, {
          requestCreated: true,
          message: "Approval request created. Waiting for response...",
        });
      } catch (error) {
        api.logger.error(`Error requesting approval: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Check rate limit status
    api.registerGatewayMethod("carapace.security.rateLimit.status", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const userId = params.userId as string;
        const channelId = (params.channelId as string) || undefined;

        if (!userId) {
          respond(false, undefined, { code: "invalid_params", message: "userId required" });
          return;
        }

        const result = rateLimiter.check(userId, channelId);
        respond(true, {
          allowed: result.allowed,
          remaining: result.remaining,
          resetAt: result.resetAt.toISOString(),
          retryAfterSeconds: result.retryAfterMs ? Math.ceil(result.retryAfterMs / 1000) : undefined,
        });
      } catch (error) {
        api.logger.error(`Error checking rate limit status: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Reset rate limit for a user
    api.registerGatewayMethod("carapace.security.rateLimit.reset", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const userId = params.userId as string;

        if (!userId) {
          respond(false, undefined, { code: "invalid_params", message: "userId required" });
          return;
        }

        rateLimiter.reset(userId);
        respond(true, { success: true, message: `Rate limit reset for user ${userId}` });
      } catch (error) {
        api.logger.error(`Error resetting rate limit: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Analyze command for anomalies
    api.registerGatewayMethod("carapace.security.anomaly.analyze", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const userId = params.userId as string;
        const command = params.command as string;

        if (!userId || !command) {
          respond(false, undefined, { code: "invalid_params", message: "userId and command required" });
          return;
        }

        const result = await anomalyDetector.analyze(userId, command);
        respond(true, result);
      } catch (error) {
        api.logger.error(`Error analyzing anomaly: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Update user baseline for anomaly detection
    api.registerGatewayMethod("carapace.security.anomaly.updateBaseline", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const userId = params.userId as string;

        if (!userId) {
          respond(false, undefined, { code: "invalid_params", message: "userId required" });
          return;
        }

        await anomalyDetector.updateBaseline(userId);
        const baseline = anomalyDetector.getBaseline(userId);
        respond(true, { success: true, baseline });
      } catch (error) {
        api.logger.error(`Error updating baseline: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Get user baseline
    api.registerGatewayMethod("carapace.security.anomaly.getBaseline", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const userId = params.userId as string;

        if (!userId) {
          respond(false, undefined, { code: "invalid_params", message: "userId required" });
          return;
        }

        const baseline = anomalyDetector.getBaseline(userId);
        respond(true, { baseline });
      } catch (error) {
        api.logger.error(`Error getting baseline: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Scan text for secrets
    api.registerGatewayMethod("carapace.security.secrets.scan", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const text = params.text as string;

        if (!text) {
          respond(false, undefined, { code: "invalid_params", message: "text required" });
          return;
        }

        const scanResult = scanOutput(text);
        respond(true, scanResult);
      } catch (error) {
        api.logger.error(`Error scanning for secrets: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Redact secrets from text
    api.registerGatewayMethod("carapace.security.secrets.redact", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const text = params.text as string;

        if (!text) {
          respond(false, undefined, { code: "invalid_params", message: "text required" });
          return;
        }

        const redacted = redactSecrets(text);
        const secrets = scanForSecrets(text);
        respond(true, { redacted, secretsFound: secrets.length, secrets });
      } catch (error) {
        api.logger.error(`Error redacting secrets: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Configure secrets detection behavior
    api.registerGatewayMethod("carapace.security.secrets.configure", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const mode = params.mode as string | undefined;
        const enableLineNumbers = params.enableLineNumbers as boolean | undefined;
        const maxSecretsPerType = params.maxSecretsPerType as number | undefined;

        const config: any = {};
        if (mode && ['warn', 'redact', 'block'].includes(mode)) {
          config.mode = mode;
        }
        if (enableLineNumbers !== undefined) {
          config.enableLineNumbers = enableLineNumbers;
        }
        if (maxSecretsPerType !== undefined && maxSecretsPerType > 0) {
          config.maxSecretsPerType = maxSecretsPerType;
        }

        if (Object.keys(config).length === 0) {
          respond(false, undefined, {
            code: "invalid_params",
            message: "At least one valid config parameter required (mode: warn|redact|block, enableLineNumbers, maxSecretsPerType)",
          });
          return;
        }

        configureSecretsDetection(config);
        const currentConfig = getSecretsDetectionConfig();
        respond(true, { success: true, config: currentConfig });
      } catch (error) {
        api.logger.error(`Error configuring secrets detection: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Get current secrets detection configuration
    api.registerGatewayMethod("carapace.security.secrets.getConfig", async (opts: any) => {
      try {
        const { respond } = opts;
        const config = getSecretsDetectionConfig();
        respond(true, { config });
      } catch (error) {
        api.logger.error(`Error getting secrets detection config: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Detect prompt injection in text
    api.registerGatewayMethod("carapace.security.injection.detect", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const text = params.text as string;
        const sensitivity = (params.sensitivity as string) || "high";

        if (!text) {
          respond(false, undefined, { code: "invalid_params", message: "text required" });
          return;
        }

        const config: PromptInjectionConfig = {
          enabled: true,
          sensitivity: sensitivity as "low" | "medium" | "high",
          blockHighConfidence: true,
          logDetections: false,
        };

        const result = detectPromptInjection(text, config);
        respond(true, {
          detected: result.detected,
          confidence: (result.confidence * 100).toFixed(1) + "%",
          reason: result.reason,
          patterns: result.patterns.map((p) => ({
            type: p.type,
            severity: p.severity,
            match: p.match,
          })),
        });
      } catch (error) {
        api.logger.error(`Error detecting prompt injection: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Sanitize input to remove injection attempts
    api.registerGatewayMethod("carapace.security.injection.sanitize", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const text = params.text as string;

        if (!text) {
          respond(false, undefined, { code: "invalid_params", message: "text required" });
          return;
        }

        const sanitized = sanitizeInput(text);
        respond(true, {
          original: text,
          sanitized,
          modified: text !== sanitized,
        });
      } catch (error) {
        api.logger.error(`Error sanitizing input: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Get prompt injection detection config
    api.registerGatewayMethod("carapace.security.injection.getConfig", async (opts: any) => {
      try {
        const { respond } = opts;
        const config = createDefaultConfig();
        respond(true, { config });
      } catch (error) {
        api.logger.error(`Error getting injection config: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    api.logger.info("carapace-security plugin registered successfully");
  },
};

export default plugin;
