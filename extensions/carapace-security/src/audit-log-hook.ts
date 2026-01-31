import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getAuditStore } from "./audit-store.js";
import { scanOutput, getSecretsDetectionConfig, type ScanResult } from "./secrets-scanner.js";

export function registerAuditLogHook(api: OpenClawPluginApi) {
  const auditStore = getAuditStore();

  api.on(
    "after_tool_call",
    async (event: any, _ctx: any): Promise<void | { block: boolean; blockReason: string }> => {
      // Only track Bash tool calls
      if (event.toolName !== "Bash") return;

      const auditEntryId = event.params._auditEntryId as string | undefined;
      if (!auditEntryId) return;

      try {
        // Convert result to string
        let output =
          typeof event.result === "string"
            ? event.result
            : event.result
              ? JSON.stringify(event.result)
              : "";

        // Scan output for secrets
        const config = getSecretsDetectionConfig();
        const scanResult: ScanResult = scanOutput(output);

        if (scanResult.hasSecrets) {
          // Log secret detection with categorization
          const secretTypes = Object.entries(scanResult.secretsByType)
            .map(([type, count]) => `${count} ${type}`)
            .join(", ");

          api.logger.warn(
            `[SECURITY] Secrets detected in command output (${auditEntryId}): ${secretTypes}`
          );

          // Log each secret with line number
          for (const secret of scanResult.secrets) {
            const lineInfo = secret.lineNumber ? ` (line ${secret.lineNumber})` : "";
            api.logger.debug(
              `[SECURITY] ${secret.type}: ${secret.redacted}${lineInfo}`
            );
          }

          // Handle based on configuration mode
          if (config.mode === 'block') {
            api.logger.error(
              `[SECURITY] Blocking command output due to detected secrets in mode: ${config.mode}`
            );

            // Update audit entry with blocking info
            auditStore.updateEntry(auditEntryId, {
              executedAt: new Date(),
              output: "[OUTPUT BLOCKED - Secrets detected]",
              secretsFound: scanResult.secrets,
              secretsRedacted: true,
            });

            // Return block response to prevent output from being returned
            return {
              block: true,
              blockReason: `Command output contains ${scanResult.secretCount} secret(s) and has been blocked for security`,
            };
          }

          // For warn and redact modes, update with appropriate output
          const finalOutput =
            config.mode === 'redact' && scanResult.redactedOutput
              ? scanResult.redactedOutput
              : output;

          auditStore.updateEntry(auditEntryId, {
            executedAt: new Date(),
            output: finalOutput.substring(0, 4096), // Limit output size
            error: event.error ? String(event.error) : undefined,
            secretsFound: scanResult.secrets,
            secretsRedacted: config.mode === 'redact',
          });

          api.logger.info(
            `[SECURITY] Secrets handled in mode: ${config.mode} (${scanResult.secretCount} total)`
          );
        } else {
          // No secrets found - normal audit logging
          auditStore.updateEntry(auditEntryId, {
            executedAt: new Date(),
            output: output.substring(0, 4096),
            error: event.error ? String(event.error) : undefined,
          });

          api.logger.debug(`[AUDIT] Logged execution of command (${auditEntryId})`);
        }
      } catch (error) {
        api.logger.error(
          `[AUDIT] Failed to update audit entry: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}
