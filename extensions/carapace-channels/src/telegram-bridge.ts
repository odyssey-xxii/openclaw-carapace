import { ChannelBridge, ChannelCredentials, ChannelStatus, StorageAdapter, EncryptionAdapter, ChannelException } from './types.js';

export class TelegramBridge implements ChannelBridge {
  private storage: StorageAdapter;
  private encryption: EncryptionAdapter;

  constructor(storage: StorageAdapter, encryption: EncryptionAdapter) {
    this.storage = storage;
    this.encryption = encryption;
  }

  async connect(userId: string, credentials: ChannelCredentials): Promise<ChannelStatus> {
    if (!credentials.botToken) {
      throw new ChannelException('Bot token is required', 'INVALID_CREDENTIALS', 400, { channel: 'telegram' });
    }

    const botToken = credentials.botToken.trim();

    if (!this._isValidBotToken(botToken)) {
      throw new ChannelException('Invalid bot token format', 'INVALID_BOT_TOKEN', 400, { channel: 'telegram' });
    }

    const storageKey = this._getStorageKey(userId, 'token');
    const encryptedToken = await this.encryption.encrypt(botToken);

    await this.storage.set(storageKey, encryptedToken);

    const statusKey = this._getStorageKey(userId, 'status');
    await this.storage.set(statusKey, JSON.stringify({
      connected: true,
      lastConnected: new Date().toISOString(),
    }));

    return {
      connected: true,
      lastConnected: new Date(),
      metadata: {
        channel: 'telegram',
        botUsername: await this._extractBotUsername(botToken),
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
    return `telegram:${userId}:${suffix}`;
  }

  private _isValidBotToken(token: string): boolean {
    return /^\d+:[A-Za-z0-9_-]{27,}$/.test(token);
  }

  private async _extractBotUsername(botToken: string): Promise<string | null> {
    try {
      const response = await fetch('https://api.telegram.org/bot' + botToken + '/getMe');
      if (!response.ok) {
        return null;
      }
      const data = await response.json() as { ok: boolean; result?: { username?: string } };
      return data.ok && data.result?.username ? data.result.username : null;
    } catch {
      return null;
    }
  }
}
