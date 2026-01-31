import { S3Client } from './s3-client.js';
import { UserSettings, SubscriptionTier, ChannelSetting } from './types.js';

export class SettingsManager {
  private s3Client: S3Client;
  private trialDurationDays = 30;

  constructor(s3Client: S3Client) {
    this.s3Client = s3Client;
  }

  public async getSettings(userId: string): Promise<UserSettings | null> {
    const key = this.getSettingsKey(userId);
    return this.s3Client.getObjectAsJson<UserSettings>(key);
  }

  public async createSettings(userId: string, tier: SubscriptionTier = 'free'): Promise<UserSettings> {
    const settings: UserSettings = {
      userId,
      subscription: {
        tier,
        features: this.getDefaultFeatures(tier),
      },
      preferences: {},
      channelSettings: {},
      updatedAt: new Date(),
    };

    if (tier === 'free-trial') {
      settings.subscription.trialStartDate = new Date();
      settings.subscription.trialExpiryDate = new Date(Date.now() + this.trialDurationDays * 24 * 60 * 60 * 1000);
    }

    await this.saveSettings(userId, settings);
    return settings;
  }

  public async saveSettings(userId: string, settings: UserSettings): Promise<void> {
    settings.updatedAt = new Date();
    const key = this.getSettingsKey(userId);
    await this.s3Client.putObjectJson(key, settings);
  }

  public async upgradeSubscription(userId: string, tier: SubscriptionTier): Promise<UserSettings> {
    let settings = await this.getSettings(userId);
    if (!settings) {
      settings = await this.createSettings(userId, tier);
    } else {
      settings.subscription.tier = tier;
      settings.subscription.features = this.getDefaultFeatures(tier);
      settings.subscription.paidPlanStartDate = new Date();
      // Clear trial dates if upgrading from trial
      settings.subscription.trialStartDate = undefined;
      settings.subscription.trialExpiryDate = undefined;
      await this.saveSettings(userId, settings);
    }
    return settings;
  }

  public async getSubscriptionTier(userId: string): Promise<SubscriptionTier> {
    const settings = await this.getSettings(userId);
    if (!settings) {
      return 'free';
    }
    return settings.subscription.tier;
  }

  public async isTrialActive(userId: string): Promise<boolean> {
    const settings = await this.getSettings(userId);
    if (!settings || settings.subscription.tier !== 'free-trial') {
      return false;
    }

    const expiryDate = settings.subscription.trialExpiryDate;
    if (!expiryDate) {
      return false;
    }

    return new Date() < new Date(expiryDate);
  }

  public async canAccessFeature(userId: string, feature: string): Promise<boolean> {
    const settings = await this.getSettings(userId);
    if (!settings) {
      return false;
    }

    const { tier, features } = settings.subscription;

    // Check if user has active trial or paid plan
    if (tier === 'free-trial') {
      const isActive = await this.isTrialActive(userId);
      if (!isActive) {
        return false;
      }
    } else if (tier === 'free') {
      // Free tier has limited features
      return this.getDefaultFeatures('free').includes(feature);
    }

    return features.includes(feature);
  }

  public async setChannelSetting(userId: string, channelId: string, setting: Partial<ChannelSetting>): Promise<void> {
    let settings = await this.getSettings(userId);
    if (!settings) {
      settings = await this.createSettings(userId);
    }

    settings.channelSettings[channelId] = {
      ...(settings.channelSettings[channelId] || { channelId, enabled: true }),
      ...setting,
      channelId,
    };

    await this.saveSettings(userId, settings);
  }

  public async getChannelSetting(userId: string, channelId: string): Promise<ChannelSetting | null> {
    const settings = await this.getSettings(userId);
    if (!settings || !settings.channelSettings[channelId]) {
      return null;
    }
    return settings.channelSettings[channelId];
  }

  public async setPreference(userId: string, key: string, value: unknown): Promise<void> {
    let settings = await this.getSettings(userId);
    if (!settings) {
      settings = await this.createSettings(userId);
    }

    settings.preferences[key] = value;
    await this.saveSettings(userId, settings);
  }

  public async getPreference(userId: string, key: string): Promise<unknown | null> {
    const settings = await this.getSettings(userId);
    if (!settings) {
      return null;
    }
    return settings.preferences[key] ?? null;
  }

  public async setGroupPolicy(
    userId: string,
    allowedChannels: string[],
    maxChannels: number,
    dataRetentionDays: number,
  ): Promise<void> {
    let settings = await this.getSettings(userId);
    if (!settings) {
      settings = await this.createSettings(userId);
    }

    settings.groupPolicy = {
      allowedChannels,
      maxChannels,
      dataRetentionDays,
    };

    await this.saveSettings(userId, settings);
  }

  public async isChannelAllowed(userId: string, channelId: string): Promise<boolean> {
    const settings = await this.getSettings(userId);
    if (!settings?.groupPolicy) {
      return true;
    }

    return settings.groupPolicy.allowedChannels.includes(channelId);
  }

  public async getDataRetentionDays(userId: string): Promise<number> {
    const settings = await this.getSettings(userId);
    const defaultRetention = 90;

    if (!settings?.groupPolicy) {
      return defaultRetention;
    }

    return settings.groupPolicy.dataRetentionDays;
  }

  private getDefaultFeatures(tier: SubscriptionTier): string[] {
    const features: Record<SubscriptionTier, string[]> = {
      free: ['basic_analytics', 'limited_integrations'],
      'free-trial': ['full_analytics', 'all_integrations', 'priority_support'],
      pro: ['full_analytics', 'all_integrations', 'priority_support', 'team_collaboration'],
      enterprise: [
        'full_analytics',
        'all_integrations',
        'priority_support',
        'team_collaboration',
        'sso',
        'custom_branding',
        'api_access',
      ],
    };
    return features[tier];
  }

  private getSettingsKey(userId: string): string {
    return `users/${userId}/settings.json`;
  }
}
