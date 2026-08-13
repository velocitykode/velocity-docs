---
title: "Task Scheduler"
description: Schedule recurring tasks with Velocity's fluent scheduler for cron jobs, daily tasks, and periodic work.
weight: 50
---

Velocity provides a task scheduler for running recurring jobs with an expressive, fluent API.

## Decision matrix

Pick the registration helper that matches the closure shape and naming you need:

| Situation | Helper |
|---|---|
| Closure has no error to report; OK with panic-only `OnFailure` | `Call(fn).Daily()` |
| Closure returns an error you want `OnFailure` to see | `CallE(fn).Daily().OnFailure(handler)` |
| Need a custom job name (not the auto-derived closure name) | `Named(name, fn)` / `NamedE(name, fn)` |
| Register jobs on the app's scheduler | `v.Schedule(func(s scheduler.TaskScheduler) { ... })` |
| Register jobs from a module | `Schedule(s scheduler.TaskScheduler)` on the module |
| Run scheduler alongside HTTP serve | `velocity.WithSchedulerInProcess()` |
| Run scheduler in separate process | `vel schedule work` CLI |

## Quick Start

{{< tabs items="Basic Scheduling,Daily Tasks,Complex Schedules" >}}

{{< tab >}}
```go
import (
    "github.com/velocitykode/velocity"
    "github.com/velocitykode/velocity/scheduler"
)

func main() {
    v, err := velocity.New(velocity.WithSchedulerInProcess())
    if err != nil {
        panic(err)
    }

    v.Schedule(func(s scheduler.TaskScheduler) {
        // Run every minute
        s.Named("heartbeat", func() {
            v.Log.Info("Task running every minute")
        }).EveryMinute()

        // Run every hour
        s.Named("hourly-rollup", func() {
            rollUpMetrics()
        }).Hourly()
    })

    if err := v.Serve(); err != nil {
        panic(err)
    }
}
```
{{< /tab >}}

{{< tab >}}
```go
import (
    "github.com/velocitykode/velocity"
    "github.com/velocitykode/velocity/scheduler"
)

func registerJobs(v *velocity.App) {
    v.Schedule(func(s scheduler.TaskScheduler) {
        // Clear cache daily at 2 AM
        s.NamedE("cache-clear", func() error {
            return v.Cache.Flush()
        }).DailyAt("02:00")

        // Backup database daily at 3 AM
        s.NamedE("backup-database", func() error {
            return backupDatabase()
        }).DailyAt("03:00")
    })
}
```
{{< /tab >}}

{{< tab >}}
```go
import (
    "github.com/velocitykode/velocity"
    "github.com/velocitykode/velocity/scheduler"
)

func registerJobs(v *velocity.App) {
    v.Schedule(func(s scheduler.TaskScheduler) {
        // Process jobs every 5 minutes, weekdays only
        s.Named("jobs-process", func() {
            processJobs()
        }).EveryFiveMinutes().
            Weekdays().
            Between("09:00", "18:00")

        // Weekly report on Mondays at 9 AM
        s.Named("report-weekly", func() {
            generateWeeklyReport()
        }).Weekly().
            Mondays().
            At("09:00")
    })
}
```
{{< /tab >}}

{{< /tabs >}}

## The app scheduler

`velocity.New` builds a scheduler during bootstrap and exposes it as
`v.Scheduler`, typed as `scheduler.TaskScheduler`. It arrives pre-configured
from the app: `SetEnv` from `APP_ENV`, `SetLogger` from the framework logger,
`SetTimezone` from `APP_TIMEZONE`, and a cache-backed `Locker` when the
configured cache driver supports locks (Redis today; other drivers fall back
to the in-process `InMemoryLocker` with a warning).

There are two places to register jobs on it:

```go
// 1. The bootstrap callback.
v.Schedule(func(s scheduler.TaskScheduler) {
    s.Named("reports-generate", generateReports).DailyAt("06:00")
})

// 2. A module that implements the ScheduleModule interface.
func (m *ReportsModule) Schedule(s scheduler.TaskScheduler) {
    s.NamedE("reports-generate", m.generate).DailyAt("06:00")
}
```

`v.Schedule` stores a single callback, so calling it twice replaces the first
one. Register every job inside one callback, or split them across modules.

A module's `Schedule` method is only called when the module is registered
through `v.Modules(...)`. Modules passed to `velocity.WithModules(...)` run
`Init` / `Start` before the bootstrap chain exists and are not dispatched the
optional interfaces. See [Modules]({{< relref "modules" >}}).

`TaskScheduler` covers registration and lifecycle only: `Add`, `Call`,
`CallE`, `Named`, `NamedE`, `Command`, `Run`, `Shutdown`, `Jobs`,
`SetEventDispatcher`, `SetEnv`. The chaining configuration setters
(`SetTimezone`, `SetLogger`, `SetLocker`, `MaintenanceMode`, `Before`,
`After`) live on the concrete `*scheduler.Scheduler` and are meant for
bootstrap wiring or for a standalone `scheduler.New()`.

Throughout this page, `v` is the running app (`*velocity.App`, which embeds
the service container, hence `v.Log` / `v.Cache` / `v.Scheduler`) and `s` is
a scheduler.

## Configuration

### Creating a Scheduler

An app already has one (see [The app scheduler](#the-app-scheduler)).
`scheduler.New()` builds a standalone scheduler for a worker binary or a
test, and starts out unconfigured:

```go
import (
    "time"
    "github.com/velocitykode/velocity/scheduler"
)

s := scheduler.New()

// Set timezone (defaults to time.Local)
location, _ := time.LoadLocation("America/New_York")
s.SetTimezone(location)

// Any type with Debug/Info/Warn/Error satisfies scheduler.Logger,
// including the framework logger.
s.SetLogger(v.Log)

// Environment filter used by Job.Environments(...)
s.SetEnv("production")

// Cross-process overlap guard for WithoutOverlapping / OnOneServer
s.SetLocker(sharedLocker)
```

`s.Timezone()` and `s.Locker()` read the values back.

### Environment Variables

```env
# Environment filter for Job.Environments(...); the app calls SetEnv with it
APP_ENV=production

# IANA zone the app scheduler evaluates cron expressions in (default UTC)
APP_TIMEZONE=America/New_York
```

`APP_TIMEZONE` is the application's presentation timezone: it is applied to
`time.Local` and to scheduler cron evaluation at bootstrap. Persistence is
unconditionally UTC and never reads it.

## Schedule Frequencies

### Time-Based Intervals

```go
s.Call(func() {
    // Task logic
}).EveryMinute()           // Every minute
```

Available frequency methods:

```go
job.EveryMinute()           // Run every minute
job.EveryFiveMinutes()      // Run every 5 minutes
job.EveryTenMinutes()       // Run every 10 minutes
job.EveryFifteenMinutes()   // Run every 15 minutes
job.EveryThirtyMinutes()    // Run every 30 minutes

job.Hourly()                // Run every hour at :00
job.HourlyAt(17)            // Run every hour at :17

job.Daily()                 // Run daily at 00:00
job.DailyAt("13:00")        // Run daily at 1:00 PM

job.Weekly()                // Run weekly on Sunday at 00:00
job.Monthly()               // Run monthly on the 1st at 00:00
job.Yearly()                // Run yearly on Jan 1st at 00:00
```

### Day Constraints

```go
// Specific days
job.Sundays()               // Only on Sundays
job.Mondays()               // Only on Mondays
job.Tuesdays()              // Only on Tuesdays
job.Wednesdays()            // Only on Wednesdays
job.Thursdays()             // Only on Thursdays
job.Fridays()               // Only on Fridays
job.Saturdays()             // Only on Saturdays

// Day groups
job.Weekdays()              // Monday through Friday
job.Weekends()              // Saturday and Sunday
```

### Custom Cron Expressions

For complex schedules, use standard cron syntax:

```go
// Every 2 hours
s.Call(func() {
    // Task
}).Cron("0 */2 * * *")

// Weekdays at midnight
s.Call(func() {
    // Task
}).Cron("0 0 * * 1-5")

// Every 5 minutes
s.Call(func() {
    // Task
}).Cron("*/5 * * * *")
```

Cron format reference:
```
* * * * *
│ │ │ │ │
│ │ │ │ └─── day of week (0-6, Sunday=0)
│ │ │ └───── month (1-12)
│ │ └─────── day of month (1-31)
│ └───────── hour (0-23)
└─────────── minute (0-59)
```

## Task Constraints

### Time Constraints

Limit when tasks can run:

```go
// Only run between 8 AM and 5 PM
s.Call(func() {
    sendNotifications()
}).Hourly().Between("08:00", "17:00")

// Don't run between 10 PM and 6 AM
s.Call(func() {
    processData()
}).EveryFifteenMinutes().UnlessBetween("22:00", "06:00")
```

### Conditional Execution

```go
// Only run when condition is true
s.Call(func() {
    processPayments()
}).Hourly().When(func() bool {
    return isBusinessDay()
})

// Skip when condition is true
s.Call(func() {
    runBackup()
}).Daily().Skip(func() bool {
    return isMaintenanceMode()
})
```

### Environment Constraints

```go
// Only run in specific environments
s.Call(func() {
    cleanupOldData()
}).Daily().Environments("production", "staging")
```

### Prevent Overlapping

Prevent a task from running if the previous execution is still running:

```go
s.Call(func() {
    longRunningTask()
}).Hourly().WithoutOverlapping()
```

### Maintenance Mode

```go
// Allow task to run even in maintenance mode
s.Call(func() {
    criticalTask()
}).Hourly().EvenInMaintenanceMode()

// Enable maintenance mode
s.MaintenanceMode(true)
```

## Task Hooks

### Before and After Callbacks

```go
s.Call(func() {
    processOrders()
}).Daily().
    Before(func() {
        v.Log.Info("Starting order processing")
    }).
    After(func() {
        v.Log.Info("Finished order processing")
    })
```

### Success and Failure Handlers

```go
s.Call(func() {
    err := syncData()
    if err != nil {
        panic(err)
    }
}).Hourly().
    OnSuccess(func() {
        v.Log.Info("Data sync successful")
    }).
    OnFailure(func(err error) {
        v.Log.Error("Data sync failed", "error", err)
        sendAlert(err)
    })
```

{{< callout type="warning" title="Call vs CallE for OnFailure" >}}
Closures registered via `Call` only reach `OnFailure` when they panic; a
plain `error` return is invisible to the scheduler because the signature is
`func()`. Use `CallE` (or `NamedE`) when your closure returns an `error` and
you want `OnFailure` plus the `scheduled.failed` event to fire on the normal
error path.

```go
s.CallE(func() error {
    return syncData()
}).Hourly().
    OnFailure(func(err error) {
        v.Log.Error("Data sync failed", "error", err)
        sendAlert(err)
    })
```
{{< /callout >}}

### Global Hooks

Run callbacks before/after each scheduler cycle:

```go
s := scheduler.New()

s.Before(func() {
    v.Log.Info("Scheduler cycle starting")
})

s.After(func() {
    v.Log.Info("Scheduler cycle completed")
})
```

`Before` / `After` are on the concrete `*scheduler.Scheduler`, not on the
`TaskScheduler` interface the app exposes, so wire them where the scheduler
is constructed.

## Task Output

### File Output

Redirect task output to files:

```go
// Overwrite file
s.Command("backup-db").Daily().
    SendOutputTo("storage/logs/backup.log")

// Append to file
s.Command("process-queue").Hourly().
    AppendOutputTo("storage/logs/queue.log")
```

Redirection captures the stdout and stderr of a `Command` job's process.
Closure jobs (`Call` / `CallE` / `Named` / `NamedE`) run in-process and write
through whatever logger they use, so `SendOutputTo` / `AppendOutputTo` have
no effect on them.

## Registering Jobs

The scheduler exposes four closure-registration helpers. They differ along
two axes: whether the closure returns an `error`, and whether you supply
an explicit job name.

```go
// func() closure, auto-derived name (best-effort runtime symbol or "closure")
s.Call(func() {
    generateReports()
}).Daily()

// func() error closure; returned err feeds OnFailure + scheduled.failed
s.CallE(func() error {
    return generateReports()
}).Daily().OnFailure(handleErr)

// Explicit name + func() closure. Recommended when chaining WithoutOverlapping,
// since the overlap guard keys on the job name.
s.Named("reports-generate", func() {
    generateReports()
}).Daily().WithoutOverlapping()

// Explicit name + func() error closure. Combines both ergonomic wins.
s.NamedE("reports-generate", func() error {
    return generateReports()
}).Daily().WithoutOverlapping().OnFailure(handleErr)
```

`Call` and `CallE` derive a best-effort name from the closure's runtime
symbol; anonymous functions land at `pkg.parent.func1` style identifiers
that are not stable across builds. Reach for `Named` / `NamedE` whenever
the job name needs to be stable, such as when you rely on
`WithoutOverlapping` (the overlap guard collides if multiple closures
share the default name).

You can also chain `.Name("...")` on any job to override the derived name
after registration; doing so silences the `WithoutOverlapping` collision
warning for that job.

## Advanced Features

### Named Tasks

Give tasks descriptive names for easier debugging:

```go
s.Call(func() {
    generateReports()
}).Daily().Name("reports-generate")

s.Call(func() {
    cleanupFiles()
}).Weekly().Name("cleanup-files")
```

### Running Commands

Execute system commands:

```go
// Simple command
s.Command("ls", "-la").Daily()

// Command with output
s.Command("backup-db").DailyAt("02:00").
    AppendOutputTo("storage/logs/backup.log").
    Name("backup-database")

// Run in background
s.Command("long-process").Hourly().
    RunInBackground()
```

### Manual Job Execution

```go
// Get all jobs
jobs := s.Jobs()

// Run specific job manually
for _, job := range jobs {
    if job.GetName() == "backup-database" {
        job.Run()
    }
}

// Check job status
lastRun := job.GetLastRun()
nextRun := job.GetNextRun()
isRunning := job.IsRunning()
```

## API Reference

### Scheduler Methods

```go
// Create new scheduler
func New() *Scheduler

// Configuration
func (s *Scheduler) SetTimezone(tz *time.Location) *Scheduler
func (s *Scheduler) Timezone() *time.Location
func (s *Scheduler) SetLogger(logger Logger) *Scheduler
func (s *Scheduler) SetEnv(env string)
func (s *Scheduler) SetLocker(l Locker) *Scheduler
func (s *Scheduler) Locker() Locker
func (s *Scheduler) MaintenanceMode(enabled bool) *Scheduler
func (s *Scheduler) SetEventDispatcher(fn func(ctx context.Context, event interface{}) error)

// Define jobs
func (s *Scheduler) Call(callback func()) *Job
func (s *Scheduler) CallE(callback func() error) *Job
func (s *Scheduler) Named(name string, callback func()) *Job
func (s *Scheduler) NamedE(name string, callback func() error) *Job
func (s *Scheduler) Command(command string, args ...string) *Job
func (s *Scheduler) Add(job *Job) *Job

// Lifecycle
func (s *Scheduler) Run(ctx context.Context) error
func (s *Scheduler) Shutdown(ctx context.Context) error
func (s *Scheduler) ValidateJobs()

// Global hooks
func (s *Scheduler) Before(callback func()) *Scheduler
func (s *Scheduler) After(callback func()) *Scheduler

// Inspection
func (s *Scheduler) Jobs() []*Job
```

### Job Methods

Frequency methods return `*Job` for chaining:

```go
// Time intervals
EveryMinute() *Job
EveryFiveMinutes() *Job
EveryTenMinutes() *Job
EveryFifteenMinutes() *Job
EveryThirtyMinutes() *Job
Hourly() *Job
HourlyAt(minute int) *Job
Daily() *Job
DailyAt(time string) *Job
Weekly() *Job
Monthly() *Job
Yearly() *Job
Cron(expression string) *Job
At(time string) *Job

// Day constraints
Days(days ...int) *Job
Weekdays() *Job
Weekends() *Job
Sundays() *Job
Mondays() *Job
Tuesdays() *Job
Wednesdays() *Job
Thursdays() *Job
Fridays() *Job
Saturdays() *Job

// Execution constraints
WithoutOverlapping() *Job
WithoutOverlappingFor(ttl time.Duration) *Job
OnOneServer() *Job
EvenInMaintenanceMode() *Job
RunInBackground() *Job
When(callback func() bool) *Job
Skip(callback func() bool) *Job
Between(start, end string) *Job
UnlessBetween(start, end string) *Job
Environments(environments ...string) *Job

// Hooks
Before(callback func()) *Job
After(callback func()) *Job
OnSuccess(callback func()) *Job
OnFailure(callback func(error)) *Job

// Output
SendOutputTo(filename string) *Job
AppendOutputTo(filename string) *Job
EmailOutputTo(email string) *Job

// Metadata
Name(name string) *Job

// Inspection
GetName() string
GetLastRun() time.Time
GetNextRun() time.Time
IsRunning() bool
IsDue(t time.Time) bool
ShouldRun() bool

// Execution
Run() error
```

## Running Scheduled Work

The scheduler is constructed during app bootstrap but does not start its
ticker loop on its own. You have two deployment shapes:

### In-process with HTTP serve

For single-process deployments, opt the loop in via the
`WithSchedulerInProcess` option when constructing the app. The scheduler
starts after `Router.Freeze()` and before `http.Server.ListenAndServe`,
and drains in-flight jobs through `App.Shutdown` -> `Scheduler.Shutdown`
on signal-driven shutdown.

```go
import "github.com/velocitykode/velocity"

v, err := velocity.New(
    velocity.WithSchedulerInProcess(),
)
if err != nil {
    return err
}

if err := v.Serve(); err != nil {
    return err
}
```

The loop runs against `context.Background()` rather than the app's shutdown
context, so teardown always flows through `App.Shutdown`.

### Separate process via the CLI

For multi-process deployments (one or more `vel serve` workers plus a
dedicated scheduler), leave `WithSchedulerInProcess` off and run the
scheduler in its own process:

```bash
vel schedule work
```

`vel schedule work` bootstraps the app (so every `v.Schedule` callback and
module `Schedule` method has run), then calls `Scheduler.Run(ctx)` and waits
on SIGINT / SIGTERM before cancelling and draining.

Running the scheduler both in-process and via `vel schedule work` against
the same app will fire each job twice. Pick one shape per deployment.

## Best Practices

1. **Always Name Your Tasks**: Use descriptive names for easier debugging and monitoring
   ```go
   s.Call(func() {
       cleanupOldLogs()
   }).Daily().Name("cleanup-logs")
   ```

2. **Use WithoutOverlapping for Long Tasks**: Prevent job pile-up
   ```go
   s.Call(func() {
       processLargeDataset()
   }).Hourly().WithoutOverlapping()
   ```

3. **Add Error Handling**: Use OnFailure to handle and log errors
   ```go
   job.OnFailure(func(err error) {
       v.Log.Error("Task failed", "error", err)
       sendAlert(err)
   })
   ```

4. **Log Task Output**: Direct output to files for debugging
   ```go
   s.Command("backup").Daily().
       AppendOutputTo("storage/logs/backup.log")
   ```

5. **Test Cron Expressions**: Verify schedules before deploying
   ```go
   job := s.Call(func() {}).Cron("0 */2 * * *")
   nextRun := job.GetNextRun()
   v.Log.Info("Next run", "time", nextRun)
   ```

6. **Use Appropriate Frequencies**: Don't poll too frequently
   - Consider event-driven alternatives for real-time needs
   - Use longer intervals when possible

7. **Monitor Execution**: Track last run times
   ```go
   for _, job := range s.Jobs() {
       v.Log.Info("Job status",
           "name", job.GetName(),
           "last_run", job.GetLastRun(),
           "next_run", job.GetNextRun())
   }
   ```

8. **Let the lifecycle drain the jobs**: `WithSchedulerInProcess` and
   `vel schedule work` already stop the loop and wait for in-flight jobs on
   SIGINT / SIGTERM. A standalone scheduler needs the same treatment:
   `Shutdown` cancels the run context and waits for running jobs, returning
   `ctx.Err()` if the deadline expires first.
   ```go
   ctx, cancel := context.WithCancel(context.Background())
   defer cancel()

   go s.Run(ctx)

   // Graceful shutdown
   <-shutdownSignal
   drainCtx, drainCancel := context.WithTimeout(context.Background(), 30*time.Second)
   defer drainCancel()
   if err := s.Shutdown(drainCtx); err != nil {
       v.Log.Error("scheduler drain timed out", "error", err)
   }
   ```

## Complete Examples

### Application Scheduler

```go
package main

import (
    "github.com/velocitykode/velocity"
    "github.com/velocitykode/velocity/scheduler"
)

func main() {
    v, err := velocity.New(velocity.WithSchedulerInProcess())
    if err != nil {
        panic(err)
    }

    v.Schedule(func(s scheduler.TaskScheduler) {
        // Clear cache every hour
        s.NamedE("cache-clear", func() error {
            v.Log.Info("Clearing cache")
            return v.Cache.Flush()
        }).Hourly()

        // Database backup at 2 AM daily
        s.NamedE("backup-database", backupDatabase).
            DailyAt("02:00").
            WithoutOverlapping().
            OnSuccess(func() {
                v.Log.Info("Database backup completed")
            }).
            OnFailure(func(err error) {
                v.Log.Error("Database backup failed", "error", err)
                sendAlertEmail(err)
            })

        // Process queue every 5 minutes during business hours
        s.Named("queue-process", processQueueJobs).
            EveryFiveMinutes().
            Between("09:00", "18:00").
            Weekdays()

        // Weekly report on Mondays, production only
        s.Named("report-weekly", generateWeeklyReport).
            Weekly().
            Mondays().
            At("09:00").
            Environments("production")

        // Cleanup old files monthly
        s.Named("cleanup-files", cleanupOldFiles).Monthly()
    })

    // Serve() starts the scheduler loop (WithSchedulerInProcess) and drains
    // it through App.Shutdown on SIGINT / SIGTERM.
    if err := v.Serve(); err != nil {
        panic(err)
    }
}

func backupDatabase() error {
    // Database backup logic
    return nil
}

func processQueueJobs() {
    // Queue processing logic
}

func generateWeeklyReport() {
    // Report generation logic
}

func cleanupOldFiles() {
    // File cleanup logic
}

func sendAlertEmail(err error) {
    // Send alert email
}
```

### Development vs Production Schedules

`Environments` filters against the scheduler's env, which the app sets from
`APP_ENV` at bootstrap. A standalone scheduler needs an explicit
`s.SetEnv(...)`, otherwise every `Environments(...)` job is filtered out.

```go
func registerJobs(v *velocity.App) {
    v.Schedule(func(s scheduler.TaskScheduler) {
        // Tasks that run in all environments
        s.NamedE("cache-clear", v.Cache.Flush).Hourly()

        // Production-only tasks
        s.NamedE("backup-database", backupDatabase).
            DailyAt("02:00").
            Environments("production")

        s.NamedE("report-daily", sendDailyReport).
            DailyAt("09:00").
            Environments("production")

        // Development-only tasks
        s.NamedE("seed-test-data", seedTestData).
            Hourly().
            Environments("development")
    })
}
```

### Task with Custom Logger

`scheduler.Logger` is `Debug` / `Info` / `Warn` / `Error`, each
`(msg string, keysAndValues ...interface{})`. The framework logger already
satisfies it, so a standalone scheduler can borrow the app's:

```go
import (
    "github.com/velocitykode/velocity/contract"
    "github.com/velocitykode/velocity/scheduler"
)

s := scheduler.New()
s.SetLogger(v.Log)
```

Wrap it when scheduler output needs its own treatment:

```go
type prefixLogger struct{ inner contract.Logger }

func (l prefixLogger) Debug(msg string, kvs ...interface{}) { l.inner.Debug("[scheduler] "+msg, kvs...) }
func (l prefixLogger) Info(msg string, kvs ...interface{})  { l.inner.Info("[scheduler] "+msg, kvs...) }
func (l prefixLogger) Warn(msg string, kvs ...interface{})  { l.inner.Warn("[scheduler] "+msg, kvs...) }
func (l prefixLogger) Error(msg string, kvs ...interface{}) { l.inner.Error("[scheduler] "+msg, kvs...) }

s.SetLogger(prefixLogger{inner: v.Log})
```

## Testing

### Testing Scheduled Tasks

```go
func TestScheduledTask(t *testing.T) {
    executed := false

    s := scheduler.New()
    job := s.Call(func() {
        executed = true
    }).EveryMinute()

    // Run job manually
    err := job.Run()
    assert.NoError(t, err)
    assert.True(t, executed)
}
```

### Testing Schedule Timing

```go
func TestJobTiming(t *testing.T) {
    s := scheduler.New()

    job := s.Call(func() {
        // Task
    }).DailyAt("09:00")

    nextRun := job.GetNextRun()
    assert.Equal(t, 9, nextRun.Hour())
    assert.Equal(t, 0, nextRun.Minute())
}
```

### Testing Constraints

```go
func TestJobConstraints(t *testing.T) {
    s := scheduler.New()

    job := s.Call(func() {
        // Task
    }).Weekdays()

    // Check if job should run
    monday := time.Date(2024, 1, 1, 12, 0, 0, 0, time.Local) // Monday
    sunday := time.Date(2024, 1, 7, 12, 0, 0, 0, time.Local) // Sunday

    assert.True(t, job.IsDue(monday))
    assert.False(t, job.IsDue(sunday))
}
```

## Related

- [Queue](/docs/advanced/queue/) - durable jobs the scheduler can dispatch when a tick fires
- [Async](/docs/core/async/) - fire-and-forget primitives for in-process work scheduled tasks may kick off
- [Events](/docs/advanced/events/) - emit events from scheduled jobs so other listeners can react without coupling
