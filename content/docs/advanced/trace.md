---
title: Tracing
description: Distributed tracing primitives - trace IDs, span IDs, and parent relationships propagated through context.
weight: 80
---

The `trace` package is Velocity's distributed tracing primitive. It
generates trace and span IDs, stores them on `context.Context`, and
exposes helpers to create child spans. Events from the `httpclient`,
`bus`, and queue packages pull trace information from context via this
package.

Import path: `github.com/velocitykode/velocity/trace`

## Concepts

- **Trace ID** - identifies a distributed trace end-to-end. 32 hex
  characters. One per top-level request.
- **Span ID** - identifies a single operation within a trace. 16 hex
  characters. Multiple per trace.
- **Parent ID** - the span ID of the caller. Links child operations to
  their parent.

IDs are stored as `context.Context` values; helpers handle read/write
so callers never touch the keys directly.

## Starting a trace

At the top of a request (usually via middleware), start a fresh trace:

```go
ctx, traceID, spanID := trace.StartTrace(r.Context())
r = r.WithContext(ctx)
```

`StartTrace` generates both IDs, stores them on the context, and
returns them for logging.

### Continuing from an upstream trace

If the incoming request already carries a trace (e.g. from a
`traceparent` header), propagate it:

```go
if upstreamTrace, upstreamSpan := parseTraceHeader(r); upstreamTrace != "" {
    ctx = trace.WithTrace(r.Context(), upstreamTrace, upstreamSpan)
    ctx, _ = trace.ContinueTrace(ctx)  // start a new span under the upstream trace
} else {
    ctx, _, _ = trace.StartTrace(r.Context())
}
```

### Restoring all three fields

`WithTrace` sets only `traceID` and `spanID`; the parent slot stays as whatever
the inner ctx already carries. When all three fields were captured at the producer
side (queue payload, redis stream, gRPC frame) and need to be replayed verbatim,
use `WithFullContext`:

```go
ctx = trace.WithFullContext(ctx, payload.TraceID, payload.SpanID, payload.ParentID)
```

The queue worker and the ORM transaction manager already call this internally
when a payload carries the three fields. Reach for it manually only when writing
a new transport that persists trace state across a process boundary.

## Child spans

Any time you want to measure a sub-operation, create a child span.
The current span becomes the parent; the trace ID is preserved.

```go
ctx, spanID := trace.WithNewSpan(ctx)
defer recordDuration(spanID, time.Now())

// do work
```

`WithNewSpan` generates a new span ID and updates the context in one
call. Use `WithSpan(ctx, explicitID)` if you want to supply the ID
yourself (common when proxying from another tracing library).

## Reading trace state

```go
traceID := trace.GetTraceID(ctx)
spanID  := trace.GetSpanID(ctx)
parent  := trace.GetParentID(ctx)

// or all three:
traceID, spanID, parent := trace.GetTraceContext(ctx)
```

All getters return empty strings when the value is missing - safe to
call on any context.

## Generating IDs manually

```go
tid, err := trace.GenerateTraceID()  // 32 hex chars
if err != nil {
    // crypto/rand unavailable
}
sid, err := trace.GenerateSpanID()   // 16 hex chars
```

Backed by `crypto/rand`. `GenerateTraceID`/`GenerateSpanID` return an
error when the system entropy source is unavailable - they never
silently substitute zero bytes, which would collapse every concurrent
trace onto the same ID and break correlation.

### Infallible generation for hot paths

Request-path code (HTTP middleware, gRPC interceptors) often cannot
fail a request just because entropy is momentarily unavailable. Use the
`Must*` variants, which retry once and then fall back to a
distinguishable non-hex marker:

```go
tid := trace.MustGenerateTraceID()  // never errors
sid := trace.MustGenerateSpanID()
```

On an entropy outage these return per-call fallback IDs of the form
`velocity_trace_norand_<processStartNs>_<counter>` (and
`velocity_span_norand_...` for spans), exposed as the constants
`trace.FallbackTraceIDPrefix` and `trace.FallbackSpanIDPrefix`. The
markers are:

- non-hex, so APM tooling matching `^[0-9a-f]{32}$` filters them out
  and never conflates them with real trace IDs,
- unique per call (monotonic atomic counter) so concurrent in-flight
  traces stay correlated even during the outage,
- unique across restarts (the process-start nanosecond timestamp
  varies).

A single WARN log line is emitted (once per process) when the fallback
path first triggers. `StartTrace`, `ContinueTrace`, and `WithNewSpan`
all use the `Must*` helpers internally, so request-path callers degrade
gracefully rather than failing.

## Where trace values surface

- **APM events** - `httpclient.RequestSent`, `httpclient.RequestFailed`,
  router events (`RequestStarted`, `RequestHandled`, `RequestFailed`),
  ORM events (`QueryExecuted`, `TransactionExecuted`, `QueryFailed`),
  grpcevents, and queue events all carry `TraceID`, `SpanID`,
  and `ParentID` fields - the standard 3-field convention. Bus command
  events (`CommandDispatching`, `CommandCompleted`, `CommandFailed`,
  `CommandQueued`) instead embed the request `Context`, from which
  trace values are read. `trace.GetTraceContext(ctx)` is the read path.
- **Logs** - attach the trace fields to every log line to correlate
  request activity across systems.
- **Outbound requests** - inject the trace IDs into upstream headers
  (`traceparent`, or your own scheme) when calling other services.
