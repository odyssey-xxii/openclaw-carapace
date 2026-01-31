export type SubscriptionTier = 'free-trial' | 'free' | 'pro' | 'enterprise';

export interface UserSettings {
  userId: string;
  subscription: {
    tier: SubscriptionTier;
    trialStartDate?: Date;
    trialExpiryDate?: Date;
    paidPlanStartDate?: Date;
    features: string[];
  };
  groupPolicy?: {
    allowedChannels: string[];
    maxChannels: number;
    dataRetentionDays: number;
  };
  preferences: Record<string, unknown>;
  channelSettings: Record<string, ChannelSetting>;
  updatedAt: Date;
}

export interface ChannelSetting {
  channelId: string;
  encryptedToken?: string;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

export interface UserProfile {
  userId: string;
  email: string;
  displayName?: string;
  avatar?: string;
  platformAccounts: PlatformAccount[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface PlatformAccount {
  platformId: string;
  platformUserId: string;
  username?: string;
  email?: string;
  linkedAt: Date;
  verified: boolean;
  metadata?: Record<string, unknown>;
}

export interface S3ClientConfig {
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface EncryptionConfig {
  encryptionKey?: string;
  algorithm: string;
}

export interface CarapaceConfig {
  s3: S3ClientConfig;
  encryption?: EncryptionConfig;
}
