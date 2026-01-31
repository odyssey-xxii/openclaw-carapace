import type { PersistedSandboxState } from "./types.js";

interface S3CompatibleService {
  putJSON(key: string, value: unknown): Promise<void>;
  getJSON<T = unknown>(key: string): Promise<T | null>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

/**
 * Persistence layer for E2B sandbox snapshots.
 * Optionally persists sandbox state to S3 for durability and resumption.
 */
export class SandboxPersistence {
  private s3: S3CompatibleService | null = null;
  private bucket: string;

  constructor(s3?: S3CompatibleService, bucket?: string) {
    this.s3 = s3 || null;
    this.bucket = bucket || "sandbox-snapshots";
  }

  private getS3Key(userId: string): string {
    return `${this.bucket}/users/${userId}/state.json`;
  }

  async saveState(userId: string, state: PersistedSandboxState): Promise<void> {
    if (!this.s3) {
      console.warn("[Persistence] S3 not configured, state not persisted");
      return;
    }

    try {
      await this.s3.putJSON(this.getS3Key(userId), state);
      console.log(`[Persistence] Saved state for user ${userId} (sandbox: ${state.sandboxId})`);
    } catch (error) {
      console.error(`[Persistence] Failed to save state for ${userId}:`, error);
      throw error;
    }
  }

  async loadState(userId: string): Promise<PersistedSandboxState | null> {
    if (!this.s3) {
      return null;
    }

    try {
      const state = await this.s3.getJSON<PersistedSandboxState>(this.getS3Key(userId));
      if (state) {
        console.log(
          `[Persistence] Loaded state for user ${userId} (sandbox: ${state.sandboxId})`
        );
      }
      return state;
    } catch (error) {
      console.warn(`[Persistence] Failed to load state for ${userId}:`, error);
      return null;
    }
  }

  async deleteState(userId: string): Promise<void> {
    if (!this.s3) {
      return;
    }

    try {
      await this.s3.delete(this.getS3Key(userId));
      console.log(`[Persistence] Deleted state for user ${userId}`);
    } catch (error) {
      console.warn(`[Persistence] Failed to delete state for ${userId}:`, error);
    }
  }

  async listSnapshots(userIdPrefix?: string): Promise<PersistedSandboxState[]> {
    if (!this.s3) {
      return [];
    }

    try {
      const prefix = userIdPrefix
        ? `${this.bucket}/users/${userIdPrefix}`
        : `${this.bucket}/users/`;

      const keys = await this.s3.list(prefix);
      const snapshots: PersistedSandboxState[] = [];

      for (const key of keys) {
        try {
          const state = await this.s3.getJSON<PersistedSandboxState>(key);
          if (state) {
            snapshots.push(state);
          }
        } catch {
          // Skip invalid snapshots
        }
      }

      return snapshots;
    } catch (error) {
      console.error("[Persistence] Failed to list snapshots:", error);
      return [];
    }
  }

  async validateState(state: PersistedSandboxState, expectedUserId: string): boolean {
    if (state.userId !== expectedUserId) {
      console.warn(
        `[Persistence] State userId mismatch: expected ${expectedUserId}, got ${state.userId}`
      );
      return false;
    }

    // Check if state is too old (older than 7 days)
    const pausedAt = new Date(state.pausedAt).getTime();
    const ageMs = Date.now() - pausedAt;
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000;

    if (ageMs > maxAgeMs) {
      console.warn(
        `[Persistence] State for ${expectedUserId} too old: ${Math.round(ageMs / (24 * 60 * 60 * 1000))} days`
      );
      return false;
    }

    return true;
  }
}

let persistenceInstance: SandboxPersistence | null = null;

export function getPersistence(s3?: S3CompatibleService, bucket?: string): SandboxPersistence {
  if (!persistenceInstance) {
    persistenceInstance = new SandboxPersistence(s3, bucket);
  }
  return persistenceInstance;
}
