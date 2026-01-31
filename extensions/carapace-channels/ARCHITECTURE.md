# Carapace Channels Extension - Architecture

## System Design

```
┌─────────────────────────────────────────────────────────────┐
│              Carapace Web Dashboard                         │
├─────────────────────────────────────────────────────────────┤
│  OAuth Flows (Discord/Slack)                               │
│  Token Input Forms (Telegram)                              │
│  QR Code Display (WhatsApp)                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
         OpenClaw Gateway RPC Methods
         carapace.{channel}.{action}
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│         Carapace Channels Extension                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  registerChannelsExtension(context)                        │
│    ├─ TelegramBridge                                       │
│    ├─ DiscordBridge                                        │
│    ├─ SlackBridge                                          │
│    └─ WhatsAppBridgeImpl                                    │
│                                                             │
│  Each bridge implements:                                   │
│    - connect(userId, credentials)                          │
│    - disconnect(userId)                                    │
│    - status(userId)                                        │
│    - [WhatsApp only] qrStart/qrWait                        │
│                                                             │
└─────────────────────┬──────────────────────────────────────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
    ┌─────────┐  ┌─────────┐  ┌──────────┐
    │ Storage │  │Encryption   Validation│
    │ Adapter │  │ Adapter     │         │
    └─────────┘  └─────────┘  └──────────┘
         │           │            │
         ▼           ▼            ▼
    ┌──────────────────────────────────────┐
    │  S3/Storage     Crypto         APIs   │
    │  Encrypted creds              Telegram│
    │  Status metadata              Discord │
    │  QR Sessions                  Slack   │
    └──────────────────────────────────────┘
```

## Module Organization

### Entry Point: `index.ts`
- Exports `registerChannelsExtension()` function
- Sets up gateway method bindings for all channels
- Initializes bridge instances with storage/encryption adapters
- Provides type definitions for `OpenClawGateway` and `CarapaceExtensionContext`

### Type Definitions: `src/types.ts`
- `ChannelBridge` - Base interface for all channel bridges
- `WhatsAppBridge` - Extended interface with QR-specific methods
- `ChannelCredentials` - Flexible credential object
- `ChannelStatus` - Consistent status response format
- `QRSession` - WhatsApp QR code session data
- `StorageAdapter` - Abstract storage interface
- `EncryptionAdapter` - Abstract encryption interface
- `ChannelException` - Typed error class

### Bridge Implementations

#### `src/telegram-bridge.ts` - TelegramBridge
- Validates bot token format: `{id}:{token}`
- Validates token liveness via Telegram Bot API `/getMe`
- Extracts bot username for metadata
- Stores encrypted token in S3
- No refresh logic (tokens don't expire)

#### `src/discord-bridge.ts` - DiscordBridge
- Validates OAuth token via Discord `/api/users/@me`
- Extracts user ID and username
- Stores encrypted token in S3
- Note: Doesn't handle token refresh (scope: dashboard integration only)

#### `src/slack-bridge.ts` - SlackBridge
- Validates OAuth token via Slack `/api/auth.test`
- Extracts team ID, team name, and user ID
- Stores encrypted token in S3
- Workspace-level integration (not per-user token)

#### `src/whatsapp-bridge.ts` - WhatsAppBridgeImpl
- Generates UUID-based session IDs: `qr_{random}`
- Creates data URI base64-encoded SVG QR codes
- Implements polling-based QR scan detection
- 5-minute default session TTL
- Returns session status: pending → scanned → connected
- Stores session JSON with phone number when connected

## Data Flow

### Connection Flow

```
Dashboard Input
    │
    ▼
Gateway Method Call
  carapace.{channel}.connect(userId, credentials)
    │
    ▼
Bridge.connect()
    ├─ Validate credentials format
    ├─ Call external API validation
    ├─ Encrypt credentials
    ├─ Store in S3
    └─ Return ChannelStatus
    │
    ▼
Response to Dashboard
```

### Status Flow

```
Dashboard Request
    │
    ▼
Gateway Method Call
  carapace.{channel}.status(userId)
    │
    ▼
Bridge.status()
    ├─ Fetch status from S3
    ├─ Parse JSON
    └─ Return ChannelStatus
    │
    ▼
Dashboard Display
```

### WhatsApp QR Flow

```
User Initiates QR Pairing
    │
    ▼
carapace.whatsapp.qr.start(userId)
    │
    ├─ Generate sessionId
    ├─ Create SVG QR code
    └─ Store in S3 with 5-min TTL
    │
    ▼
Dashboard Renders QR Code
    │
    ▼
User Scans with WhatsApp Mobile
    │
    ▼
qrWait() Polling Loop (every 1-2s)
    │
    ├─ Check if session marked connected
    ├─ Poll for up to 30s (configurable)
    └─ Return success when connected
    │
    ▼
Dashboard Shows "Connected" Status
```

## Storage Strategy

### Key Patterns

All keys use format: `{channel}:{userId}:{purpose}`

```
telegram:user-id:token     → Encrypted bot token
telegram:user-id:status    → JSON status object

discord:user-id:token      → Encrypted OAuth token
discord:user-id:status     → JSON status object

slack:user-id:token        → Encrypted OAuth token
slack:user-id:status       → JSON status object

whatsapp:user-id:session   → JSON session data
whatsapp:user-id:qr        → JSON QR session (TTL: 300s)
```

### TTL Strategy

- **Credentials**: No TTL (manual disconnect required)
- **Status metadata**: No TTL (persists across sessions)
- **QR sessions**: 5 minutes (auto-cleanup for failed scans)

## Error Handling

### ChannelException Hierarchy

```typescript
ChannelException
├─ INVALID_CREDENTIALS (400) - Missing required field
├─ INVALID_BOT_TOKEN (400) - Token format invalid
├─ INVALID_TOKEN (401) - Token validation failed
├─ INVALID_CREDENTIALS (400) - Missing fields
├─ NO_SESSION (400) - WhatsApp no active session
├─ SESSION_ERROR (500) - Storage parse failure
└─ Custom codes with statusCode and context
```

### Error Context

Each exception includes:
- `code` - Machine-readable error identifier
- `statusCode` - HTTP status code (4xx/5xx)
- `context` - Additional metadata (channel, validation field, etc.)

## Validation Strategy

### Pre-Connection Validation

1. **Credential existence**: Field required check
2. **Format validation**: Regex/pattern matching
3. **Liveness check**: External API call
4. **Metadata extraction**: Username/ID/team info

### Validation APIs

- **Telegram**: `GET /bot{token}/getMe`
- **Discord**: `GET /api/users/@me` (Bearer auth)
- **Slack**: `POST /api/auth.test` (Bearer auth)

## Extensibility Points

### Adding New Channels

1. Create `src/{channel}-bridge.ts` implementing `ChannelBridge`
2. Add type definitions in `src/types.ts` if needed
3. Register methods in `index.ts`:
   ```typescript
   gateway.registerMethod(`carapace.{channel}.connect`, ...)
   gateway.registerMethod(`carapace.{channel}.status`, ...)
   gateway.registerMethod(`carapace.{channel}.disconnect`, ...)
   ```
4. Update README and USAGE.md

### Customizing Storage

Implement `StorageAdapter`:

```typescript
const customStorage: StorageAdapter = {
  async get(key) { /* fetch from DB/cache */ },
  async set(key, value, ttl) { /* persist with TTL */ },
  async delete(key) { /* remove */ },
  async exists(key) { /* check presence */ },
};
```

### Customizing Encryption

Implement `EncryptionAdapter`:

```typescript
const customEncryption: EncryptionAdapter = {
  async encrypt(data) { /* your cipher */ },
  async decrypt(data) { /* your decipher */ },
};
```

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| connect | O(1) + network | Validates + stores credential |
| disconnect | O(1) | Storage deletes only |
| status | O(1) | Single storage read |
| qr.start | O(1) | Generate + store session |
| qr.wait | O(n) | Polls every 1s for timeout |

## Security Considerations

1. **Encryption at rest**: All tokens encrypted before storage
2. **Token isolation**: Per-user namespaced keys
3. **Input validation**: Format checks before storage
4. **No token logging**: Exceptions don't expose credentials
5. **Session expiry**: QR codes expire after 5 minutes
6. **HTTPS only**: All external validation calls use HTTPS
7. **No refresh tokens**: OAuth tokens stored as-is (client handles refresh)

## Testing Strategy

- **Unit tests**: Mock storage/encryption, test bridge logic
- **Integration tests**: Real S3 + validation API calls
- **E2E tests**: Full dashboard → extension flow
- **Mock adapters**: Provided for testing

## Deployment

```bash
npm install      # Install dependencies
npm run build    # Compile TypeScript
npm pack         # Create distributable tarball
# Publish to npm registry or GitHub releases
```

Package includes:
- Compiled `dist/` with types
- `openclaw.plugin.json` metadata
- `package.json` with extension config
- README and usage docs
