export type SecurityLevel = "green" | "yellow" | "red";
export type ClassificationAction = "allow" | "ask" | "block";

export interface SecretMatch {
  type: string;
  pattern: string;
  match: string;
  redacted: string;
  position: { start: number; end: number };
}

export interface ClassificationResult {
  command: string;
  level: SecurityLevel;
  action: ClassificationAction;
  reason: string;
  matchedPattern?: string;
  requiresApproval: boolean;
}

export interface AuditLogEntry {
  id: string;
  command: string;
  level: SecurityLevel;
  action: ClassificationAction;
  reason: string;
  createdAt: Date;
  userId?: string;
  channelId?: string;
  approved?: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  executedAt?: Date;
  output?: string;
  error?: string;
  secretsFound?: SecretMatch[];
  secretsRedacted?: boolean;
}

export interface AuditStats {
  total: number;
  byLevel: {
    green: number;
    yellow: number;
    red: number;
  };
  byAction: {
    allow: number;
    ask: number;
    block: number;
  };
  approvalRate: number; // percentage of "ask" that were approved
  lastUpdate: Date;
}

export interface ApprovalRequest {
  id: string;
  command: string;
  level: SecurityLevel;
  reason: string;
  createdAt: Date;
  requestedBy?: string;
  expiresAt: Date;
}

export interface ApprovalResponse {
  approved: boolean;
  approvedBy?: string;
  timestamp: Date;
  reason?: string;
}
