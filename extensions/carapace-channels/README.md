# Carapace Channels Extension

A production-ready OpenClaw extension providing bridge integrations between the Carapace web dashboard and messaging channels (Telegram, Discord, Slack, WhatsApp).

## Features

- **Telegram Bridge**: Connect bot tokens from the dashboard
- **Discord Bridge**: OAuth token integration for Discord servers
- **Slack Bridge**: OAuth token integration for Slack workspaces
- **WhatsApp Bridge**: QR code-based pairing for WhatsApp sessions
- **Encrypted Storage**: All credentials stored securely via S3 adapter
- **Status Tracking**: Real-time connection status for each channel per user
- **Type Safety**: Full TypeScript with strict typing

## Architecture

Each channel bridge implements a consistent interface:

```typescript
interface ChannelBridge {
  connect(userId: string, credentials: ChannelCredentials): Promise<ChannelStatus>;
  disconnect(userId: string): Promise<void>;
  status(userId: string): Promise<ChannelStatus>;
}
```

### Storage Keys

Credentials are stored with encrypted values in the format:
- `{channel}:{userId}:token` - Encrypted credential token
- `{channel}:{userId}:status` - JSON status metadata

## Gateway Methods

### Telegram
- `carapace.telegram.connect(userId, { botToken })` - Connect with bot token
- `carapace.telegram.disconnect(userId)` - Disconnect
- `carapace.telegram.status(userId)` - Get connection status

### Discord
- `carapace.discord.connect(userId, { oauthToken })` - Connect with OAuth token
- `carapace.discord.disconnect(userId)` - Disconnect
- `carapace.discord.status(userId)` - Get connection status

### Slack
- `carapace.slack.connect(userId, { oauthToken })` - Connect with OAuth token
- `carapace.slack.disconnect(userId)` - Disconnect
- `carapace.slack.status(userId)` - Get connection status

### WhatsApp
- `carapace.whatsapp.qr.start(userId)` - Start QR code session
- `carapace.whatsapp.qr.wait(sessionId, timeoutMs?)` - Wait for QR scan (default 30s)
- `carapace.whatsapp.disconnect(userId)` - Disconnect
- `carapace.whatsapp.status(userId)` - Get connection status

## Usage

Register the extension with your OpenClaw gateway:

```typescript
import { registerChannelsExtension } from '@carapace/channels';

const context = {
  gateway: yourGateway,
  storage: s3StorageAdapter,
  encryption: encryptionService,
};

registerChannelsExtension(context);
```

## Response Format

All gateway methods return a consistent response:

```typescript
{
  success: boolean;
  data?: {
    connected: boolean;
    lastConnected?: Date;
    metadata?: Record<string, unknown>;
    error?: string;
  }
}
```

## Error Handling

Bridges throw `ChannelException` for validation and runtime errors:

```typescript
class ChannelException extends Error {
  code: string;        // e.g., 'INVALID_CREDENTIALS', 'INVALID_TOKEN'
  statusCode?: number; // HTTP status code
  context?: Record<string, unknown>; // Additional error context
}
```

## WhatsApp QR Flow

```
1. Dashboard calls carapace.whatsapp.qr.start(userId)
   → Returns { sessionId, qrCode, expiresAt, status: 'pending' }

2. Dashboard renders QR code to user

3. User scans QR with WhatsApp mobile

4. Dashboard polls carapace.whatsapp.qr.wait(sessionId)
   → Returns { success: true, data: { connected: true } }

5. Session stored in S3: whatsapp:{userId}:session
```

## Building

```bash
npm install
npm run build
```

Output compiled to `dist/` with full TypeScript definitions.

## Development

TypeScript configuration uses ES2022 target with strict mode enabled.

```bash
npm run dev  # Watch mode compilation
npm run build # Production build
```

## Dependencies

- TypeScript 5.9+ (dev only)
- OpenClaw (peer dependency)
- Storage & Encryption adapters (provided by Carapace core)
