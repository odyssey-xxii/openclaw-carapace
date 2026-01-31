export interface ChannelCredentials {
  token?: string;
  botToken?: string;
  oauthToken?: string;
  userId?: string;
  workspaceId?: string;
  teamId?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  [key: string]: string | undefined;
}

export interface ChannelStatus {
  connected: boolean;
  lastConnected?: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface QRSession {
  sessionId: string;
  qrCode: string;
  expiresAt: Date;
  status: 'pending' | 'scanned' | 'connected' | 'expired';
}

export interface ChannelBridge {
  connect(userId: string, credentials: ChannelCredentials): Promise<ChannelStatus>;
  disconnect(userId: string): Promise<void>;
  status(userId: string): Promise<ChannelStatus>;
}

export interface WhatsAppBridge extends ChannelBridge {
  qrStart(userId: string): Promise<QRSession>;
  qrWait(sessionId: string, timeoutMs?: number): Promise<boolean>;
}

export interface GatewayContext {
  userId: string;
  storage: StorageAdapter;
  encryption: EncryptionAdapter;
}

export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export interface EncryptionAdapter {
  encrypt(data: string): Promise<string>;
  decrypt(data: string): Promise<string>;
}

export interface ChannelError extends Error {
  code: string;
  statusCode?: number;
  context?: Record<string, unknown>;
}

export class ChannelException extends Error implements ChannelError {
  code: string;
  statusCode?: number;
  context?: Record<string, unknown>;

  constructor(message: string, code: string, statusCode?: number, context?: Record<string, unknown>) {
    super(message);
    this.name = 'ChannelException';
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
  }
}
