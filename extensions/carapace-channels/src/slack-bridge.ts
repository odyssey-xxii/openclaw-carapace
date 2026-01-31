import { ChannelBridge, ChannelCredentials, ChannelStatus, StorageAdapter, EncryptionAdapter, ChannelException } from './types.js';

export class SlackBridge implements ChannelBridge {
  private storage: StorageAdapter;
  private encryption: EncryptionAdapter;

  constructor(storage: StorageAdapter, encryption: EncryptionAdapter) {
    this.storage = storage;
    this.encryption = encryption;
  }

  async connect(userId: string, credentials: ChannelCredentials): Promise<ChannelStatus> {
    if (!credentials.oauthToken) {
      throw new ChannelException('OAuth token is required', 'INVALID_CREDENTIALS', 400, { channel: 'slack' });
    }

    const oauthToken = credentials.oauthToken.trim();

    const workspaceInfo = await this._validateToken(oauthToken);
    if (!workspaceInfo) {
      throw new ChannelException('Invalid or expired Slack token', 'INVALID_TOKEN', 401, { channel: 'slack' });
    }

    const storageKey = this._getStorageKey(userId, 'token');
    const encryptedToken = await this.encryption.encrypt(oauthToken);

    await this.storage.set(storageKey, encryptedToken);

    const statusKey = this._getStorageKey(userId, 'status');
    await this.storage.set(statusKey, JSON.stringify({
      connected: true,
      lastConnected: new Date().toISOString(),
      metadata: {
        teamId: workspaceInfo.teamId,
        teamName: workspaceInfo.teamName,
        userId: workspaceInfo.userId,
      },
    }));

    return {
      connected: true,
      lastConnected: new Date(),
      metadata: {
        channel: 'slack',
        teamId: workspaceInfo.teamId,
        teamName: workspaceInfo.teamName,
        userId: workspaceInfo.userId,
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
    return `slack:${userId}:${suffix}`;
  }

  private async _validateToken(
    token: string,
  ): Promise<{ teamId: string; teamName: string; userId: string } | null> {
    try {
      const response = await fetch('https://slack.com/api/auth.test', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as {
        ok?: boolean;
        team_id?: string;
        team?: string;
        user_id?: string;
      };

      if (!data.ok || !data.team_id || !data.user_id) {
        return null;
      }

      return {
        teamId: data.team_id,
        teamName: data.team || 'Unknown',
        userId: data.user_id,
      };
    } catch {
      return null;
    }
  }
}
