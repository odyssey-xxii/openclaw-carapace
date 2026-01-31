import { NotificationService } from "./src/notification-service.js";
import { PreferencesManager } from "./src/preferences.js";
import { NotificationQueue } from "./src/queue.js";
import {
  registerSecurityHook,
  registerCronHook,
  registerSystemAlertHook,
  registerUserOnlineHook,
} from "./src/hooks.js";
import type { NotificationType, Notification } from "./src/types.js";

let notificationService: NotificationService | null = null;
let preferencesManager: PreferencesManager | null = null;
let notificationQueue: NotificationQueue | null = null;

/**
 * Initialize the notification extension
 */
function initializeNotificationExtension(api: any, context: any): void {
  if (notificationService) return; // Already initialized

  notificationService = new NotificationService(
    {
      storage: context.storage,
      gateway: context.gateway,
    },
    api.logger
  );

  preferencesManager = new PreferencesManager({
    storage: context.storage,
    gateway: context.gateway,
  });

  notificationQueue = new NotificationQueue(
    {
      storage: context.storage,
      gateway: context.gateway,
    },
    100, // maxQueueSize
    7 // retentionDays
  );

  // Register event hooks
  registerSecurityHook(api, notificationService);
  registerCronHook(api, notificationService);
  registerSystemAlertHook(api, notificationService);
  registerUserOnlineHook(api, notificationService);
}

const plugin = {
  id: "carapace-notifications",
  name: "Carapace Notifications",
  description: "User notification system with multi-channel delivery, quiet hours, and offline queuing",
  configSchema: {
    type: "object",
    properties: {},
  },

  register(api: any) {
    // Initialize the extension
    const context = {
      storage: (api as any).storage,
      gateway: (api as any).gateway,
    };
    initializeNotificationExtension(api, context);

    if (!notificationService || !preferencesManager || !notificationQueue) {
      throw new Error("Failed to initialize notification extension");
    }

    const svc = notificationService;
    const prefs = preferencesManager;
    const queue = notificationQueue;

    // Gateway method: Send notification
    api.registerGatewayMethod("carapace.notifications.send", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const { userId, title, message, type = "system_alert", severity = "medium", channelId } = params;

        if (!userId || !title || !message) {
          respond(false, undefined, {
            code: "invalid_params",
            message: "userId, title, and message required",
          });
          return;
        }

        const notification: Notification = {
          userId,
          channelId,
          type: type as NotificationType,
          severity: severity as any,
          title,
          message,
        };

        const results = await svc.sendNotification(notification);
        respond(true, { results });
      } catch (error) {
        api.logger.error(`Error sending notification: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Get preferences
    api.registerGatewayMethod("carapace.notifications.preferences.get", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const { userId } = params;

        if (!userId) {
          respond(false, undefined, {
            code: "invalid_params",
            message: "userId required",
          });
          return;
        }

        const preferences = await prefs.getPreferences(userId);
        respond(true, preferences);
      } catch (error) {
        api.logger.error(`Error getting preferences: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Set preferences
    api.registerGatewayMethod("carapace.notifications.preferences.set", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const { userId, enabledChannels, quietHoursEnabled, quietHoursStart, quietHoursEnd, timezone } = params;

        if (!userId) {
          respond(false, undefined, {
            code: "invalid_params",
            message: "userId required",
          });
          return;
        }

        const updates: any = {};
        if (enabledChannels !== undefined) updates.enabledChannels = enabledChannels;
        if (quietHoursEnabled !== undefined) updates.quietHoursEnabled = quietHoursEnabled;
        if (quietHoursStart !== undefined) updates.quietHoursStart = quietHoursStart;
        if (quietHoursEnd !== undefined) updates.quietHoursEnd = quietHoursEnd;
        if (timezone !== undefined) updates.timezone = timezone;

        const updated = await prefs.updatePreferences(userId, updates);
        respond(true, updated);
      } catch (error) {
        api.logger.error(`Error updating preferences: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: List queued notifications
    api.registerGatewayMethod("carapace.notifications.queue.list", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const { userId } = params;

        if (!userId) {
          respond(false, undefined, {
            code: "invalid_params",
            message: "userId required",
          });
          return;
        }

        const notifications = await queue.getQueuedNotifications(userId);
        const stats = await queue.getQueueStats(userId);

        respond(true, {
          notifications,
          stats,
        });
      } catch (error) {
        api.logger.error(`Error listing queued notifications: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Clear queued notifications
    api.registerGatewayMethod("carapace.notifications.queue.clear", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const { userId } = params;

        if (!userId) {
          respond(false, undefined, {
            code: "invalid_params",
            message: "userId required",
          });
          return;
        }

        const clearedCount = await queue.clearUserQueue(userId);
        respond(true, { clearedCount });
      } catch (error) {
        api.logger.error(`Error clearing queued notifications: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Deliver queued notifications (called when user comes online)
    api.registerGatewayMethod("carapace.notifications.queue.deliver", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const { userId } = params;

        if (!userId) {
          respond(false, undefined, {
            code: "invalid_params",
            message: "userId required",
          });
          return;
        }

        const deliveredCount = await svc.deliverQueuedNotifications(userId);
        respond(true, { deliveredCount });
      } catch (error) {
        api.logger.error(`Error delivering queued notifications: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Enable channel
    api.registerGatewayMethod("carapace.notifications.channels.enable", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const { userId, channel } = params;

        if (!userId || !channel) {
          respond(false, undefined, {
            code: "invalid_params",
            message: "userId and channel required",
          });
          return;
        }

        await prefs.enableChannel(userId, channel);
        const updated = await prefs.getPreferences(userId);
        respond(true, updated);
      } catch (error) {
        api.logger.error(`Error enabling channel: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Gateway method: Disable channel
    api.registerGatewayMethod("carapace.notifications.channels.disable", async (opts: any) => {
      try {
        const { params, respond } = opts;
        const { userId, channel } = params;

        if (!userId || !channel) {
          respond(false, undefined, {
            code: "invalid_params",
            message: "userId and channel required",
          });
          return;
        }

        await prefs.disableChannel(userId, channel);
        const updated = await prefs.getPreferences(userId);
        respond(true, updated);
      } catch (error) {
        api.logger.error(`Error disabling channel: ${error}`);
        opts.respond(false, undefined, {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    api.logger.info("Carapace Notifications plugin initialized");

    return {
      status: "initialized",
      services: {
        notificationService: svc,
        preferencesManager: prefs,
        notificationQueue: queue,
      },
    };
  },
};

export default plugin;
export { NotificationService, PreferencesManager, NotificationQueue };
export type { Notification, NotificationPreferences, QueuedNotification } from "./src/types.js";
