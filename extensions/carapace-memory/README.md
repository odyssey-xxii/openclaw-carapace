# Carapace Memory Extension

Persistent memory and session context management for Carapace agents.

## Features

- **S3-backed Memory Storage**: Store and retrieve persistent memory entries per user
- **Session Context Management**: Automatically load/save agent context across sessions
- **Message Compaction**: Automatic compaction of long message histories to manage storage
- **Gateway Methods**: Simple API for memory operations
- **Lifecycle Hooks**: Auto-load context at agent start, auto-save at session end

## Configuration

Set environment variables or pass config to the extension:

- `CARAPACE_MEMORY_BUCKET`: S3 bucket for storage (default: `carapace-memory`)
- `CARAPACE_MEMORY_PREFIX`: S3 key prefix (default: `users`)
- `AWS_REGION`: AWS region (default: `us-east-1`)

## Gateway Methods

### carapace.memory.list
List all memory entries for a user.
```
Args: [userId: string]
Returns: { items: MemoryEntry[], count: number }
```

### carapace.memory.get
Retrieve a specific memory entry.
```
Args: [userId: string, memoryName: string]
Returns: { success: boolean, data?: Record<string, unknown>, error?: string }
```

### carapace.memory.set
Store a memory entry.
```
Args: [userId: string, memoryName: string, content: Record<string, unknown>]
Returns: { success: boolean, id?: string, error?: string }
```

### carapace.memory.delete
Delete a memory entry.
```
Args: [userId: string, memoryName: string]
Returns: { success: boolean, error?: string }
```

## Hooks

- `before_agent_start`: Loads session context when agent starts
- `session_end`: Saves session context when session ends

## S3 Storage Structure

Memory entries are stored at: `users/{userId}/memory/{name}.json`

Session contexts are stored at: `users/{userId}/memory/session:{sessionId}.json`

## Installation

```bash
npm install
npm run build
```

## Production Readiness

- Full TypeScript strict mode
- S3 SDK with proper error handling
- Graceful degradation on missing S3 buckets
- Memory compaction to prevent unbounded growth
- Metadata tracking for all entries
- AWS SDK v3 with proper resource cleanup
