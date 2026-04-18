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
tid := trace.GenerateTraceID()  // 32 hex chars
sid := trace.GenerateSpanID()   // 16 hex chars
```

Backed by `crypto/rand`. Falls back to zero bytes only if the system
RNG fails (extremely unlikely).

## Where trace values surface

- **APM events** - `httpclient.RequestSent`, `httpclient.RequestFailed`,
  bus events, and queue events all carry `TraceID`, `SpanID`, and
  `ParentID` fields. `trace.GetTraceContext(ctx)` is the read path.
- **Logs** - attach the trace fields to every log line to correlate
  request activity across systems.
- **Outbound requests** - inject the trace IDs into upstream headers
  (`traceparent`, or your own scheme) when calling other services.
