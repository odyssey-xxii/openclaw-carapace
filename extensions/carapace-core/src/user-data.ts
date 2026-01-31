import { S3Client } from './s3-client.js';
import { UserProfile, PlatformAccount } from './types.js';

export class UserDataService {
  private s3Client: S3Client;

  constructor(s3Client: S3Client) {
    this.s3Client = s3Client;
  }

  public async saveProfile(userId: string, profile: UserProfile): Promise<void> {
    const key = this.getProfileKey(userId);
    profile.updatedAt = new Date();
    await this.s3Client.putObjectJson(key, profile);
  }

  public async getProfile(userId: string): Promise<UserProfile | null> {
    const key = this.getProfileKey(userId);
    return this.s3Client.getObjectAsJson<UserProfile>(key);
  }

  public async createProfile(userId: string, email: string, displayName?: string): Promise<UserProfile> {
    const profile: UserProfile = {
      userId,
      email,
      displayName,
      platformAccounts: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.saveProfile(userId, profile);
    return profile;
  }

  public async linkPlatformUser(
    userId: string,
    platformId: string,
    platformUserId: string,
    username?: string,
    platformEmail?: string,
  ): Promise<UserProfile> {
    let profile = await this.getProfile(userId);
    if (!profile) {
      throw new Error(`Profile not found for user ${userId}`);
    }

    // Check if platform account already linked
    const existingIndex = profile.platformAccounts.findIndex(
      (acc) => acc.platformId === platformId && acc.platformUserId === platformUserId,
    );

    const platformAccount: PlatformAccount = {
      platformId,
      platformUserId,
      username,
      email: platformEmail,
      linkedAt: new Date(),
      verified: true,
    };

    if (existingIndex >= 0) {
      profile.platformAccounts[existingIndex] = platformAccount;
    } else {
      profile.platformAccounts.push(platformAccount);
    }

    await this.saveProfile(userId, profile);
    return profile;
  }

  public async unlinkPlatformUser(userId: string, platformId: string): Promise<UserProfile> {
    const profile = await this.getProfile(userId);
    if (!profile) {
      throw new Error(`Profile not found for user ${userId}`);
    }

    profile.platformAccounts = profile.platformAccounts.filter(
      (acc) => !(acc.platformId === platformId),
    );

    await this.saveProfile(userId, profile);
    return profile;
  }

  public async findUserByPlatformId(platformId: string, platformUserId: string): Promise<UserProfile | null> {
    // List all user profiles and search for platform account
    const prefix = 'users/';
    const userKeys = await this.s3Client.listObjects(prefix);

    for (const key of userKeys) {
      const profile = await this.s3Client.getObjectAsJson<UserProfile>(key);
      if (profile) {
        const found = profile.platformAccounts.some(
          (acc) => acc.platformId === platformId && acc.platformUserId === platformUserId,
        );
        if (found) {
          return profile;
        }
      }
    }

    return null;
  }

  public async getUserByEmail(email: string): Promise<UserProfile | null> {
    const prefix = 'users/';
    const userKeys = await this.s3Client.listObjects(prefix);

    for (const key of userKeys) {
      const profile = await this.s3Client.getObjectAsJson<UserProfile>(key);
      if (profile && profile.email === email) {
        return profile;
      }
    }

    return null;
  }

  public async deleteProfile(userId: string): Promise<void> {
    const key = this.getProfileKey(userId);
    await this.s3Client.deleteObject(key);
  }

  private getProfileKey(userId: string): string {
    return `users/${userId}/profile.json`;
  }
}
