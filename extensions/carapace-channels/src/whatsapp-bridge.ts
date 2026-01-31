import { WhatsAppBridge, ChannelCredentials, ChannelStatus, QRSession, StorageAdapter, EncryptionAdapter, ChannelException } from './types.js';

export class WhatsAppBridgeImpl implements WhatsAppBridge {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter, _encryption: EncryptionAdapter) {
    this.storage = storage;
  }

  async connect(userId: string, credentials: ChannelCredentials): Promise<ChannelStatus> {
    if (!credentials.clientId || !credentials.clientSecret) {
      throw new ChannelException('Client ID and Secret are required', 'INVALID_CREDENTIALS', 400, {
        channel: 'whatsapp',
      });
    }

    const sessionKey = this._getStorageKey(userId, 'session');
    const sessionData = await this.storage.get(sessionKey);

    if (!sessionData) {
      throw new ChannelException('No active WhatsApp session', 'NO_SESSION', 400, { channel: 'whatsapp' });
    }

    try {
      const session = JSON.parse(sessionData);
      return {
        connected: session.connected || false,
        lastConnected: session.lastConnected ? new Date(session.lastConnected) : undefined,
        metadata: {
          channel: 'whatsapp',
          phoneNumber: session.phoneNumber,
        },
      };
    } catch {
      throw new ChannelException('Failed to parse session', 'SESSION_ERROR', 500, { channel: 'whatsapp' });
    }
  }

  async disconnect(userId: string): Promise<void> {
    const sessionKey = this._getStorageKey(userId, 'session');
    const qrKey = this._getStorageKey(userId, 'qr');

    await this.storage.delete(sessionKey);
    await this.storage.delete(qrKey);
  }

  async status(userId: string): Promise<ChannelStatus> {
    const sessionKey = this._getStorageKey(userId, 'session');
    const sessionData = await this.storage.get(sessionKey);

    if (!sessionData) {
      return {
        connected: false,
      };
    }

    try {
      const session = JSON.parse(sessionData);
      return {
        connected: session.connected || false,
        lastConnected: session.lastConnected ? new Date(session.lastConnected) : undefined,
        metadata: {
          phoneNumber: session.phoneNumber,
        },
      };
    } catch {
      return {
        connected: false,
        error: 'Failed to parse session',
      };
    }
  }

  async qrStart(userId: string): Promise<QRSession> {
    const sessionId = this._generateSessionId();
    const qrCode = await this._generateQRCode(userId, sessionId);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    const qrSession: QRSession = {
      sessionId,
      qrCode,
      expiresAt,
      status: 'pending',
    };

    const qrKey = this._getStorageKey(userId, 'qr');
    await this.storage.set(qrKey, JSON.stringify(qrSession), 300);

    return qrSession;
  }

  async qrWait(sessionId: string, timeoutMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 1000;

    while (Date.now() - startTime < timeoutMs) {
      const qrKey = `whatsapp:${sessionId}:session`;
      const sessionData = await this.storage.get(qrKey);

      if (sessionData) {
        try {
          const session = JSON.parse(sessionData);
          if (session.connected) {
            return true;
          }
        } catch {
          // Continue polling
        }
      }

      await this._delay(pollInterval);
    }

    return false;
  }

  private _getStorageKey(userId: string, suffix: string): string {
    return `whatsapp:${userId}:${suffix}`;
  }

  private _generateSessionId(): string {
    return 'qr_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  private async _generateQRCode(userId: string, sessionId: string): Promise<string> {
    const payload = JSON.stringify({
      sessionId,
      userId,
      timestamp: Date.now(),
    });

    const encoded = Buffer.from(payload).toString('base64');
    return `data:image/svg+xml;base64,${Buffer.from(this._generateQRSVG(encoded)).toString('base64')}`;
  }

  private _generateQRSVG(data: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect width="100" height="100" fill="white"/>
      <text x="50" y="50" text-anchor="middle" dy="0.3em" font-size="8">QR: ${data.substring(0, 20)}</text>
    </svg>`;
  }

  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
