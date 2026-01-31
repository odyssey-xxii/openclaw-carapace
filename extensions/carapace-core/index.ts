import { S3Client } from './src/s3-client.js';
import { UserDataService } from './src/user-data.js';
import { SettingsManager } from './src/settings-manager.js';
import { ChannelCredentialsManager } from './src/channel-credentials.js';
import { CarapaceConfig, UserProfile, UserSettings } from './src/types.js';

export { S3Client } from './src/s3-client.js';
export { UserDataService } from './src/user-data.js';
export { SettingsManager } from './src/settings-manager.js';
export { ChannelCredentialsManager } from './src/channel-credentials.js';
export type {
  UserSettings,
  UserProfile,
  PlatformAccount,
  ChannelSetting,
  SubscriptionTier,
  CarapaceConfig,
  S3ClientConfig,
  EncryptionConfig,
} from './src/types.js';

// Global service instances
let s3Client: S3Client | null = null;
let userDataService: UserDataService | null = null;
let settingsManager: SettingsManager | null = null;
let credentialsManager: ChannelCredentialsManager | null = null;

export interface CarapacePlugin {
  name: string;
  version: string;
  services: {
    s3Client: S3Client;
    userDataService: UserDataService;
    settingsManager: SettingsManager;
    credentialsManager: ChannelCredentialsManager;
  };
}

export function initializeCarapaceCore(config: CarapaceConfig): CarapacePlugin {
  // Initialize S3 client
  s3Client = S3Client.getInstance(config.s3);

  // Initialize services
  userDataService = new UserDataService(s3Client);
  settingsManager = new SettingsManager(s3Client);
  credentialsManager = new ChannelCredentialsManager(
    s3Client,
    config.encryption?.encryptionKey,
    config.encryption?.algorithm,
  );

  return {
    name: '@carapace/core',
    version: '1.0.0',
    services: {
      s3Client,
      userDataService,
      settingsManager,
      credentialsManager,
    },
  };
}

export function getS3Client(): S3Client {
  if (!s3Client) {
    throw new Error('CarapaceCore not initialized. Call initializeCarapaceCore first.');
  }
  return s3Client;
}

export function getUserDataService(): UserDataService {
  if (!userDataService) {
    throw new Error('CarapaceCore not initialized. Call initializeCarapaceCore first.');
  }
  return userDataService;
}

export function getSettingsManager(): SettingsManager {
  if (!settingsManager) {
    throw new Error('CarapaceCore not initialized. Call initializeCarapaceCore first.');
  }
  return settingsManager;
}

export function getCredentialsManager(): ChannelCredentialsManager {
  if (!credentialsManager) {
    throw new Error('CarapaceCore not initialized. Call initializeCarapaceCore first.');
  }
  return credentialsManager;
}

// OpenClaw plugin export
export default function createCarapaceCorePlugin() {
  return {
    name: 'carapace-core',
    version: '1.0.0',
    description: 'Core services for Carapace multi-tenant operation',

    async initialize(context: {
      config: CarapaceConfig;
      gateway: {
        addMethod: (name: string, handler: unknown) => void;
        shareService: (name: string, service: unknown) => void;
      };
    }) {
      // Initialize services
      const plugin = initializeCarapaceCore(context.config);

      // Register gateway methods
      context.gateway.addMethod('carapace.user.profile', async (userId: string, action: string, data?: unknown) => {
        const userService = getUserDataService();

        switch (action) {
          case 'get':
            return userService.getProfile(userId);

          case 'create':
            if (!data || typeof data !== 'object' || !('email' in data)) {
              throw new Error('Missing required field: email');
            }
            const { email, displayName } = data as { email: string; displayName?: string };
            return userService.createProfile(userId, email, displayName);

          case 'link-platform':
            if (!data || typeof data !== 'object' || !('platformId' in data) || !('platformUserId' in data)) {
              throw new Error('Missing required fields: platformId, platformUserId');
            }
            const { platformId, platformUserId, username, email: platformEmail } = data as {
              platformId: string;
              platformUserId: string;
              username?: string;
              email?: string;
            };
            return userService.linkPlatformUser(userId, platformId, platformUserId, username, platformEmail);

          case 'unlink-platform':
            if (!data || typeof data !== 'object' || !('platformId' in data)) {
              throw new Error('Missing required field: platformId');
            }
            return userService.unlinkPlatformUser(userId, (data as { platformId: string }).platformId);

          case 'find-by-platform':
            if (!data || typeof data !== 'object' || !('platformId' in data) || !('platformUserId' in data)) {
              throw new Error('Missing required fields: platformId, platformUserId');
            }
            const { platformId: pid, platformUserId: puid } = data as {
              platformId: string;
              platformUserId: string;
            };
            return userService.findUserByPlatformId(pid, puid);

          default:
            throw new Error(`Unknown profile action: ${action}`);
        }
      });

      context.gateway.addMethod('carapace.user.settings', async (userId: string, action: string, data?: unknown) => {
        const settings = getSettingsManager();

        switch (action) {
          case 'get':
            return settings.getSettings(userId);

          case 'create':
            const tier = (data as { tier?: string } | undefined)?.tier || 'free';
            return settings.createSettings(userId, tier as any);

          case 'upgrade':
            if (!data || typeof data !== 'object' || !('tier' in data)) {
              throw new Error('Missing required field: tier');
            }
            return settings.upgradeSubscription(userId, (data as { tier: string }).tier as any);

          case 'get-tier':
            return settings.getSubscriptionTier(userId);

          case 'is-trial-active':
            return settings.isTrialActive(userId);

          case 'can-access-feature':
            if (!data || typeof data !== 'object' || !('feature' in data)) {
              throw new Error('Missing required field: feature');
            }
            return settings.canAccessFeature(userId, (data as { feature: string }).feature);

          case 'set-channel-setting':
            if (!data || typeof data !== 'object' || !('channelId' in data)) {
              throw new Error('Missing required field: channelId');
            }
            const { channelId, ...setting } = data as { channelId: string; [key: string]: unknown };
            await settings.setChannelSetting(userId, channelId, setting as any);
            return { success: true };

          case 'get-channel-setting':
            if (!data || typeof data !== 'object' || !('channelId' in data)) {
              throw new Error('Missing required field: channelId');
            }
            return settings.getChannelSetting(userId, (data as { channelId: string }).channelId);

          default:
            throw new Error(`Unknown settings action: ${action}`);
        }
      });

      // Share services with other extensions
      context.gateway.shareService('carapace.s3', plugin.services.s3Client);
      context.gateway.shareService('carapace.user-data', plugin.services.userDataService);
      context.gateway.shareService('carapace.settings', plugin.services.settingsManager);
      context.gateway.shareService('carapace.credentials', plugin.services.credentialsManager);

      return {
        status: 'initialized',
        services: plugin.services,
      };
    },
  };
}
