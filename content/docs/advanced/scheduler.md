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
| Run scheduler alongside HTTP serve | `app.WithSchedulerInProcess()` |
| Run scheduler in separate process | `vel schedule:work` CLI |

## Quick Start

{{< tabs items="Basic Scheduling,Daily Tasks,Complex Schedules" >}}

{{< tab >}}
```go
import (
    "context"
    "github.com/velocitykode/velocity/scheduler"
    "github.com/velocitykode/velocity/log"
)

func main() {
    s := scheduler.New()

    // Run every minute
    s.Call(func() {
        log.Info("Task running every minute")
    }).EveryMinute()

    // Run every hour
    s.Call(func() {
        log.Info("Hourly task")
    }).Hourly()

    // Start the scheduler
    ctx := context.Background()
    s.Run(ctx)
}
```
{{< /tab >}}

{{< tab >}}
```go
import (
    "github.com/velocitykode/velocity/scheduler"
    "github.com/velocitykode/velocity/cache"
)

func main() {
    s := scheduler.New()

    // Clear cache daily at 2 AM
    s.Call(func() {
        cache.Flush()
    }).DailyAt("02:00").Name("cache:clear")

    // Backup database daily at 3 AM
    s.Call(func() {
        backupDatabase()
    }).DailyAt("03:00").Name("backup:daily")

    ctx := context.Background()
    s.Run(ctx)
}
```
{{< /tab >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/scheduler"

func main() {
    s := scheduler.New()

    // Process jobs every 5 minutes, weekdays only
    s.Call(func() {
        processJobs()
    }).EveryFiveMinutes().
        Weekdays().
        Between("09:00", "18:00").
        Name("jobs:process")

    // Weekly report on Mondays at 9 AM
    s.Call(func() {
        generateWeeklyReport()
    }).Weekly().
        Mondays().
        At("09:00").
        Name("report:weekly")

    ctx := context.Background()
    s.Run(ctx)
}
```
{{< /tab >}}

{{< /tabs >}}

## Configuration

### Creating a Scheduler

```go
import (
    "time"
    "github.com/velocitykode/velocity/scheduler"
)

s := scheduler.New()

// Set timezone
location, _ := time.LoadLocation("America/New_York")
s.SetTimezone(location)

// Set custom logger
s.SetLogger(customLogger)
```

### Environment Variables

```env
# Optional: Set environment for environment-specific jobs
APP_ENV=production
```

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
        log.Info("Starting order processing")
    }).
    After(func() {
        log.Info("Finished order processing")
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
        log.Info("Data sync successful")
    }).
    OnFailure(func(err error) {
        log.Error("Data sync failed", "error", err)
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
        log.Error("Data sync failed", "error", err)
        sendAlert(err)
    })
```
{{< /callout >}}

### Global Hooks

Run callbacks before/after each scheduler cycle:

```go
s := scheduler.New()

s.Before(func() {
    log.Info("Scheduler cycle starting")
})

s.After(func() {
    log.Info("Scheduler cycle completed")
})
```

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
s.Named("reports:generate", func() {
    generateReports()
}).Daily().WithoutOverlapping()

// Explicit name + func() error closure. Combines both ergonomic wins.
s.NamedE("reports:generate", func() error {
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
}).Daily().Name("reports:generate")

s.Call(func() {
    cleanupFiles()
}).Weekly().Name("cleanup:files")
```

### Running Commands

Execute system commands:

```go
// Simple command
s.Command("ls", "-la").Daily()

// Command with output
s.Command("backup-db").DailyAt("02:00").
    AppendOutputTo("storage/logs/backup.log").
    Name("backup:database")

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
    if job.GetName() == "backup:daily" {
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

app, err := velocity.New(
    velocity.WithSchedulerInProcess(),
)
if err != nil {
    log.Fatal(err)
}

if err := app.Serve(); err != nil {
    log.Fatal(err)
}
```

### Separate process via the CLI

For multi-process deployments (one or more `vel serve` workers plus a
dedicated scheduler), leave `WithSchedulerInProcess` off and run the
scheduler in its own process:

```bash
vel schedule:work
```

Running the scheduler both in-process and via `vel schedule:work` against
the same app will fire each job twice. Pick one shape per deployment.

## Best Practices

1. **Always Name Your Tasks**: Use descriptive names for easier debugging and monitoring
   ```go
   s.Call(func() {
       cleanupOldLogs()
   }).Daily().Name("cleanup:logs")
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
       log.Error("Task failed", "error", err)
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
   log.Info("Next run", "time", nextRun)
   ```

6. **Use Appropriate Frequencies**: Don't poll too frequently
   - Consider event-driven alternatives for real-time needs
   - Use longer intervals when possible

7. **Monitor Execution**: Track last run times
   ```go
   for _, job := range s.Jobs() {
       log.Info("Job status",
           "name", job.GetName(),
           "last_run", job.GetLastRun(),
           "next_run", job.GetNextRun())
   }
   ```

8. **Handle Context Cancellation**: Always start scheduler with context
   ```go
   ctx, cancel := context.WithCancel(context.Background())
   defer cancel()

   go s.Run(ctx)

   // Graceful shutdown
   <-shutdownSignal
   cancel()
   ```

## Complete Examples

### Application Scheduler

```go
package main

import (
    "context"
    "os"
    "os/signal"
    "syscall"

    "github.com/velocitykode/velocity/scheduler"
    "github.com/velocitykode/velocity/log"
    "github.com/velocitykode/velocity/cache"
)

func main() {
    s := scheduler.New()

    // Clear cache every hour
    s.Call(func() {
        log.Info("Clearing cache")
        cache.Flush()
    }).Hourly().Name("cache:clear")

    // Database backup at 2 AM daily
    s.Call(func() {
        log.Info("Running database backup")
        if err := backupDatabase(); err != nil {
            panic(err)
        }
    }).DailyAt("02:00").
        Name("backup:database").
        WithoutOverlapping().
        AppendOutputTo("storage/logs/backup.log").
        OnSuccess(func() {
            log.Info("Database backup completed")
        }).
        OnFailure(func(err error) {
            log.Error("Database backup failed", "error", err)
            sendAlertEmail(err)
        })

    // Process queue every 5 minutes during business hours
    s.Call(func() {
        processQueueJobs()
    }).EveryFiveMinutes().
        Between("09:00", "18:00").
        Weekdays().
        Name("queue:process")

    // Weekly report on Mondays
    s.Call(func() {
        generateWeeklyReport()
    }).Weekly().
        Mondays().
        At("09:00").
        Name("report:weekly").
        Environments("production")

    // Cleanup old files monthly
    s.Call(func() {
        cleanupOldFiles()
    }).Monthly().
        Name("cleanup:files")

    // Global hooks
    s.Before(func() {
        log.Info("Scheduler cycle starting")
    })

    s.After(func() {
        log.Info("Scheduler cycle completed")
    })

    // Start scheduler with graceful shutdown
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    // Handle shutdown signals
    sigChan := make(chan os.Signal, 1)
    signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

    go func() {
        <-sigChan
        log.Info("Shutting down scheduler")
        cancel()
    }()

    // Run scheduler
    log.Info("Starting scheduler")
    if err := s.Run(ctx); err != nil && err != context.Canceled {
        log.Error("Scheduler error", "error", err)
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

```go
func setupScheduler() *scheduler.Scheduler {
    s := scheduler.New()
    env := os.Getenv("APP_ENV")

    // Tasks that run in all environments
    s.Call(func() {
        cache.Flush()
    }).Hourly().Name("cache:clear")

    // Production-only tasks
    s.Call(func() {
        backupDatabase()
    }).DailyAt("02:00").
        Environments("production").
        Name("backup:database")

    s.Call(func() {
        sendDailyReport()
    }).DailyAt("09:00").
        Environments("production").
        Name("report:daily")

    // Development-only tasks
    s.Call(func() {
        seedTestData()
    }).Hourly().
        Environments("development").
        Name("seed:test-data")

    return s
}
```

### Task with Custom Logger

```go
import (
    "github.com/velocitykode/velocity/scheduler"
    "github.com/velocitykode/velocity/log"
)

type CustomLogger struct{}

func (l *CustomLogger) Info(msg string, keysAndValues ...interface{}) {
    log.Info(msg, keysAndValues...)
}

func (l *CustomLogger) Warn(msg string, keysAndValues ...interface{}) {
    log.Warn(msg, keysAndValues...)
}

func (l *CustomLogger) Error(msg string, keysAndValues ...interface{}) {
    log.Error(msg, keysAndValues...)
}

func (l *CustomLogger) Debug(msg string, keysAndValues ...interface{}) {
    log.Debug(msg, keysAndValues...)
}

func main() {
    s := scheduler.New()
    s.SetLogger(&CustomLogger{})

    // Define tasks...

    ctx := context.Background()
    s.Run(ctx)
}
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
