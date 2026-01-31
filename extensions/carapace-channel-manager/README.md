# Mahdi Channel Manager

Multi-tenant channel management for Mahdi's shared bot architecture.

## Architecture

### Shared Bot Model

- **Single bot instance** serves all Mahdi users
- **Per-user settings** stored in memory
- **Message-level filtering** based on user's groupPolicy

### Data Flow

```
Message arrives at shared bot
  ↓
Extract platformUserId (Discord user ID, Slack user ID, etc.)
  ↓
Lookup Mahdi userId from platformUserId
  (using UserSettingsManager.findUserIdByPlatformId)
  ↓
Check if authorized (user has connected this channel)
  ↓
Fetch user's groupPolicy from UserSettingsManager
  ↓
Apply groupPolicy filter:
  - If groupPolicy === 'disabled':
    - Guild/channel/group message → BLOCK
    - DM message → ALLOW
  - If groupPolicy === 'open' (premium):
    - All messages → ALLOW
  ↓
Route to user's agent/sandbox
```

## Components

### UserSettingsManager

Stores per-user channel settings in memory:

```typescript
import { UserSettingsManager } from '@mahdi/channel-manager/user-settings.js'

const userSettings = new UserSettingsManager()

// Store settings when user connects
userSettings.setUserSettings(userId, {
  platformUserId: 'discord_user_123',
  groupPolicy: 'disabled',
  connectedAt: new Date(),
})

// Look up Mahdi user by platform user
const mahdiUserId = userSettings.findUserIdByPlatformId('discord_user_123')

// Check groupPolicy
const policy = userSettings.getGroupPolicy(mahdiUserId)

// Check if authorized
const isAuthorized = userSettings.isAuthorized('discord_user_123')
```

## Message Filtering Implementation

### Discord

In `packages/moltbot/src/discord/monitor/message-handler.ts` (or equivalent):

```typescript
// At the start of message handling
const platformUserId = message.author.id
const mahdiUserId = api.mahdiDiscordSettings.findUserIdByPlatformId(platformUserId)

if (!mahdiUserId) {
  // Unauthorized - this Discord user hasn't connected Mahdi
  return
}

const groupPolicy = api.mahdiDiscordSettings.getGroupPolicy(mahdiUserId)

// Check if message is from guild (not DM)
const isGuildMessage = message.channel.type === ChannelType.GuildText

if (groupPolicy === 'disabled' && isGuildMessage) {
  // Block guild messages when groupPolicy is disabled
  api.logger.info(`Blocked guild message from ${platformUserId} (DM-only mode)`)
  return
}

// Proceed with routing to user's agent
```

### Slack

In `packages/moltbot/src/slack/monitor/message-handler.ts`:

```typescript
const platformUserId = event.user
const mahdiUserId = api.mahdiSlackSettings.findUserIdByPlatformId(platformUserId)

if (!mahdiUserId) {
  return // Unauthorized
}

const groupPolicy = api.mahdiSlackSettings.getGroupPolicy(mahdiUserId)
const isDirectMessage = event.channel_type === 'im'

if (groupPolicy === 'disabled' && !isDirectMessage) {
  api.logger.info(`Blocked channel message from ${platformUserId} (DM-only mode)`)
  return
}
```

### Telegram

In `packages/moltbot/src/telegram/monitor/message-handler.ts`:

```typescript
const platformUserId = String(message.from.id)
const mahdiUserId = api.mahdiTelegramSettings.findUserIdByPlatformId(platformUserId)

if (!mahdiUserId) {
  return // Unauthorized
}

const groupPolicy = api.mahdiTelegramSettings.getGroupPolicy(mahdiUserId)
const isPrivateChat = message.chat.type === 'private'

if (groupPolicy === 'disabled' && !isPrivateChat) {
  api.logger.info(`Blocked group message from ${platformUserId} (DM-only mode)`)
  return
}
```

### WhatsApp

In `packages/moltbot/src/whatsapp/monitor/message-handler.ts`:

```typescript
const platformUserId = message.key.remoteJid
const mahdiUserId = api.mahdiWhatsAppSettings.findUserIdByPlatformId(platformUserId)

if (!mahdiUserId) {
  return // Unauthorized
}

const groupPolicy = api.mahdiWhatsAppSettings.getGroupPolicy(mahdiUserId)
const isGroupMessage = message.key.remoteJid?.endsWith('@g.us')

if (groupPolicy === 'disabled' && isGroupMessage) {
  api.logger.info(`Blocked group message from ${platformUserId} (DM-only mode)`)
  return
}
```

## Security Model

### Authorization Chain

1. **Platform User ID** (Discord ID, Slack ID, etc.)
2. **Mahdi User ID** (Clerk user ID)
3. **Group Policy** (disabled or open)
4. **Agent/Sandbox** (isolated per Mahdi user)

### Key Guarantees

- ✅ Each Mahdi user has their own settings
- ✅ Each Mahdi user has their own agent context
- ✅ Each Mahdi user has their own E2B sandbox
- ✅ Platform users can't access other Mahdi users' agents
- ✅ Group messages blocked by default (DM-only mode)
- ✅ Premium users can enable group messages

## Future Enhancements

### Premium Features

```typescript
// Premium users can enable group messages
userSettings.setUserSettings(userId, {
  platformUserId: 'discord_123',
  groupPolicy: 'open', // Allow guild messages
  connectedAt: new Date(),
})
```

### Fine-Grained Control

```typescript
// Future: per-channel/per-guild allowlists
interface AdvancedSettings extends UserChannelSettings {
  allowedGuilds?: string[] // Discord
  allowedChannels?: string[] // Slack
  allowedGroups?: string[] // WhatsApp/Telegram
}
```

## Testing

```bash
# Start gateway
cd packages/moltbot
moltbot gateway run

# Connect a channel via web app
# Send a DM → should work
# Send a guild/group message → should be blocked (groupPolicy: disabled)

# Check logs for:
# "Blocked guild message from X (DM-only mode)"
```
