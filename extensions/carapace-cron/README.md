# Carapace Cron Extension

Scheduled task execution for Carapace agents. This extension provides robust cron job management, S3-backed persistence, and graceful error handling.

## Features

- **Cron Expression Parsing**: Full cron syntax support via `cron-parser`
- **S3 Job Persistence**: Jobs stored in S3 per user with JSON serialization
- **Execution Management**: Timeout handling, concurrency control, and retry policies
- **Error Handling**: Graceful failure recovery with exponential backoff
- **Channel Integration**: Results sent to configured channels
- **Timezone Support**: Timezone-aware job scheduling

## Architecture

```
carapace-cron/
  index.ts              # Plugin entry point & gateway methods
  src/
    types.ts            # Type definitions
    scheduler.ts        # Cron job scheduling engine
    job-store.ts        # S3-backed job persistence
    executor.ts         # Job execution and result handling
```

## Gateway Methods

### carapace.cron.list
List all cron jobs for a user.

**Request:**
```json
{
  "method": "carapace.cron.list",
  "params": ["user-id"]
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "job_123456789_abc123",
      "userId": "user-id",
      "name": "Daily Report",
      "description": "Generate daily reports",
      "cronExpression": "0 9 * * *",
      "command": "https://api.example.com/daily-report",
      "channelId": "channel-123",
      "enabled": true,
      "createdAt": "2026-01-30T12:00:00Z",
      "updatedAt": "2026-01-30T12:00:00Z",
      "executionCount": 5,
      "failureCount": 0,
      "nextExecutionAt": "2026-01-31T09:00:00Z",
      "timezone": "UTC"
    }
  ]
}
```

### carapace.cron.create
Create a new scheduled job.

**Request:**
```json
{
  "method": "carapace.cron.create",
  "params": [
    {
      "name": "Daily Report",
      "description": "Generate daily reports at 9 AM",
      "cronExpression": "0 9 * * *",
      "command": "https://api.example.com/daily-report",
      "channelId": "channel-123",
      "timezone": "America/New_York"
    },
    "user-id"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "job_123456789_abc123",
    "userId": "user-id",
    "name": "Daily Report",
    "description": "Generate daily reports at 9 AM",
    "cronExpression": "0 9 * * *",
    "command": "https://api.example.com/daily-report",
    "channelId": "channel-123",
    "enabled": true,
    "createdAt": "2026-01-30T12:00:00Z",
    "updatedAt": "2026-01-30T12:00:00Z",
    "executionCount": 0,
    "failureCount": 0,
    "timezone": "America/New_York"
  }
}
```

### carapace.cron.get
Get details of a specific job.

**Request:**
```json
{
  "method": "carapace.cron.get",
  "params": ["job-id"]
}
```

### carapace.cron.update
Update job configuration.

**Request:**
```json
{
  "method": "carapace.cron.update",
  "params": [
    "job-id",
    {
      "name": "Updated Daily Report",
      "cronExpression": "0 10 * * *",
      "timezone": "UTC"
    }
  ]
}
```

**Updatable Fields:**
- `name`
- `description`
- `cronExpression`
- `command`
- `timezone`

### carapace.cron.pause
Pause a scheduled job.

**Request:**
```json
{
  "method": "carapace.cron.pause",
  "params": ["job-id"]
}
```

### carapace.cron.resume
Resume a paused job.

**Request:**
```json
{
  "method": "carapace.cron.resume",
  "params": ["job-id"]
}
```

### carapace.cron.delete
Delete a job.

**Request:**
```json
{
  "method": "carapace.cron.delete",
  "params": ["job-id"]
}
```

### carapace.cron.status
Get scheduling status for a user.

**Request:**
```json
{
  "method": "carapace.cron.status",
  "params": ["user-id"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalJobs": 5,
    "enabledJobs": 4,
    "scheduledJobs": 4,
    "activeExecutions": 1
  }
}
```

## Cron Expression Examples

- `0 9 * * *` - 9:00 AM every day
- `0 0 * * 0` - Midnight every Sunday
- `0 */4 * * *` - Every 4 hours
- `30 2 * * 1-5` - 2:30 AM on weekdays
- `0 0 1 * *` - First day of every month

## Command Types

### HTTP Requests
```
https://api.example.com/webhook
```
Executes an HTTP GET/POST request and returns response text.

### Agent Commands
```
agent: generate-report --daily
```
Triggers an agent command for execution.

### Shell Commands
```
echo "Job executed"
```
Limited to whitelisted patterns for security (echo, date, pwd, whoami).

## Configuration

Jobs are configured during creation with these options:

- **cronExpression**: Valid POSIX cron expression
- **command**: URL, agent command, or shell command
- **channelId**: Where to send execution results
- **timezone**: IANA timezone (optional, defaults to UTC)

## Execution Behavior

- **Timeout**: 5 minutes per job (configurable)
- **Concurrency**: Max 5 concurrent executions
- **Retries**: Up to 3 retries with 5s exponential backoff
- **Notifications**: Results sent to configured channel
- **Persistence**: Job state saved to S3

## Error Handling

- Failed jobs emit error messages to the channel
- Automatic retry with exponential backoff
- After max retries, job reschedules for next normal execution
- Execution times tracked for monitoring

## Storage

Jobs are persisted in S3 under:
```
s3://bucket/cron/jobs/{jobId}.json
```

Each job file contains:
- Job configuration
- Execution metadata
- Last error/success details
- Next scheduled execution time
