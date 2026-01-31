import { ChannelBridge, ChannelCredentials, ChannelStatus, StorageAdapter, EncryptionAdapter, ChannelException } from './types.js';

export class DiscordBridge implements ChannelBridge {
  private storage: StorageAdapter;
  private encryption: EncryptionAdapter;

  constructor(storage: StorageAdapter, encryption: EncryptionAdapter) {
    this.storage = storage;
    this.encryption = encryption;
  }

  async connect(userId: string, credentials: ChannelCredentials): Promise<ChannelStatus> {
    if (!credentials.oauthToken) {
      throw new ChannelException('OAuth token is required', 'INVALID_CREDENTIALS', 400, { channel: 'discord' });
    }

    const oauthToken = credentials.oauthToken.trim();

    const userInfo = await this._validateToken(oauthToken);
    if (!userInfo) {
      throw new ChannelException('Invalid or expired Discord token', 'INVALID_TOKEN', 401, { channel: 'discord' });
    }

    const storageKey = this._getStorageKey(userId, 'token');
    const encryptedToken = await this.encryption.encrypt(oauthToken);

    await this.storage.set(storageKey, encryptedToken);

    const statusKey = this._getStorageKey(userId, 'status');
    await this.storage.set(statusKey, JSON.stringify({
      connected: true,
      lastConnected: new Date().toISOString(),
      metadata: {
        discordUserId: userInfo.id,
        username: userInfo.username,
      },
    }));

    return {
      connected: true,
      lastConnected: new Date(),
      metadata: {
        channel: 'discord',
        discordUserId: userInfo.id,
        username: userInfo.username,
      },
    };
  }

  async disconnect(userId: string): Promise<void> {
    const tokenKey = this._getStorageKey(userId, 'token');
    const statusKey = this._getStorageKey(userId, 'status');

    await this.storage.delete(tokenKey);
    await this.storage.delete(statusKey);
  }

  async status(userId: string): Promise<ChannelStatus> {
    const statusKey = this._getStorageKey(userId, 'status');
    const statusData = await this.storage.get(statusKey);

    if (!statusData) {
      return {
        connected: false,
      };
    }

    try {
      const parsed = JSON.parse(statusData);
      return {
        connected: parsed.connected || false,
        lastConnected: parsed.lastConnected ? new Date(parsed.lastConnected) : undefined,
        metadata: parsed.metadata,
      };
    } catch {
      return {
        connected: false,
        error: 'Failed to parse status',
      };
    }
  }

  private _getStorageKey(userId: string, suffix: string): string {
    return `discord:${userId}:${suffix}`;
  }

  private async _validateToken(token: string): Promise<{ id: string; username: string } | null> {
    try {
      const response = await fetch('https://discordapp.com/api/users/@me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as { id?: string; username?: string };
      return data.id && data.username ? { id: data.id, username: data.username } : null;
    } catch {
      return null;
    }
  }
}
