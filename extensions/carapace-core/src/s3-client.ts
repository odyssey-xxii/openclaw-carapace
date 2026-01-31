import {
  S3Client as AwsS3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { S3ClientConfig } from './types.js';

export class S3Client {
  private static instance: S3Client;
  private client: AwsS3Client;
  private bucket: string;

  private constructor(config: S3ClientConfig) {
    this.bucket = config.bucket;
    this.client = new AwsS3Client({
      region: config.region,
      ...(config.accessKeyId && config.secretAccessKey && {
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      }),
    });
  }

  public static getInstance(config?: S3ClientConfig): S3Client {
    if (!S3Client.instance && !config) {
      throw new Error('S3Client must be initialized with config on first call');
    }
    if (!S3Client.instance && config) {
      S3Client.instance = new S3Client(config);
    }
    return S3Client.instance;
  }

  public async getObject(key: string): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      const response = await this.client.send(command);
      const body = await response.Body?.transformToString();
      if (!body) {
        throw new Error('Empty response from S3');
      }
      return body;
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey') {
        return '';
      }
      throw new Error(`Failed to get object ${key}: ${String(error)}`);
    }
  }

  public async getObjectAsJson<T>(key: string): Promise<T | null> {
    const body = await this.getObject(key);
    if (!body) {
      return null;
    }
    try {
      return JSON.parse(body) as T;
    } catch (error) {
      throw new Error(`Failed to parse JSON from ${key}: ${String(error)}`);
    }
  }

  public async putObject(key: string, body: string): Promise<void> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/json',
      });
      await this.client.send(command);
    } catch (error) {
      throw new Error(`Failed to put object ${key}: ${String(error)}`);
    }
  }

  public async putObjectJson(key: string, data: unknown): Promise<void> {
    const body = JSON.stringify(data);
    await this.putObject(key, body);
  }

  public async deleteObject(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.client.send(command);
    } catch (error) {
      throw new Error(`Failed to delete object ${key}: ${String(error)}`);
    }
  }

  public async objectExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.client.send(command);
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === 'NotFound') {
        return false;
      }
      throw new Error(`Failed to check object existence ${key}: ${String(error)}`);
    }
  }

  public async listObjects(prefix: string): Promise<string[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      });
      const response = await this.client.send(command);
      return (response.Contents || []).map((obj) => obj.Key || '').filter(Boolean);
    } catch (error) {
      throw new Error(`Failed to list objects with prefix ${prefix}: ${String(error)}`);
    }
  }

  public close(): void {
    this.client.destroy();
  }
}
