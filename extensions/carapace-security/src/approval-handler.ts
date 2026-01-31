import { randomUUID } from "crypto";
import type { ApprovalRequest, ApprovalResponse } from "./types.js";

interface PendingApproval {
  request: ApprovalRequest;
  resolvePromise?: (response: ApprovalResponse) => void;
  rejectPromise?: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class ApprovalHandler {
  private pending: Map<string, PendingApproval> = new Map();
  private readonly DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private timeoutMs: number;

  constructor(timeoutSeconds = 300) {
    this.timeoutMs = timeoutSeconds * 1000;
  }

  /**
   * Request approval for a command, waiting up to timeoutMs for response
   */
  requestApproval(command: string, level: "yellow" | "red", reason: string): Promise<ApprovalResponse> {
    const request: ApprovalRequest = {
      id: randomUUID(),
      command,
      level,
      reason,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.timeoutMs),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`Approval request timed out after ${this.timeoutMs / 1000}s`));
      }, this.timeoutMs);

      const pending: PendingApproval = {
        request,
        resolvePromise: resolve,
        rejectPromise: reject,
        timeout,
      };

      this.pending.set(request.id, pending);
    });
  }

  /**
   * Approve a pending request
   */
  approveRequest(requestId: string, approvedBy: string): void {
    const pending = this.pending.get(requestId);
    if (!pending) {
      throw new Error(`No pending approval request for ${requestId}`);
    }

    clearTimeout(pending.timeout);
    this.pending.delete(requestId);

    const response: ApprovalResponse = {
      approved: true,
      approvedBy,
      timestamp: new Date(),
    };

    pending.resolvePromise?.(response);
  }

  /**
   * Reject a pending request
   */
  rejectRequest(requestId: string, reason?: string): void {
    const pending = this.pending.get(requestId);
    if (!pending) {
      throw new Error(`No pending approval request for ${requestId}`);
    }

    clearTimeout(pending.timeout);
    this.pending.delete(requestId);

    pending.rejectPromise?.(new Error(`Approval request was rejected${reason ? `: ${reason}` : ""}`));
  }

  /**
   * Get all pending approval requests
   */
  getPendingRequests(): ApprovalRequest[] {
    return Array.from(this.pending.values())
      .map((p) => p.request)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get a specific pending request
   */
  getPendingRequest(requestId: string): ApprovalRequest | null {
    return this.pending.get(requestId)?.request || null;
  }

  /**
   * Get count of pending requests
   */
  getPendingCount(): number {
    return this.pending.size;
  }

  /**
   * Clean up expired requests
   */
  cleanupExpired(): number {
    let cleaned = 0;
    const now = new Date();
    const idsToDelete: string[] = [];

    this.pending.forEach((pending, id) => {
      if (pending.request.expiresAt < now) {
        idsToDelete.push(id);
      }
    });

    for (const id of idsToDelete) {
      const pending = this.pending.get(id);
      if (pending) {
        this.pending.delete(id);
        clearTimeout(pending.timeout);
        cleaned++;
      }
    }

    return cleaned;
  }
}

let instance: ApprovalHandler | null = null;

export function getApprovalHandler(timeoutSeconds = 300): ApprovalHandler {
  if (!instance) {
    instance = new ApprovalHandler(timeoutSeconds);
  }
  return instance;
}
