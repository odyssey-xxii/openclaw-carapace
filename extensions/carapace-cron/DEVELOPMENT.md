# Development Guide - Carapace Cron Extension

## Building

```bash
npm run build      # Compile TypeScript
npm run dev        # Watch mode
npm install        # Install dependencies
```

## Project Structure

```
src/
  types.ts         # Core interfaces (CronJob, JobStore, ExecutionContext, etc.)
  scheduler.ts     # CronScheduler: parses cron expressions, manages execution timing
  job-store.ts     # S3JobStore: persists jobs to S3, handles serialization
  executor.ts      # Executor: runs commands, handles timeouts, sends notifications
index.ts           # Plugin initialization and gateway method registration
```

## Key Components

### Scheduler (src/scheduler.ts)
- Parses cron expressions using `cron-parser`
- Schedules next execution via setTimeout
- Enforces concurrency limits (max 5 concurrent by default)
- Handles job retries with exponential backoff
- Tracks execution metadata

### Job Store (src/job-store.ts)
- Persists jobs to S3 with JSON serialization
- In-memory cache for frequently accessed jobs
- Supports load/save/delete/update operations
- Serializes Date objects for JSON storage

### Executor (src/executor.ts)
- Executes different command types: HTTP, agent, shell
- Implements timeout handling (5 minutes default)
- Sends results to channel via gateway
- Returns execution metadata (success, output, time)

### Plugin Registration (index.ts)
Registers these gateway methods:
- `carapace.cron.list` - List user's jobs
- `carapace.cron.create` - Create new job
- `carapace.cron.get` - Get job details
- `carapace.cron.update` - Update job configuration
- `carapace.cron.delete` - Delete job
- `carapace.cron.pause` - Disable job
- `carapace.cron.resume` - Enable job
- `carapace.cron.status` - Get scheduling stats

## Integration Points

The extension integrates with:
1. **Gateway**: Registers methods, sends channel messages
2. **Storage**: Uses S3 via storage adapter
3. **Cron Parser**: `cron-parser` package for expression validation
4. **Executor**: Runs commands and reports results

## Testing Checklist

- [ ] Job creation with valid/invalid cron expressions
- [ ] Job scheduling and execution
- [ ] Timeout handling
- [ ] Retry logic with backoff
- [ ] S3 persistence and loading
- [ ] Channel notification
- [ ] Pause/resume functionality
- [ ] Concurrent execution limits
- [ ] Timezone handling
