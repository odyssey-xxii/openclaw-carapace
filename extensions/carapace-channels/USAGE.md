# Carapace Channels Extension - Usage Guide

## Integration Example

### Step 1: Initialize with Your Gateway

```typescript
import { registerChannelsExtension } from '@carapace/channels';
import type { StorageAdapter, EncryptionAdapter } from '@carapace/channels';

// Your storage and encryption implementations
const storageAdapter: StorageAdapter = {
  async get(key: string) {
    // Fetch from S3 or your storage backend
    return s3.get(key);
  },
  async set(key: string, value: string, ttl?: number) {
    // Store in S3, optionally with TTL
    await s3.put(key, value, { ttl });
  },
  async delete(key: string) {
    // Remove from storage
    await s3.delete(key);
  },
  async exists(key: string) {
    return s3.exists(key);
  },
};

const encryptionAdapter: EncryptionAdapter = {
  async encrypt(data: string) {
    // Use AES-256 or similar
    return crypto.encrypt(data);
  },
  async decrypt(data: string) {
    return crypto.decrypt(data);
  },
};

// Register with your OpenClaw gateway
registerChannelsExtension({
  gateway: yourOpenClawGateway,
  storage: storageAdapter,
  encryption: encryptionAdapter,
});
```

## API Examples

### Telegram Channel

```typescript
// Connect a bot
const response = await gateway.call('carapace.telegram.connect',
  'user-123',
  { botToken: '123456789:ABCdefGHIjklmnoPQRstuvWXYZ' }
);

if (response.success) {
  console.log('Bot connected:', response.data);
  // {
  //   connected: true,
  //   lastConnected: 2025-01-30T17:28:00.000Z,
  //   metadata: {
  //     channel: 'telegram',
  //     botUsername: '@my_awesome_bot'
  //   }
  // }
}

// Get status
const status = await gateway.call('carapace.telegram.status', 'user-123');

// Disconnect
await gateway.call('carapace.telegram.disconnect', 'user-123');
```

### Discord Channel

```typescript
// Connect with OAuth token (from Discord OAuth flow)
const response = await gateway.call('carapace.discord.connect',
  'user-123',
  { oauthToken: 'access_token_from_oauth' }
);

if (response.success) {
  console.log('Discord connected:', response.data);
  // {
  //   connected: true,
  //   lastConnected: 2025-01-30T17:28:00.000Z,
  //   metadata: {
  //     channel: 'discord',
  //     discordUserId: '123456789',
  //     username: 'user#1234'
  //   }
  // }
}
```

### Slack Channel

```typescript
// Connect with OAuth token (from Slack OAuth flow)
const response = await gateway.call('carapace.slack.connect',
  'user-123',
  { oauthToken: 'xoxb-slack-bot-token' }
);

if (response.success) {
  console.log('Slack workspace connected:', response.data);
  // {
  //   connected: true,
  //   lastConnected: 2025-01-30T17:28:00.000Z,
  //   metadata: {
  //     channel: 'slack',
  //     teamId: 'T1234567890',
  //     teamName: 'My Workspace',
  //     userId: 'U1234567890'
  //   }
  // }
}
```

### WhatsApp Channel (QR Code Flow)

```typescript
// Step 1: Start QR session
const qrSession = await gateway.call('carapace.whatsapp.qr.start', 'user-123');

if (qrSession.success) {
  const { sessionId, qrCode, expiresAt, status } = qrSession.data;
  // {
  //   sessionId: 'qr_abc123def456',
  //   qrCode: 'data:image/svg+xml;base64,...',
  //   expiresAt: 2025-01-30T17:33:00.000Z,
  //   status: 'pending'
  // }

  // Display qrCode to user in dashboard
  displayQRToUser(qrCode);

  // Step 2: Wait for user to scan (with polling or websocket)
  const scanResult = await gateway.call('carapace.whatsapp.qr.wait', sessionId, 30000);

  if (scanResult.success && scanResult.data.connected) {
    console.log('WhatsApp connected!');
    // User has scanned the QR code
  }
}
```

## Error Handling

```typescript
import { ChannelException } from '@carapace/channels';

try {
  await gateway.call('carapace.telegram.connect', 'user-123', { botToken: 'invalid' });
} catch (error) {
  if (error instanceof ChannelException) {
    console.error(`Error [${error.code}]: ${error.message}`);
    // Error [INVALID_BOT_TOKEN]: Invalid bot token format

    if (error.statusCode === 400) {
      // Handle validation error
    }

    if (error.context?.channel === 'telegram') {
      // Channel-specific handling
    }
  }
}
```

## Storage Structure

Credentials are stored with these keys:

```
telegram:user-123:token      → encrypted bot token
telegram:user-123:status     → {"connected": true, "lastConnected": "2025-01-30T17:28:00.000Z"}

discord:user-123:token       → encrypted oauth token
discord:user-123:status      → {"connected": true, ...}

slack:user-123:token         → encrypted oauth token
slack:user-123:status        → {"connected": true, ...}

whatsapp:user-123:session    → {"connected": true, "phoneNumber": "+1234567890"}
whatsapp:user-123:qr         → {"sessionId": "...", "qrCode": "...", ...}
```

## Validation Rules

### Telegram Bot Token
- Format: `{numeric_id}:{alphanumeric_string}`
- Example: `123456789:ABCdefGHIjklmnoPQRstuvWXYZ1234567`
- Minimum 27 characters after colon

### OAuth Tokens (Discord/Slack)
- Must be valid and non-expired
- Validated by making API calls to respective services
- Stores access token only (not refresh tokens)

### WhatsApp QR Sessions
- 5-minute expiration by default
- Poll `qr.wait()` every 1-2 seconds
- Returns `connected: true` once user scans

## Response Structure

All methods return:

```typescript
{
  success: boolean;
  data?: ChannelStatus | QRSession;
  error?: {
    code: string;
    message: string;
    statusCode?: number;
  };
}
```

## Testing

### Unit Tests
Mock the `StorageAdapter` and `EncryptionAdapter`:

```typescript
const mockStorage: StorageAdapter = {
  data: new Map(),
  async get(key) { return this.data.get(key) ?? null; },
  async set(key, value) { this.data.set(key, value); },
  async delete(key) { this.data.delete(key); },
  async exists(key) { return this.data.has(key); },
};

const mockEncryption: EncryptionAdapter = {
  async encrypt(data) { return `encrypted:${data}`; },
  async decrypt(data) { return data.replace('encrypted:', ''); },
};
```

### Integration Tests
Use real S3 credentials in test environment:

```bash
AWS_REGION=us-east-1 \
S3_BUCKET=test-carapace \
npm test
```

## Performance Considerations

- Credential validation happens on connect (API calls to Telegram/Discord/Slack)
- Status checks read from storage (O(1) operation)
- Encryption/decryption happens for all token operations
- WhatsApp QR polling recommended at 1-2s intervals
- Storage TTL recommended for temporary session keys (5-10 minutes)

## Security Notes

1. **Never log credentials**: All tokens are encrypted before storage
2. **Validate input**: Token format validation prevents garbage storage
3. **Use HTTPS**: All API validation calls use HTTPS endpoints
4. **TTL for QR**: Sessions expire after 5 minutes
5. **Per-user isolation**: Each user's credentials isolated with userId prefix
