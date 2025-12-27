---
title: Queue System
description: Background job processing with Velocity's queue system
weight: 30
---

Velocity provides a unified queue interface for background job processing, supporting multiple drivers like Redis, database, and in-memory queues.

## Configuration

Configure your queue driver in the `.env` file:

```bash
# Queue configuration
QUEUE_DRIVER=memory  # Options: memory, redis, database

# Redis settings (when using redis driver)
QUEUE_REDIS_HOST=localhost
QUEUE_REDIS_PORT=6379
QUEUE_REDIS_DB=0
QUEUE_REDIS_PASSWORD=

# Database settings (when using database driver)
QUEUE_TABLE=jobs
QUEUE_FAILED_TABLE=failed_jobs
```

## Creating Jobs

Jobs are simple structs that implement the `Job` interface:

```go
package jobs

import (
    "log"
)

type EmailJob struct {
    To      string `json:"to"`
    Subject string `json:"subject"`
    Body    string `json:"body"`
}

func (e *EmailJob) Handle() error {
    log.Printf("Sending email to: %s", e.To)
    // Send email logic here
    return nil
}

func (e *EmailJob) Failed(err error) {
    log.Printf("Failed to send email to %s: %v", e.To, err)
}
```

## Pushing Jobs to Queue

### Basic Usage

```go
import "github.com/velocitykode/velocity/pkg/queue"

// Push to default queue
job := &EmailJob{
    To:      "user@example.com",
    Subject: "Welcome",
    Body:    "Welcome to our service!",
}
queue.Push(job)

// Push to specific queue
queue.Push(job, "emails")
```

### Delayed Jobs

```go
// Push job with 5 minute delay
queue.Later(5*time.Minute, job)

// Push to specific queue with delay
queue.Later(10*time.Minute, job, "scheduled")
```

## Processing Jobs

### Starting Workers

```go
// Start a worker for the default queue
worker := queue.Work("default", func(job queue.Job) error {
    return job.Handle()
})

// Configure worker options
worker := queue.Work("emails", func(job queue.Job) error {
    return job.Handle()
},
    queue.WithConcurrency(5),           // 5 concurrent workers
    queue.WithInterval(100*time.Millisecond), // Poll interval
    queue.WithMaxRetries(3),            // Retry failed jobs
)

// Gracefully stop workers
worker.Stop()
```

### Job Registration

For proper deserialization, register your job types:

```go
func init() {
    queue.Register("*jobs.EmailJob", func(data []byte) (queue.Job, error) {
        var job jobs.EmailJob
        if err := json.Unmarshal(data, &job); err != nil {
            return nil, err
        }
        return &job, nil
    })
}
```

## Queue Management

### Check Queue Size

```go
size, err := queue.Size("default")
if err != nil {
    log.Printf("Failed to get queue size: %v", err)
}
log.Printf("Queue has %d jobs", size)
```

### Clear Queue

```go
// Clear all jobs from a queue
err := queue.Clear("failed")
if err != nil {
    log.Printf("Failed to clear queue: %v", err)
}
```

## Driver-Specific Features

### Memory Driver
- Fast, in-memory processing
- Perfect for development and testing
- Jobs are lost on restart
- Automatic delayed job processing

### Redis Driver
- Persistent job storage
- Distributed processing support
- Uses Redis lists for queues
- Uses sorted sets for delayed jobs

### Database Driver (Coming Soon)
- Transactional job processing
- Built-in retry logic
- Failed job tracking
- Job history and analytics

## Complete Example

```go
package main

import (
    "log"
    "time"

    "github.com/velocitykode/velocity/pkg/queue"
    "myapp/app/jobs"
)

func main() {
    // Queue auto-initializes from .env

    // Register job types
    queue.Register("*jobs.EmailJob", deserializeEmailJob)
    queue.Register("*jobs.ProcessJob", deserializeProcessJob)

    // Start workers
    emailWorker := queue.Work("emails", processJob,
        queue.WithConcurrency(3))

    defaultWorker := queue.Work("default", processJob,
        queue.WithConcurrency(5))

    // Push some jobs
    for i := 0; i < 10; i++ {
        job := &jobs.EmailJob{
            To:      fmt.Sprintf("user%d@example.com", i),
            Subject: "Newsletter",
            Body:    "Check out our latest updates!",
        }

        if i%2 == 0 {
            // Immediate processing
            queue.Push(job, "emails")
        } else {
            // Delayed processing
            queue.Later(time.Duration(i)*time.Minute, job, "emails")
        }
    }

    // Monitor queue sizes
    go func() {
        for {
            size, _ := queue.Size("emails")
            log.Printf("Email queue size: %d", size)
            time.Sleep(10 * time.Second)
        }
    }()

    // Run until interrupted
    select {}
}

func processJob(job queue.Job) error {
    log.Printf("Processing job: %T", job)
    return job.Handle()
}
```

## Best Practices

1. **Job Design**: Keep jobs small and focused on a single task
2. **Error Handling**: Implement proper error handling in the `Handle()` method
3. **Idempotency**: Design jobs to be idempotent (safe to retry)
4. **Monitoring**: Monitor queue sizes and failed jobs
5. **Graceful Shutdown**: Always stop workers gracefully
6. **Job Registration**: Register all job types before starting workers

## Testing

```go
func TestEmailJob(t *testing.T) {
    // Use memory driver for testing
    q := queue.NewMemoryQueue()
    queue.SetDefault(q)

    job := &EmailJob{
        To:      "test@example.com",
        Subject: "Test",
        Body:    "Test email",
    }

    // Push job
    err := queue.Push(job)
    assert.NoError(t, err)

    // Check queue size
    size, _ := queue.Size("default")
    assert.Equal(t, int64(1), size)

    // Process job
    poppedJob, err := queue.Pop("default")
    assert.NoError(t, err)
    assert.NotNil(t, poppedJob)

    // Execute job
    err = poppedJob.Handle()
    assert.NoError(t, err)
}
```