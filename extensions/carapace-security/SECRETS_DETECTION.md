# Secrets Detection Scanner

Comprehensive secrets detection system for the Carapace Security extension that automatically scans command outputs and logs for sensitive data including API keys, tokens, database credentials, and private keys.

## Features

### Comprehensive Pattern Detection

The scanner detects secrets across multiple service providers and secret types:

**Cloud & API Providers:**
- AWS Access Keys (AKIA*)
- AWS Secret Access Keys
- Google API Keys
- Google Cloud Private Keys

**Authentication & APIs:**
- GitHub tokens (ghp_*, gho_*, ghu_*, ghr_*, github_pat_*)
- Slack tokens (xoxb-*, xoxp-*)
- Slack Webhooks
- OpenAI API keys (sk-proj*)
- Anthropic API keys (sk-ant-*)
- Bearer tokens

**Payment & Commerce:**
- Stripe live/test keys (sk_live_*, sk_test_*, pk_live_*, pk_test_*, rk_live_*)

**Databases:**
- PostgreSQL connection strings (postgres://...)
- MySQL connection strings (mysql://...)
- MongoDB URLs (mongodb://, mongodb+srv://...)
- Redis URLs (redis://...)

**Security & Credentials:**
- Private keys (RSA, EC, DSA, OpenSSH formats)
- JWT tokens
- URL-embedded credentials (username:password@host)
- Environment variable patterns (PASSWORD=, SECRET=, TOKEN=, etc.)

### Detection Modes

Configure how detected secrets are handled:

- **`warn`**: Log detection and continue (default: redact)
- **`redact`**: Replace secrets with `[REDACTED:type]` placeholders in output
- **`block`**: Don't return output containing secrets; log detection and block execution

### Line Number Tracking

Optionally include line numbers where secrets were detected for easier auditing and remediation.

### Deduplication

Prevents duplicate reports of the same secret at the same location.

## API Usage

### Scanning for Secrets

```typescript
import { scanForSecrets, scanOutput } from './src/secrets-scanner';

// Basic scan - returns array of matches
const matches = scanForSecrets("aws_key=AKIA1234567890ABCDEF");
// [{ type: 'AWS Access Key ID', match: 'AKIA1234567890ABCDEF', redacted: 'AKIA...[REDACTED:AWS Access Key ID]...CDEF', ... }]

// Comprehensive scan with metadata
const result = scanOutput(output);
// {
//   hasSecrets: true,
//   secretCount: 2,
//   secrets: [...],
//   secretsByType: { 'AWS Access Key ID': 1, 'GitHub Personal Access Token': 1 },
//   redactedOutput: "aws_key=AKIA...[REDACTED]...CDEF"
// }
```

### Redacting Secrets

```typescript
import { redactSecrets } from './src/secrets-scanner';

const original = "export STRIPE_KEY=sk_live_abc123def456ghi789";
const redacted = redactSecrets(original);
// "export STRIPE_KEY=sk_l...[REDACTED:Stripe Live Secret Key]...hij789"
```

### Configuration

```typescript
import { configureSecretsDetection, getSecretsDetectionConfig } from './src/secrets-scanner';

// Set detection mode and options
configureSecretsDetection({
  mode: 'block',           // warn | redact | block
  enableLineNumbers: true, // Include line numbers in detection
  maxSecretsPerType: 10    // Limit secrets per type to report
});

// Get current config
const config = getSecretsDetectionConfig();
// { mode: 'block', enableLineNumbers: true, maxSecretsPerType: 10 }
```

## Gateway Methods

The security extension exposes HTTP API methods via OpenClaw's gateway for remote secret detection and configuration:

### Scan Text for Secrets

```bash
POST /api/carapace.security.secrets.scan
{
  "text": "API_KEY=sk_live_1234567890abcdefghijklmnop"
}

Response:
{
  "hasSecrets": true,
  "secretCount": 1,
  "secrets": [{
    "type": "Stripe Live Secret Key",
    "match": "sk_live_1234567890abcdefghijklmnop",
    "redacted": "sk_l...[REDACTED:Stripe Live Secret Key]...mnop",
    "lineNumber": 1
  }],
  "secretsByType": { "Stripe Live Secret Key": 1 }
}
```

### Redact Secrets from Text

```bash
POST /api/carapace.security.secrets.redact
{
  "text": "DATABASE_URL=postgres://user:password@localhost:5432/db"
}

Response:
{
  "redacted": "DATABASE_URL=post...[REDACTED:PostgreSQL Connection String]...db",
  "secretsFound": 1,
  "secrets": [...]
}
```

### Configure Detection Behavior

```bash
POST /api/carapace.security.secrets.configure
{
  "mode": "block",
  "enableLineNumbers": true,
  "maxSecretsPerType": 5
}

Response:
{
  "success": true,
  "config": {
    "mode": "block",
    "enableLineNumbers": true,
    "maxSecretsPerType": 5
  }
}
```

### Get Current Configuration

```bash
POST /api/carapace.security.secrets.getConfig

Response:
{
  "config": {
    "mode": "redact",
    "enableLineNumbers": true,
    "maxSecretsPerType": 10
  }
}
```

## Hook Integration

The system integrates with OpenClaw's tool execution hooks:

### Before Tool Call (`before_tool_call`)

Security classification hook in `security-hook.ts` classifies commands as Green/Yellow/Red before execution.

### After Tool Call (`after_tool_call`)

The `audit-log-hook.ts` automatically scans command output after execution:

1. Scans output for secrets using configured patterns
2. Logs detection with type categorization
3. Handles based on detection mode:
   - **warn**: Logs detection, returns original output
   - **redact**: Replaces secrets, stores redacted version in audit log
   - **block**: Prevents output from being returned, logs alert

Example audit entry with detected secrets:

```json
{
  "id": "audit-123",
  "command": "echo $DATABASE_URL",
  "output": "[OUTPUT BLOCKED - Secrets detected]",
  "secretsFound": [
    {
      "type": "PostgreSQL Connection String",
      "match": "postgres://user:pass@host:5432/db",
      "lineNumber": 1
    }
  ],
  "secretsRedacted": true
}
```

## Environment Variable Scanning

The scanner automatically detects common secret patterns in environment variables:

```bash
# Detected patterns:
export AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF
export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY
export DATABASE_URL=postgres://user:pass@localhost/db
export ANTHROPIC_API_KEY=sk-ant-abc123...
export STRIPE_KEY=sk_live_123...
export GITHUB_TOKEN=ghp_abc123...
```

## Security Considerations

### Pattern Accuracy

Patterns balance sensitivity with false positive rate:
- Some patterns require minimum length (30+ chars for GitHub tokens)
- Environment variable patterns require assignment context (`TOKEN=...`)
- Private keys must include full PEM boundaries

### Output Handling

- Maximum stored output: 4096 characters (configurable via audit store)
- Secrets are redacted before being stored in logs
- Line numbers tracked for precise location reporting

### Configuration Security

- Detection mode can be changed remotely via gateway API
- Block mode prevents secrets from being returned to callers
- Audit logs preserve evidence of secret detection

## Testing

Test suite covers:

- Detection of all supported secret types
- Proper redaction with context preservation
- Configuration updates and persistence
- Real-world scenarios (.env files, JSON configs, command outputs)
- Deduplication of overlapping matches

Run tests:

```bash
npm test -- extensions/carapace-security/src/secrets-scanner.test.ts
```

## Future Enhancements

Potential improvements:

- Custom pattern registration
- Machine learning-based entropy detection
- Integration with secret management systems (HashiCorp Vault, AWS Secrets Manager)
- Real-time monitoring dashboards
- Automated secret rotation alerts
- Regex caching for performance optimization
