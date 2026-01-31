# Carapace Notifications Extension

Multi-channel notification system for Carapace with offline queuing, quiet hours, and preference management.

## Features

- **Multi-channel delivery**: Send notifications to Discord, Slack, Telegram, email, or custom webhooks
- **Offline queuing**: Automatically queue notifications when users are offline and deliver on reconnect
- **Notification types**: Command blocked, approval required, task complete, and system alerts
- **Quiet hours**: Configure per-user quiet hours to minimize interruptions
- **Severity levels**: Critical, high, medium, and low severity classifications
- **User preferences**: Each user controls their notification channels, types, and schedule
- **Production-ready**: S3 storage for persistence, error handling, and logging

## Installation

```bash
npm install
npm run build
```

## Usage

### Gateway Methods

#### Send Notification
```javascript
api.callGatewayMethod("carapace.notifications.send", {
  userId: "user123",
  title: "Command Blocked",
  message: "SSH command blocked for security",
  type: "command_blocked",
  severity: "high",
  channelId: "discord-channel-id" // optional
});
```

#### Get User Preferences
```javascript
api.callGatewayMethod("carapace.notifications.preferences.get", {
  userId: "user123"
});
```

#### Update User Preferences
```javascript
api.callGatewayMethod("carapace.notifications.preferences.set", {
  userId: "user123",
  enabledChannels: ["discord", "slack"],
  quietHoursEnabled: true,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  timezone: "America/New_York"
});
```

#### Enable/Disable Channel
```javascript
// Enable channel
api.callGatewayMethod("carapace.notifications.channels.enable", {
  userId: "user123",
  channel: "slack"
});

// Disable channel
api.callGatewayMethod("carapace.notifications.channels.disable", {
  userId: "user123",
  channel: "telegram"
});
```

#### List Queued Notifications
```javascript
api.callGatewayMethod("carapace.notifications.queue.list", {
  userId: "user123"
});
```

#### Clear Queued Notifications
```javascript
api.callGatewayMethod("carapace.notifications.queue.clear", {
  userId: "user123"
});
```

#### Deliver Queued Notifications
```javascript
// Called when user comes online
api.callGatewayMethod("carapace.notifications.queue.deliver", {
  userId: "user123"
});
```

## Notification Types

- `command_blocked`: Security-related command rejection
- `approval_required`: Manual approval needed for an action
- `task_complete`: Scheduled task completion
- `system_alert`: General system notifications

## Severity Levels

- `critical`: Bypasses quiet hours
- `high`: Important notifications
- `medium`: Standard notifications
- `low`: Informational notifications

## Integration Points

### Security Extension Hook
Automatically notifies when commands are blocked:
```typescript
api.on("carapace.security.command_blocked", (event) => {
  // Sends notification automatically
});
```

### Cron Extension Hook
Notifies on job completion:
```typescript
api.on("carapace.cron.job_completed", (event) => {
  // Sends notification automatically
});
```

### User Online Hook
Delivers queued notifications when user comes online:
```typescript
api.on("user.online", (event) => {
  // Delivers all pending notifications
});
```

## Configuration

Preferences stored per user with:
- Enabled notification channels (Discord, Slack, Telegram, etc.)
- Quiet hours (start/end time and timezone)
- Notification type preferences
- User timezone for time calculations

## Storage

All data is persisted in S3 storage:
- User preferences: `notifications:prefs:{userId}`
- Notification queues: `notifications:queue:{userId}`
- Queue indices: `notifications:queue:index:{userId}`

Queue entries expire after 7 days (configurable).

## Architecture

### NotificationService
Core service handling notification delivery and queuing. Routes to user's preferred channels.

### PreferencesManager
Manages user notification preferences with CRUD operations and validation.

### NotificationQueue
Manages offline notification queue with expiration and cleanup.

### Hooks
Event listeners for:
- Security events (blocked commands)
- Cron job completion
- System alerts
- User coming online

## Error Handling

- Failed deliveries are automatically queued if not in quiet hours
- Critical severity notifications skip quiet hours
- Queue respects max size (100) and retention period (7 days)
- All errors logged for debugging
