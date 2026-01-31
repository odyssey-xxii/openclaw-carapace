import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { sdkStreamMixin } from '@aws-sdk/util-stream-node';
import type { MemoryEntry, MemoryListResult } from './types.js';

export class MemoryStore {
  private s3Client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor(s3Client: S3Client, bucket: string = 'carapace-memory', prefix: string = 'users') {
    this.s3Client = s3Client;
    this.bucket = bucket;
    this.prefix = prefix;
  }

  private getKey(userId: string, memoryName: string): string {
    return `${this.prefix}/${userId}/memory/${memoryName}.json`;
  }

  private getUserPrefix(userId: string): string {
    return `${this.prefix}/${userId}/memory/`;
  }

  async set(userId: string, name: string, content: Record<string, unknown>): Promise<string> {
    const entry: MemoryEntry = {
      id: `${userId}:${name}`,
      userId,
      name,
      content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const key = this.getKey(userId, name);
    const body = JSON.stringify(entry);

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/json',
        Metadata: {
          'user-id': userId,
          'memory-name': name,
          'created-at': entry.createdAt.toString(),
        },
      })
    );

    return entry.id;
  }

  async get(userId: string, name: string): Promise<Record<string, unknown> | null> {
    try {
      const key = this.getKey(userId, name);
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      const stream = sdkStreamMixin(response.Body);
      const chunks: Buffer[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
      }

      const data = Buffer.concat(chunks).toString('utf-8');
      const entry: MemoryEntry = JSON.parse(data);
      return entry.content;
    } catch (error) {
      // Treat missing objects as null
      if ((error as { name?: string }).name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  async list(userId: string): Promise<MemoryListResult> {
    try {
      const prefix = this.getUserPrefix(userId);
      const response = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
        })
      );

      if (!response.Contents || response.Contents.length === 0) {
        return { items: [], count: 0 };
      }

      const items: MemoryEntry[] = [];

      for (const obj of response.Contents) {
        if (!obj.Key || obj.Key === prefix) continue;

        try {
          const getResponse = await this.s3Client.send(
            new GetObjectCommand({
              Bucket: this.bucket,
              Key: obj.Key,
            })
          );

          const stream = sdkStreamMixin(getResponse.Body);
          const chunks: Buffer[] = [];

          for await (const chunk of stream) {
            chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
          }

          const data = Buffer.concat(chunks).toString('utf-8');
          const entry: MemoryEntry = JSON.parse(data);
          items.push(entry);
        } catch (e) {
          // Skip items that can't be parsed
          console.warn(`Failed to parse memory item at ${obj.Key}:`, e);
        }
      }

      return { items, count: items.length };
    } catch (error) {
      // Treat missing bucket/prefix gracefully
      if ((error as { name?: string }).name === 'NoSuchBucket') {
        return { items: [], count: 0 };
      }
      throw error;
    }
  }

  async delete(userId: string, name: string): Promise<void> {
    const key = this.getKey(userId, name);
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }

  async deleteAll(userId: string): Promise<number> {
    try {
      const prefix = this.getUserPrefix(userId);
      const response = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
        })
      );

      if (!response.Contents || response.Contents.length === 0) {
        return 0;
      }

      let deletedCount = 0;
      for (const obj of response.Contents) {
        if (obj.Key && obj.Key !== prefix) {
          await this.s3Client.send(
            new DeleteObjectCommand({
              Bucket: this.bucket,
              Key: obj.Key,
            })
          );
          deletedCount++;
        }
      }

      return deletedCount;
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchBucket') {
        return 0;
      }
      throw error;
    }
  }
}
