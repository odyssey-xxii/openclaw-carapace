import type { NotificationService } from "./notification-service.js";
import { NotificationType, NotificationSeverity } from "./types.js";

/**
 * Register hook for security events (blocked commands)
 */
export function registerSecurityHook(api: any, notificationService: NotificationService) {
  api.on(
    "carapace.security.command_blocked",
    async (event: any) => {
      try {
        const { userId, command, reason, channelId } = event;

        if (!userId) return;

        await notificationService.sendNotification({
          userId,
          channelId,
          type: NotificationType.COMMAND_BLOCKED,
          severity: NotificationSeverity.HIGH,
          title: "Command Blocked",
          message: `Command blocked for security: ${reason || "Policy violation"}`,
          metadata: {
            command: command?.substring(0, 100),
            reason,
          },
        });
      } catch (error) {
        api.logger.error(`Error in security notification hook: ${error}`);
      }
    }
  );

  // Hook for approval requests
  api.on(
    "carapace.security.approval_required",
    async (event: any) => {
      try {
        const { userId, command, reason, channelId } = event;

        if (!userId) return;

        await notificationService.sendNotification({
          userId,
          channelId,
          type: NotificationType.APPROVAL_REQUIRED,
          severity: NotificationSeverity.MEDIUM,
          title: "Approval Required",
          message: `A command requires your approval: ${reason || "Manual review needed"}`,
          metadata: {
            command: command?.substring(0, 100),
            approvalRequired: true,
          },
        });
      } catch (error) {
        api.logger.error(`Error in approval notification hook: ${error}`);
      }
    }
  );
}

/**
 * Register hook for cron job events
 */
export function registerCronHook(api: any, notificationService: NotificationService) {
  api.on(
    "carapace.cron.job_completed",
    async (event: any) => {
      try {
        const { userId, jobName, jobId, success, error, channelId } = event;

        if (!userId) return;

        await notificationService.sendNotification({
          userId,
          channelId,
          type: NotificationType.TASK_COMPLETE,
          severity: success ? NotificationSeverity.LOW : NotificationSeverity.MEDIUM,
          title: success ? "Task Completed" : "Task Failed",
          message: success
            ? `Scheduled task "${jobName}" completed successfully`
            : `Scheduled task "${jobName}" failed: ${error || "Unknown error"}`,
          metadata: {
            jobId,
            jobName,
            success,
            error: error || undefined,
          },
        });
      } catch (error) {
        api.logger.error(`Error in cron notification hook: ${error}`);
      }
    }
  );
}

/**
 * Register hook for system alerts
 */
export function registerSystemAlertHook(api: any, notificationService: NotificationService) {
  api.on(
    "carapace.system.alert",
    async (event: any) => {
      try {
        const { userId, title, message, severity = "medium", channelId } = event;

        if (!userId) return;

        await notificationService.sendNotification({
          userId,
          channelId,
          type: NotificationType.SYSTEM_ALERT,
          severity: severity as any,
          title: title || "System Alert",
          message,
          skipQueue: severity === "critical",
        });
      } catch (error) {
        api.logger.error(`Error in system alert notification hook: ${error}`);
      }
    }
  );
}

/**
 * Register hook for user coming online
 */
export function registerUserOnlineHook(api: any, notificationService: NotificationService) {
  api.on(
    "user.online",
    async (event: any) => {
      try {
        const { userId } = event;

        if (!userId) return;

        // Deliver queued notifications when user comes online
        const count = await notificationService.deliverQueuedNotifications(userId);
        if (count > 0) {
          api.logger.info(`Delivered ${count} queued notifications to user ${userId}`);
        }
      } catch (error) {
        api.logger.error(`Error delivering queued notifications: ${error}`);
      }
    }
  );
}
