export interface SecretMatch {
  type: string;
  pattern: string;
  match: string;
  redacted: string;
  position: { start: number; end: number };
  lineNumber?: number;
}

// Comprehensive secret patterns organized by service/type
export const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  // AWS Credentials
  { name: 'AWS Access Key ID', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'AWS Secret Access Key', pattern: /aws_secret_access_key\s*[=:]\s*['"]?[A-Za-z0-9/+=]{40}['"]?/i },

  // GitHub Tokens (must be longer to avoid false positives)
  { name: 'GitHub Personal Access Token', pattern: /ghp_[a-zA-Z0-9]{30,255}/ },
  { name: 'GitHub OAuth Token', pattern: /gho_[a-zA-Z0-9]{30,255}/ },
  { name: 'GitHub App Token', pattern: /ghu_[a-zA-Z0-9]{30,255}/ },
  { name: 'GitHub Refresh Token', pattern: /ghr_[a-zA-Z0-9]{30,255}/ },
  { name: 'GitHub PAT', pattern: /github_pat_[a-zA-Z0-9]{20,255}/ },

  // Slack Tokens
  { name: 'Slack Bot Token', pattern: /xoxb-[0-9]{10,13}-[0-9]{10,13}-[A-Za-z0-9]{24,32}/ },
  { name: 'Slack User Token', pattern: /xoxp-[0-9]{10,13}-[0-9]{10,13}-[A-Za-z0-9]{24,32}/ },
  { name: 'Slack Webhook', pattern: /https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+/ },

  // Stripe Keys
  { name: 'Stripe Live Secret Key', pattern: /sk_live_[0-9a-zA-Z]{20,}/ },
  { name: 'Stripe Test Secret Key', pattern: /sk_test_[0-9a-zA-Z]{20,}/ },
  { name: 'Stripe Live Publishable Key', pattern: /pk_live_[0-9a-zA-Z]{20,}/ },
  { name: 'Stripe Test Publishable Key', pattern: /pk_test_[0-9a-zA-Z]{20,}/ },
  { name: 'Stripe Restricted API Key', pattern: /rk_live_[0-9a-zA-Z]{20,}/ },

  // API Keys - Cloud Providers
  { name: 'Google API Key', pattern: /AIza[0-9A-Za-z\-_]{35}/ },
  { name: 'Google Cloud Private Key', pattern: /"private_key":\s*"-----BEGIN PRIVATE KEY-----[^"]+-----END PRIVATE KEY-----"/ },

  // OpenAI (sk- prefix but not ANT)
  { name: 'OpenAI API Key', pattern: /sk-(?!ant-)[A-Za-z0-9\-]{20,}/ },
  // Anthropic API Key (sk-ant- prefix)
  { name: 'Anthropic API Key', pattern: /sk-ant-[A-Za-z0-9\-]{20,}/ },

  // Private Keys (PEM format)
  { name: 'RSA Private Key', pattern: /-----BEGIN RSA PRIVATE KEY-----[\s\S]*?-----END RSA PRIVATE KEY-----/ },
  { name: 'EC Private Key', pattern: /-----BEGIN EC PRIVATE KEY-----[\s\S]*?-----END EC PRIVATE KEY-----/ },
  { name: 'DSA Private Key', pattern: /-----BEGIN DSA PRIVATE KEY-----[\s\S]*?-----END DSA PRIVATE KEY-----/ },
  { name: 'OpenSSH Private Key', pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/ },

  // Database URLs
  { name: 'PostgreSQL Connection String', pattern: /postgres(?:ql)?:\/\/[a-zA-Z0-9_-]+:[a-zA-Z0-9_\-@.]+@[^\s]+/ },
  { name: 'MySQL Connection String', pattern: /mysql:\/\/[a-zA-Z0-9_-]+:[a-zA-Z0-9_\-@.]+@[^\s]+/ },
  { name: 'MongoDB Connection String', pattern: /mongodb(?:\+srv)?:\/\/[a-zA-Z0-9_-]+:[a-zA-Z0-9_\-@.]+@[^\s]+/ },
  { name: 'Redis Connection String', pattern: /redis:\/\/:[a-zA-Z0-9_\-]+@[^\s]+/ },

  // JWT Tokens
  { name: 'JWT Token', pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_\-]+/ },

  // Generic API Keys and Tokens (must have context)
  { name: 'API Key (generic)', pattern: /[aA][pP][iI][_-]?[kK][eE][yY]\s*[=:]\s*['"]?[A-Za-z0-9_\-]{20,}['"]?/ },
  { name: 'API Token', pattern: /[aA][pP][iI][_-]?[tT][oO][kK][eE][nN]\s*[=:]\s*['"]?[A-Za-z0-9_\-\.]{20,}['"]?/ },

  // Passwords and Secrets
  { name: 'Password Field', pattern: /[pP][aA][sS][sS][wW][oO][rR][dD]\s*[=:]\s*['"]?[^\s'"=:]+['"]?/ },
  { name: 'Secret Field', pattern: /[sS][eE][cC][rR][eE][tT]\s*[=:]\s*['"]?[^\s'"=:]+['"]?/ },
  { name: 'Token Field', pattern: /[tT][oO][kK][eE][nN]\s*[=:]\s*['"]?[^\s'"=:]+['"]?/ },

  // URL-embedded credentials
  { name: 'URL with Embedded Credentials', pattern: /(?:https?|ftp):\/\/[a-zA-Z0-9_-]+:[a-zA-Z0-9_\-~!*'();:@&=+$,/?#\[\]]+@[^\s/]+/ },

  // Bearer Tokens
  { name: 'Bearer Token', pattern: /[Bb]earer\s+[A-Za-z0-9\-_.~+/]+=*/ },

  // AWS environment variables
  { name: 'AWS Access Key Environment', pattern: /AWS_ACCESS_KEY_ID\s*[=:]\s*['"]?AKIA[0-9A-Z]{16}['"]?/ },
  { name: 'AWS Secret Key Environment', pattern: /AWS_SECRET_ACCESS_KEY\s*[=:]\s*['"]?[A-Za-z0-9/+=]{40}['"]?/ },

  // GitHub environment
  { name: 'GitHub Token Environment', pattern: /GITHUB_TOKEN\s*[=:]\s*['"]?[a-zA-Z0-9_]{20,}['"]?/ },

  // Generic environment variable patterns (high entropy)
  { name: 'Generic Secret Environment', pattern: /(?:SECRET|TOKEN|KEY|PASSWORD|CREDENTIAL|AUTH)\s*[=:]\s*['"]?[A-Za-z0-9_\-\.]{16,}['"]?/i },
];

function getLineNumber(text: string, position: number): number {
  return text.substring(0, position).split('\n').length;
}

function createRedactionString(match: string, type: string): string {
  // Show first 4 and last 4 chars for context, with redaction in middle
  if (match.length <= 8) {
    return '[REDACTED]';
  }
  const start = match.substring(0, Math.min(4, match.length));
  const end = match.substring(Math.max(0, match.length - 4));
  return `${start}...[REDACTED:${type}]...${end}`;
}

export function scanForSecrets(text: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  const seenMatches = new Set<string>(); // Dedup matches at same position

  for (const { name, pattern } of SECRET_PATTERNS) {
    try {
      const regex = new RegExp(pattern, 'g');
      let match;
      while ((match = regex.exec(text)) !== null) {
        const matchKey = `${match.index}-${match[0].length}`; // Use position + length as key
        if (seenMatches.has(matchKey)) continue;
        seenMatches.add(matchKey);

        matches.push({
          type: name,
          pattern: pattern.toString(),
          match: match[0],
          redacted: createRedactionString(match[0], name),
          position: { start: match.index, end: match.index + match[0].length },
          lineNumber: getLineNumber(text, match.index),
        });
      }
    } catch (error) {
      // Skip patterns with regex errors
      continue;
    }
  }

  // Sort by position to ensure proper ordering
  matches.sort((a, b) => a.position.start - b.position.start);
  return matches;
}

export function redactSecrets(text: string): string {
  let result = text;
  const matches = scanForSecrets(text);

  // Sort by position descending to avoid offset issues when replacing
  matches.sort((a, b) => b.position.start - a.position.start);

  for (const match of matches) {
    result =
      result.substring(0, match.position.start) +
      match.redacted +
      result.substring(match.position.end);
  }

  return result;
}

export interface SecretsDetectionConfig {
  mode: 'warn' | 'redact' | 'block'; // warn = log and continue, redact = replace secrets, block = don't return output
  enableLineNumbers: boolean;
  maxSecretsPerType: number; // Limit number of secrets to report per type
}

const DEFAULT_CONFIG: SecretsDetectionConfig = {
  mode: 'redact',
  enableLineNumbers: true,
  maxSecretsPerType: 10,
};

let secretsDetectionConfig = DEFAULT_CONFIG;

export function configureSecretsDetection(config: Partial<SecretsDetectionConfig>): void {
  secretsDetectionConfig = { ...DEFAULT_CONFIG, ...config };
}

export function getSecretsDetectionConfig(): SecretsDetectionConfig {
  return secretsDetectionConfig;
}

export interface ScanResult {
  hasSecrets: boolean;
  secretCount: number;
  secrets: SecretMatch[];
  secretsByType: Record<string, number>;
  redactedOutput?: string;
}

export function scanOutput(output: string): ScanResult {
  const secrets = scanForSecrets(output);
  const secretsByType: Record<string, number> = {};

  for (const secret of secrets) {
    secretsByType[secret.type] = (secretsByType[secret.type] || 0) + 1;
  }

  const result: ScanResult = {
    hasSecrets: secrets.length > 0,
    secretCount: secrets.length,
    secrets,
    secretsByType,
  };

  if (secretsDetectionConfig.mode !== 'warn') {
    result.redactedOutput = redactSecrets(output);
  }

  return result;
}
