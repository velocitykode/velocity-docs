---
title: Queue System
description: Background job processing with Velocity's queue system
weight: 30
---

Velocity provides a unified queue interface for background job processing, supporting Redis, database, and in-memory drivers.

## Decision matrix

Pick the helper that matches what you are trying to do:

| Situation | Helper |
|---|---|
| Register a job factory with the type-safe key derived from `T` | `RegisterJob[T](factory)` |
| Pass an arbitrary string key (legacy or non-trivial naming) | `Register(name, factory)` |
| One-shot dispatch | `driver.PushCtx(ctx, job, queue...)` |
| Delayed dispatch | `driver.PushDelayedCtx(ctx, job, delay, queue...)` |
| Long-running job that must abort on shutdown / timeout | implement `HandleCtx(ctx) error` (HandleCtxer) |
| Batch with then / catch / finally | `NewBatch(jobs...).Then(...).Catch(...).Finally(...).Dispatch(ctx, driver)` |
| Register a third-party driver backend | `queue.Drivers().Register(name, factory)` |

All dispatch methods are context-aware so cancellation flows through to the backing store. The `queue` parameter is variadic; omit it to fall back to the job's `OnQueue()` (if implemented) or `"default"`.

## Configuration

Configure the queue driver in your `.env` file:

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

The framework wires a `queue.Driver` into the service container as `s.Queue`. Application code dispatches through that handle; only worker bootstraps construct drivers directly.

## Creating Jobs

Jobs implement the `Job` interface (`Handle() error` + `Failed(error)`). Long-running jobs should additionally implement `HandleCtxer` so cancellation reaches the work.

### `Job` (always required)

```go
package jobs

import "log"

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

`Handle()` is fine for fast, non-blocking work. The worker has no way to interrupt it once it starts; if the per-job timeout fires or the worker is shutting down, the goroutine continues until `Handle` returns on its own.

### `HandleCtxer` (optional, ctx-aware)

When a job implements `HandleCtx(ctx context.Context) error`, the worker calls it instead of `Handle()` and threads its per-job context in. Cancellation of that context (worker shutdown, per-job timeout) and any trace span on the worker context flow into the handler. Jobs that implement only `Handle()` keep working unchanged.

```go
package jobs

import (
    "context"
    "fmt"
    "io"
    "net/http"
)

type FetchJob struct {
    URL string `json:"url"`
}

func (j *FetchJob) Handle() error {
    // Fallback for callers that ignore HandleCtxer; the worker won't use this
    // when HandleCtx is also defined.
    return j.HandleCtx(context.Background())
}

func (j *FetchJob) HandleCtx(ctx context.Context) error {
    req, err := http.NewRequestWithContext(ctx, http.MethodGet, j.URL, nil)
    if err != nil {
        return err
    }

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return err // includes ctx errors when shutdown or timeout fires mid-flight
    }
    defer resp.Body.Close()

    // For inner loops without their own ctx-aware I/O, select on ctx.Done()
    // explicitly so a cancellation aborts promptly.
    chunks := make(chan []byte)
    go streamChunks(resp.Body, chunks)
    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        case b, ok := <-chunks:
            if !ok {
                return nil
            }
            if _, err := io.Discard.Write(b); err != nil {
                return err
            }
        }
    }
}

func (j *FetchJob) Failed(err error) {
    fmt.Printf("fetch %s failed: %v\n", j.URL, err)
}
```

{{< callout type="warning" title="Honor ctx.Done()" >}}
The handler goroutine is **not** forcibly terminated. If `HandleCtx` ignores `ctx` and blocks, the goroutine leaks until the process exits. Implementations MUST observe `ctx.Done()` (via ctx-aware I/O or an explicit `select`) and return promptly when the context cancels. The worker bounds its wait on a misbehaving handler (see [Shutdown semantics](#shutdown-semantics)) so `Stop()` cannot hang, but the leak counts as a bug in the handler.
{{< /callout >}}

## Pushing Jobs

### Immediate dispatch

```go
import (
    "context"
    "github.com/velocitykode/velocity/queue"
)

job := &jobs.EmailJob{
    To:      "user@example.com",
    Subject: "Welcome",
    Body:    "Welcome to our service!",
}

// Push to default queue (resolved from OnQueuer or "default")
err := s.Queue.PushCtx(ctx, job)

// Push to a named queue
err = s.Queue.PushCtx(ctx, job, "emails")
```

### Delayed dispatch

```go
// Push job with 5 minute delay
err := s.Queue.PushDelayedCtx(ctx, job, 5*time.Minute)

// Push to a named queue with delay
err = s.Queue.PushDelayedCtx(ctx, job, 10*time.Minute, "scheduled")
```

## Job Registration

Workers deserialize incoming payloads through a process-global registry. The producer (push) and consumer (decode) keys must agree, or jobs are dropped with `ErrJobNotFound` at runtime.

### `RegisterJob[T]` (preferred)

`RegisterJob[T]` derives the registry key from `T` itself, so producer and consumer stay symmetric by construction:

```go
import (
    "encoding/json"
    "github.com/velocitykode/velocity/queue"
    "myapp/app/jobs"
)

func init() {
    queue.RegisterJob(func(data []byte) (*jobs.EmailJob, error) {
        j := &jobs.EmailJob{}
        return j, json.Unmarshal(data, j)
    })
}
```

`T` is typically a pointer type (e.g. `*EmailJob`), matching how jobs are dispatched (`s.Queue.PushCtx(ctx, &EmailJob{...})`).

### `Register` (deprecated, explicit naming)

`Register(name, factory)` is retained for backward compatibility and for callers who need a custom naming scheme. It accepts any string and silently succeeds at boot, so a typo only surfaces at runtime as `ErrJobNotFound` when a payload arrives. Prefer `RegisterJob[T]` for new code.

```go
queue.Register("EmailJob", func(data []byte) (queue.Job, error) {
    j := &jobs.EmailJob{}
    return j, json.Unmarshal(data, j)
})
```

{{< callout type="info" title="How job type keys are normalized" >}}
Both `RegisterJob` and `Register` route through `normalizeJobType`, which collapses pointer (`*pkg.Foo`), package-qualified (`pkg.Foo`), and bare (`Foo`) forms to the bare type name. That means `Register("*jobs.EmailJob", ...)`, `Register("jobs.EmailJob", ...)`, and `Register("EmailJob", ...)` all produce the same key. Two named types whose unqualified names collide across packages will collide in the registry; keep job type names unique within a process.
{{< /callout >}}

## Processing Jobs

### Worker options

`queue.NewWorker(driver, queueName, handler, opts...)` accepts the following options:

| Option | Signature | Behavior |
|---|---|---|
| `WithConcurrency` | `WithConcurrency(n int)` | Number of pump goroutines. Values `<= 0` are ignored; values above `MaxWorkerConcurrency` (10,000) are clamped. |
| `WithInterval` | `WithInterval(d time.Duration)` | Polling interval between empty-queue checks. Default `100ms`. |
| `WithTimeout` | `WithTimeout(d time.Duration)` | Per-job execution timeout. Default `30s`. Values `<= 0` are ignored. |
| `WithMaxRetries` | `WithMaxRetries(n int)` | Maximum attempts before a job is permanently failed. Default `3`. Overridden per-job by `MaxAttempter`. |
| `WithBackoff` | `WithBackoff(strategy BackoffStrategy)` | Retry delay strategy. Default `ExponentialBackoff(1*time.Second, 5*time.Minute)`. Overridden per-job by `Backoffer`. |
| `WithWorkerLogger` | `WithWorkerLogger(l WorkerLogger)` | Routes worker errors and lifecycle messages through the framework logger. When omitted, `NewWorker` falls back to a stderr logger and emits a one-time warning so worker errors are never invisible. |

Bundled `BackoffStrategy` constructors: `ExponentialBackoff(base, max)`, `LinearBackoff(step, max)`, `FixedBackoff(delay)`.

### Starting workers

```go
import (
    "context"
    "github.com/velocitykode/velocity/queue"
)

// The handler is the fallback for jobs that DON'T implement HandleCtxer.
// Jobs that do implement HandleCtx(ctx) are invoked directly by the worker
// with the per-job ctx; this handler is bypassed for them.
handler := func(j queue.Job) error { return j.Handle() }

w := queue.NewWorker(s.Queue, "emails", handler,
    queue.WithConcurrency(5),
    queue.WithInterval(100*time.Millisecond),
    queue.WithMaxRetries(3),
    queue.WithTimeout(45*time.Second),
    queue.WithBackoff(queue.ExponentialBackoff(2*time.Second, 5*time.Minute)),
    queue.WithWorkerLogger(s.Log),
)

w.Start(ctx)   // idempotent; pump goroutines exit when ctx cancels or Stop() is called
defer w.Stop()
```

`Start` is idempotent: a second call while the worker is already running is a no-op. Pump goroutines exit when the parent context cancels or `Stop()` is invoked.

### Shutdown semantics

The worker treats parent-ctx cancellation, `Stop()`, and per-job timeouts distinctly:

| Trigger | What the handler sees | What the worker does |
|---|---|---|
| Parent `ctx` cancels OR `Stop()` is called | Per-job ctx is cancelled (`HandleCtxer` jobs observe `<-ctx.Done()`); `Handle()`-only jobs keep running until they return | Treats the abort as **clean**: no `Failed()` call, no retry push, no `JobFailed`/`JobRetrying` events. The job stays in flight from the driver's perspective; a future worker (or the driver's shutdown path) reclaims it. |
| `WithTimeout` fires while parent ctx is still live | Per-job ctx is cancelled with `DeadlineExceeded` | Routes through `handleJobFailure`: increments attempt, fires `JobRetrying` or `JobFailed`, requeues with backoff or marks failed. |
| Handler returns a non-ctx error during shutdown | n/a | Logs a `WARN` ("Job error swallowed during worker shutdown") and aborts without routing through `Failed()` so the tear-down path stays clean. The error is diagnosable in logs. |

Per-job timeouts also drain the detached handler goroutine. When `WithTimeout` fires (or `Stop()` propagates), the worker waits up to ~5s for the goroutine to observe `ctx.Done()` and unwind. If the handler ignores ctx and blocks past that ceiling, the worker logs a `WARN` ("Handler goroutine did not return after ctx cancellation; leaking") and lets `Stop()` complete; the rogue goroutine leaks until the process exits. This bound exists so a misbehaving handler can't hang shutdown forever.

Practical implications:

- A `HandleCtxer` job that gets cancelled by `Stop()` and returns `ctx.Err()` is **not** a failure. It will be processed again next time a worker picks it up.
- A `Handle()`-only job already running when `Stop()` is called runs to completion; the worker waits for the pump goroutines to drain. Long-running `Handle()` work blocks shutdown.
- Per-job timeouts (`WithTimeout`) **are** real failures and consume retry budget. Reach for `HandleCtxer` if you want the timeout to actually interrupt the work rather than just mark it failed in the background.

## Retry control

Three optional interfaces let a job tune retry behavior without touching the global worker config.

### `MaxAttempter` (per-job retry budget)

```go
type MaxAttempter interface {
    MaxAttempts() int
}
```

Implementing `MaxAttempts()` overrides the worker's `WithMaxRetries` for this job type only. Useful when most jobs should retry 3 times but a slow webhook should retry 10.

```go
func (j *WebhookJob) MaxAttempts() int { return 10 }
```

### `Backoffer` (per-attempt delay schedule)

```go
type Backoffer interface {
    Backoff() []time.Duration
}
```

Returns an explicit per-attempt delay slice. The last value is reused for any attempts beyond the slice length. Use this when transient upstream failures want a tailored backoff curve (fast first retry, then exponential).

```go
func (j *WebhookJob) Backoff() []time.Duration {
    return []time.Duration{
        1 * time.Second,
        5 * time.Second,
        30 * time.Second,
        2 * time.Minute,
    }
}
```

### `RetryDecider` (opt out of retries for specific errors)

```go
type RetryDecider interface {
    ShouldRetry(err error) bool
}
```

Returning `false` permanently fails the job on this error without consuming further attempts. Use this for non-transient failures (validation errors, 4xx upstream responses) that retry cannot fix.

### `OnQueuer` and `Identifiable`

Two more optional interfaces round out the set:

- `OnQueuer.OnQueue() string`: declares a default queue name; used when the caller does not pass one to `PushCtx`.
- `Identifiable.JobID() string`: provides a stable key for attempt tracking across serialization boundaries (Redis, database). Without it the worker falls back to pointer identity, which only works on the memory driver.

## Batches

`NewBatch` builds a fluent group dispatch with then / catch / finally callbacks:

```go
batch, err := queue.NewBatch(
    &jobs.EmailJob{To: "a@example.com"},
    &jobs.EmailJob{To: "b@example.com"},
).
    Then(func(b *queue.Batch) {
        log.Printf("batch %s: all %d jobs succeeded", b.ID(), b.TotalJobs())
    }).
    Catch(func(b *queue.Batch, err error) {
        log.Printf("batch %s: first failure %v", b.ID(), err)
    }).
    Finally(func(b *queue.Batch) {
        log.Printf("batch %s: %d completed, %d failed", b.ID(), b.CompletedJobs(), b.FailedJobs())
    }).
    AllowFailures().
    OnQueue("emails").
    Dispatch(ctx, s.Queue)
```

`Then` fires only on full success. `Catch` fires once on the first failure. `Finally` always fires when the batch is finished. By default a single failure cancels the batch; opt into best-effort processing with `AllowFailures()`. Look up an active batch with `queue.FindBatch(id)`.

For per-job batch participation implement the `Batchable` interface (`GetBatchID() / SetBatchID(id)`); `Dispatch` will set the batch ID on every job that implements it.

## Queue Management

```go
size, err := s.Queue.Size("emails")     // number of jobs waiting
err = s.Queue.Clear("failed")            // remove every job from a queue
err = s.Queue.Shutdown(ctx)              // drain in-flight work, honor ctx deadline
```

## Driver-specific notes

### Memory driver
- Fast, in-memory processing
- Perfect for development and testing
- Jobs are lost on restart
- Automatic delayed job processing via internal heap

### Redis driver
- Persistent job storage
- Distributed processing
- Lists for ready queues, sorted sets for delayed jobs

### Database driver
- Transactional dispatch (push inside a `*sql.Tx` works without a sidecar table)
- Row-level locking for concurrent workers
- Failed-job tracking via the configured `QUEUE_FAILED_TABLE`

Construct drivers directly when wiring outside the framework's bootstrap:

```go
d := queue.NewMemoryDriver()
// or
d, err := queue.NewQueue(queue.QueueConfig{Driver: "redis", Redis: redisCfg})
```

### Registering a third-party driver

The built-in drivers (`memory`, `redis`, `database`) self-register through Velocity's unified driver registry. Third-party backends plug in the same way: call `queue.Drivers().Register(name, factory)` from your driver package's `init()` and the name resolves through `queue.NewQueue` / `queue.NewQueueWithContext` like any built-in.

```go
package kafkaqueue

import (
    "context"

    "github.com/velocitykode/velocity/queue"
)

func init() {
    queue.Drivers().Register("kafka", func(ctx context.Context, cfg queue.QueueConfig) (queue.Driver, error) {
        return newKafkaDriver(ctx, cfg)
    })
}
```

```go
// app wiring
import _ "example.com/kafkaqueue" // pulls in the init() that registers "kafka"

d, err := queue.NewQueueWithContext(ctx, queue.QueueConfig{Driver: "kafka"})
```

Setting `QUEUE_DRIVER=kafka` in `.env` then routes the framework's bootstrap through the registered factory. See [Driver Registry](/docs/advanced/driver-registry/) for the registry contract shared with cache, storage, and other subsystems.

## Recipe: retry only on transient errors

**When:** a job calls a flaky upstream API where 5xx responses are worth retrying but 4xx are not.

**Code:**

```go
type WebhookJob struct {
    URL  string `json:"url"`
    Body []byte `json:"body"`
}

func (j *WebhookJob) Handle() error { /* POST to j.URL */ }
func (j *WebhookJob) Failed(err error) { /* persist for inspection */ }

// Per-job retry budget
func (j *WebhookJob) MaxAttempts() int { return 8 }

// Per-attempt delays; last value reused beyond slice length
func (j *WebhookJob) Backoff() []time.Duration {
    return []time.Duration{
        1 * time.Second, 5 * time.Second, 15 * time.Second,
        1 * time.Minute, 5 * time.Minute,
    }
}

// Skip retries for non-transient failures
func (j *WebhookJob) ShouldRetry(err error) bool {
    var httpErr *upstreamHTTPError
    if errors.As(err, &httpErr) && httpErr.StatusCode >= 400 && httpErr.StatusCode < 500 {
        return false
    }
    return true
}
```

**Why this shape:** `MaxAttempter` and `Backoffer` keep retry policy on the job type rather than scattered across worker configs. `RetryDecider` short-circuits the retry loop for errors retrying cannot fix, conserving the attempt budget.

## Best Practices

1. **Job design**: keep jobs small and focused on a single task.
2. **Idempotency**: design `Handle()` / `HandleCtx()` to be safe to retry; uniqueness keys in upstream calls are cheaper than careful retry logic.
3. **Reach for `HandleCtxer` for any I/O or long loop**: ctx-aware I/O (`http.NewRequestWithContext`, `db.QueryContext`, channel receives in a `select`) is the difference between a job that aborts cleanly on shutdown and a goroutine that leaks.
4. **Use `RegisterJob[T]`**: string keys are typo footguns surfaced only at runtime.
5. **Always set `WithWorkerLogger`**: the stderr fallback exists so errors are never silent, but production workers should route through the framework logger.
6. **Graceful shutdown**: call `Stop()` (or cancel the parent context) so pump goroutines drain in-flight jobs. Shutdown-cancelled jobs are not retried or marked failed; a future worker re-picks them from the driver.
7. **Register before starting workers**: late registrations work, but a job that arrives before its handler is registered fails with `ErrJobNotFound`.

## Related

- [Events](/docs/advanced/events/) - in-process pub/sub; pair async listeners with the queue when work must survive restarts
- [Mail](/docs/advanced/mail/) - outbound email is a classic queue payload to keep request latency low
- [Notifications](/docs/advanced/notifications/) - multi-channel delivery that typically dispatches through queue jobs
- [Async](/docs/core/async/) - fire-and-forget for in-process work; reach for the queue when durability matters
- [Driver Registry](/docs/advanced/driver-registry/) - the registry contract `queue.Drivers()` is built on, shared with cache and storage
