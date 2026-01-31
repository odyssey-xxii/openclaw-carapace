import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto';
import { S3Client } from './s3-client.js';

export class ChannelCredentialsManager {
  private s3Client: S3Client;
  private encryptionKey: Buffer;
  private algorithm: string = 'aes-256-cbc';

  constructor(s3Client: S3Client, encryptionKeyBase64?: string, algorithm?: string) {
    this.s3Client = s3Client;
    if (algorithm) {
      this.algorithm = algorithm;
    }

    if (encryptionKeyBase64) {
      this.encryptionKey = Buffer.from(encryptionKeyBase64, 'base64');
      if (this.encryptionKey.length !== 32) {
        throw new Error('Encryption key must be 256 bits (32 bytes)');
      }
    } else {
      // Generate a default key for development/testing using PBKDF2
      this.encryptionKey = pbkdf2Sync('default-carapace-key', 'salt', 100000, 32, 'sha256');
    }
  }

  public async storeChannelToken(userId: string, channelId: string, token: string): Promise<string> {
    const encrypted = this.encryptToken(token);
    const key = this.getChannelTokenKey(userId, channelId);
    const parts = encrypted.split(':');
    await this.s3Client.putObjectJson(key, {
      encrypted: Buffer.from(encrypted).toString('base64'),
      iv: parts[1],
      timestamp: new Date().toISOString(),
    });
    return encrypted;
  }

  public async getChannelToken(userId: string, channelId: string): Promise<string | null> {
    const key = this.getChannelTokenKey(userId, channelId);
    const data = await this.s3Client.getObjectAsJson<{
      encrypted: string;
      iv: string;
      timestamp: string;
    }>(key);

    if (!data) {
      return null;
    }

    try {
      const encrypted = Buffer.from(data.encrypted, 'base64');
      return this.decryptToken(encrypted);
    } catch (error) {
      throw new Error(`Failed to decrypt channel token: ${String(error)}`);
    }
  }

  public async deleteChannelToken(userId: string, channelId: string): Promise<void> {
    const key = this.getChannelTokenKey(userId, channelId);
    await this.s3Client.deleteObject(key);
  }

  public async revokeChannelToken(userId: string, channelId: string): Promise<void> {
    await this.deleteChannelToken(userId, channelId);
  }

  public async listChannelTokens(userId: string): Promise<string[]> {
    const prefix = `users/${userId}/credentials/`;
    const keys = await this.s3Client.listObjects(prefix);
    return keys.map((key) => key.split('/').pop() || '').filter(Boolean);
  }

  private encryptToken(token: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, this.encryptionKey, iv);
    let encrypted = cipher.update(token, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    // Return format: encrypted:iv
    return `${encrypted}:${iv.toString('hex')}`;
  }

  private decryptToken(encrypted: Buffer): string {
    // Extract IV and encrypted data
    const encryptedStr = encrypted.toString('utf-8');
    const parts = encryptedStr.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted token format');
    }

    const [encryptedData, ivHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');

    const decipher = createDecipheriv(this.algorithm, this.encryptionKey, iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
  }

  private getChannelTokenKey(userId: string, channelId: string): string {
    return `users/${userId}/credentials/${channelId}.json`;
  }
}
