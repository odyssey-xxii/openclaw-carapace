import { v4 as uuidv4 } from "uuid";
import type {
  NotificationPreferences,
  NotificationChannel,
  NotificationType,
  GatewayContext,
} from "./types.js";

const PREFERENCES_PREFIX = "notifications:prefs:";

/**
 * Manages user notification preferences with S3 storage
 */
export class PreferencesManager {
  private context: GatewayContext;

  constructor(context: GatewayContext) {
    this.context = context;
  }

  /**
   * Get user preferences, with defaults if not found
   */
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const stored = await this.context.storage.get(`${PREFERENCES_PREFIX}${userId}`);

    if (!stored) {
      return this.getDefaultPreferences(userId);
    }

    try {
      const parsed = JSON.parse(stored);
      return {
        ...parsed,
        createdAt: new Date(parsed.createdAt),
        updatedAt: new Date(parsed.updatedAt),
      };
    } catch {
      return this.getDefaultPreferences(userId);
    }
  }

  /**
   * Save user preferences
   */
  async savePreferences(prefs: NotificationPreferences): Promise<void> {
    prefs.updatedAt = new Date();
    const serialized = {
      ...prefs,
      createdAt: prefs.createdAt.toISOString(),
      updatedAt: prefs.updatedAt.toISOString(),
    };
    await this.context.storage.set(`${PREFERENCES_PREFIX}${prefs.userId}`, JSON.stringify(serialized));
  }

  /**
   * Update specific preference fields
   */
  async updatePreferences(
    userId: string,
    updates: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    const current = await this.getPreferences(userId);
    const updated: NotificationPreferences = {
      ...current,
      ...updates,
      userId: current.userId, // Don't allow changing user ID
      createdAt: current.createdAt, // Don't allow changing creation date
      updatedAt: new Date(),
    };

    await this.savePreferences(updated);
    return updated;
  }

  /**
   * Enable a notification channel for the user
   */
  async enableChannel(userId: string, channel: NotificationChannel): Promise<void> {
    const prefs = await this.getPreferences(userId);
    if (!prefs.enabledChannels.includes(channel)) {
      prefs.enabledChannels.push(channel);
      await this.savePreferences(prefs);
    }
  }

  /**
   * Disable a notification channel for the user
   */
  async disableChannel(userId: string, channel: NotificationChannel): Promise<void> {
    const prefs = await this.getPreferences(userId);
    prefs.enabledChannels = prefs.enabledChannels.filter(ch => ch !== channel);
    await this.savePreferences(prefs);
  }

  /**
   * Enable a notification type
   */
  async enableNotificationType(userId: string, type: NotificationType): Promise<void> {
    const prefs = await this.getPreferences(userId);
    prefs.notificationTypes[type] = true;
    await this.savePreferences(prefs);
  }

  /**
   * Disable a notification type
   */
  async disableNotificationType(userId: string, type: NotificationType): Promise<void> {
    const prefs = await this.getPreferences(userId);
    prefs.notificationTypes[type] = false;
    await this.savePreferences(prefs);
  }

  /**
   * Set quiet hours
   */
  async setQuietHours(
    userId: string,
    enabled: boolean,
    startTime?: string,
    endTime?: string
  ): Promise<void> {
    const prefs = await this.getPreferences(userId);
    prefs.quietHoursEnabled = enabled;
    if (startTime) prefs.quietHoursStart = startTime;
    if (endTime) prefs.quietHoursEnd = endTime;
    await this.savePreferences(prefs);
  }

  /**
   * Check if user is in quiet hours
   */
  async isInQuietHours(userId: string): Promise<boolean> {
    const prefs = await this.getPreferences(userId);

    if (!prefs.quietHoursEnabled || !prefs.quietHoursStart || !prefs.quietHoursEnd) {
      return false;
    }

    // Get current time in user's timezone
    const now = new Date();
    const timeStr = now.toLocaleString("en-US", {
      hour12: false,
      timeZone: prefs.timezone,
      hour: "2-digit",
      minute: "2-digit",
    });

    const [currentHour, currentMinute] = timeStr.split(":").map(Number);
    const currentTime = currentHour * 60 + currentMinute;

    const [startHour, startMinute] = prefs.quietHoursStart.split(":").map(Number);
    const startTime = startHour * 60 + startMinute;

    const [endHour, endMinute] = prefs.quietHoursEnd.split(":").map(Number);
    const endTime = endHour * 60 + endMinute;

    // Handle case where quiet hours span midnight
    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime < endTime;
    }
    return currentTime >= startTime || currentTime < endTime;
  }

  /**
   * Delete user preferences
   */
  async deletePreferences(userId: string): Promise<void> {
    await this.context.storage.delete(`${PREFERENCES_PREFIX}${userId}`);
  }

  /**
   * Get default preferences for a user
   */
  private getDefaultPreferences(userId: string): NotificationPreferences {
    return {
      userId,
      enabledChannels: ["discord"],
      quietHoursEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
      timezone: "UTC",
      notificationTypes: {
        command_blocked: true,
        approval_required: true,
        task_complete: true,
        system_alert: true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
