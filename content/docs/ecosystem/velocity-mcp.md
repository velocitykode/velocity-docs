---
title: Velocity MCP
description: A first-party, native Go SDK for building Model Context Protocol (MCP) servers on Velocity - tools, resources, and prompts served over stdio or HTTP.
weight: 10
---

[Velocity MCP](https://github.com/velocitykode/velocity-mcp) is a first-party SDK
for building [Model Context Protocol](https://modelcontextprotocol.io) (MCP)
servers on top of Velocity. It lets AI clients (Claude Code, Claude Desktop,
Cursor, and others) interact with your application by invoking the tools,
resources, and prompts you expose.

It is a native implementation of the MCP protocol built directly on Velocity
components (router, validation, events) - there is no third-party MCP SDK in the
dependency graph. Define primitives with familiar Velocity conventions, then
serve them over stdio (for local clients) or HTTP (mounted on your application
router).

Module path: `github.com/velocitykode/velocity-mcp`

{{% callout type="info" %}}
Velocity MCP is a separate module from core Velocity, so you opt in by adding a
single dependency. It is pre-1.0; the public API may change before a stable
release.
{{% /callout %}}

## Installation

```bash
go get github.com/velocitykode/velocity-mcp
```

## Package layout

The SDK is organized into domain packages; you import the ones you need:

| Package | Import path | Purpose |
|---------|-------------|---------|
| `server` | `.../velocity-mcp/server` | `Server`, the `Tool`/`Resource`/`Prompt` primitives, the `Request`/`Response` shapes, and the fluent tool builder |
| `schema` | `.../velocity-mcp/schema` | Fluent JSON Schema builder for tool arguments, plus `Implementation`/`Icon` metadata |
| `content` | `.../velocity-mcp/content` | Content types: `Text`, `Image`, `Audio`, `Blob`, `ResourceLink` |
| `transport` | `.../velocity-mcp/transport` | Stdio loop and the velocity-router HTTP handler |
| `provider` | `.../velocity-mcp/provider` | Chain service provider: registers the server and mounts the HTTP route |
| `console` | `.../velocity-mcp/console` | `make:mcp-*` code generators |

## Defining a tool

A tool is the unit an MCP client invokes. The quickest way to define one is the
fluent builder, `server.NewTool`, which produces a `*server.ToolBuilder` that
satisfies the `server.Tool` interface:

```go
package main

import (
	"context"

	"github.com/velocitykode/velocity-mcp/schema"
	"github.com/velocitykode/velocity-mcp/server"
)

func WeatherTool() server.Tool {
	return server.NewTool("current-weather", "Get the current weather for a city.").
		WithSchema(func(s *schema.Object) {
			s.String("city").Description("City name.").Required()
			s.Enum("units", "metric", "imperial").
				Description("Unit system.").
				Default("metric")
		}).
		WithReadOnlyHint(true).
		HandleFunc(func(ctx context.Context, req *server.Request) (*server.Response, error) {
			city := req.String("city")
			units := req.String("units")
			if units == "" {
				units = "metric"
			}
			return server.Text("It is sunny in " + city + " (" + units + ")."), nil
		})
}
```

The builder methods are all chainable:

- `WithSchema(func(s *schema.Object))` describes the input arguments. The
  `schema.Object` builder exposes `String`, `Integer`, `Number`, `Boolean`,
  `Array`, `Object`, and `Enum`, each returning a `*schema.Property` you can
  refine with `Description`, `Required`, `Default`, `Min`, `Max`, and `Enum`.
- `WithTitle` sets a human-friendly title.
- `WithReadOnlyHint`, `WithDestructiveHint`, `WithIdempotentHint`, and
  `WithOpenWorldHint` set the behavior-hint annotations surfaced in `tools/list`.
  Per the MCP spec these are hints only; clients treat them as untrusted unless
  the server is trusted.
- `HandleFunc` sets the handler:
  `func(ctx context.Context, req *server.Request) (*server.Response, error)`.

### Reading arguments

`*server.Request` is a typed view over the decoded arguments. Each accessor comes
in a plain form (returns the zero value when missing or mistyped) and an ok-form
(reports whether a usable value was present):

```go
city := req.String("city")           // "" when absent
limit, ok := req.IntOK("limit")      // comma-ok variant
flag := req.Bool("verbose")          // false when absent
```

`req.Float` / `req.FloatOK`, `req.Has`, `req.Get`, and `req.All` round out the
set. To hydrate a struct, use `req.Bind(&dst)`, which JSON round-trips the
arguments. To validate against Velocity rules, call
`req.Validate(validation.Rules{...})` - it runs the framework validation engine
and returns an error wrapping `server.ErrValidation` on failure.

### Building a response

Construct results with the `server` package helpers:

```go
server.Text("plain text result")                 // single text item
server.NewResponse(content.NewText("a"), img)     // multiple content items
server.Error("Client-safe failure message.")      // tool-level error result
```

`*server.Response` is fluent: `WithStructuredContent(map[string]any)` attaches
structured output, `WithMeta(key, value)` adds `_meta`, and `AsError()` flags a
tool-level error. Returning a non-nil `error` from a handler is treated as a tool
failure; to return an error *result* without failing the call, return
`server.Error(...)` (or a response built with `AsError`) and a nil error. Never
leak internal error detail into the message a client receives.

The `content` package provides the other content types: `content.NewText`,
`content.NewImage(data, mimeType)`, `content.NewAudio(data, mimeType)`,
`content.NewBlob(data)`, and `content.NewResourceLink(uri, name)`.

## Building a server

`server.New(name, version, opts...)` constructs a `*server.Server`. Register
primitives and configure metadata through the `With*` options:

```go
srv := server.New("weather-app", "1.0.0",
	server.WithInstructions("Tools for querying live weather."),
	server.WithTools(WeatherTool()),
)
```

Other options include `server.WithResources`, `server.WithPrompts`,
`server.WithTitle`, `server.WithWebsiteURL`, `server.WithIcons`,
`server.WithLogger`, `server.WithPageSize`, `server.WithMaxPageSize`,
`server.WithCapability`, and `server.WithProtocolVersions`. By default the server
advertises the `tools`, `resources`, and `prompts` capabilities and negotiates
the latest supported protocol version.

## Serving over stdio

Local MCP clients launch your server as a subprocess and speak line-delimited
JSON-RPC over stdin/stdout. `transport.ServeStdio` runs that loop; it blocks
until the context is cancelled or stdin reaches EOF:

```go
package main

import (
	"context"
	"os"

	"github.com/velocitykode/velocity-mcp/server"
	"github.com/velocitykode/velocity-mcp/transport"
)

func main() {
	srv := server.New("weather-app", "1.0.0",
		server.WithTools(WeatherTool()),
	)

	if err := transport.ServeStdio(context.Background(), srv); err != nil {
		os.Exit(1)
	}
}
```

Build it and point your client at the resulting binary:

```bash
go build -o weather-mcp .
```

{{% callout type="info" %}}
Importing `transport` blank-imports the protocol method set
(`server/methods`), so `tools/list`, `tools/call`, `resources/*`, and `prompts/*`
are wired automatically for any program that serves a server. A server with no
method set installed answers only `initialize` and `ping`.
{{% /callout %}}

For finer control (e.g. driving the loop in tests), construct the transport
directly with `transport.NewStdio(srv, in, out)` and call its `Run(ctx)` method.
Passing a nil reader or writer falls back to `os.Stdin` / `os.Stdout`.

## Serving over HTTP

The HTTP transport is a Velocity router handler, so it mounts on your application
router and inherits the full middleware stack. `transport.Handler(srv)` returns a
`func(*router.Context) error` you can attach to a `POST` route:

```go
r.Post("/mcp", transport.Handler(srv))
```

One `POST` carries one JSON-RPC message. A request (with an id) returns the
response as `application/json` (or a single Server-Sent Events frame when the
client negotiates `text/event-stream` via `Accept`); a notification returns
`202 Accepted` with an empty body. The session id assigned at `initialize` is
echoed back in the `Mcp-Session-Id` response header and read from the same header
on subsequent requests. The inbound body is always bounded (default
`transport.DefaultMaxBodyBytes`, 4 MiB); override it per-handler with
`transport.WithMaxBodyBytes`.

{{% callout type="warning" %}}
The transport performs no authentication. MCP clients are programs, not browsers,
so the route is deliberately kept out of the web middleware group (its
CSRF/session guards would reject every request). Attach your own auth, rate
limiting, and CORS middleware to the route.
{{% /callout %}}

### Registering the provider

Rather than wiring the route by hand, add `provider.New(srv)` as a chain service
provider. It registers the server in the application component registry, mounts
the HTTP transport at `/mcp`, registers the `make:mcp-*` generators, and lets
Velocity's bootstrap inject the event dispatcher so MCP events flow through your
event system:

```go
package main

import (
	"github.com/velocitykode/velocity"
	"github.com/velocitykode/velocity/chain"

	"github.com/velocitykode/velocity-mcp/provider"
	"github.com/velocitykode/velocity-mcp/server"
)

func main() {
	srv := server.New("weather-app", "1.0.0",
		server.WithTools(WeatherTool()),
	)

	app, err := velocity.New()
	if err != nil {
		panic(err)
	}

	app.Providers(func(r *chain.ProviderRegistry) {
		r.Add(provider.New(srv))
	})

	if err := app.Run(); err != nil {
		panic(err)
	}
}
```

The provider accepts options:

- `provider.WithPath(path)` changes the mount path (default `provider.DefaultPath`, `/mcp`).
- `provider.WithMiddleware(mw...)` attaches route middleware (auth guards, rate limiting, CORS).
- `provider.WithHandlerOptions(opts...)` forwards options to `transport.Handler` (e.g. `transport.WithMaxBodyBytes`).

Once registered, retrieve the server elsewhere with
`server.FromServices(app.Services)` or, inside a request handler, with the
typed registry.

## Resources and prompts

Tools are not the only primitive. Implement the `server.Resource` interface for
readable, URI-addressed data (`resources/read`) and `server.Prompt` for
parameterized prompt messages (`prompts/get`), then register them with
`server.WithResources` and `server.WithPrompts`.

A `server.Resource` reports its `Name`, `Description`, `URI`, and `MimeType`, and
implements `Read(ctx, req) (*server.Response, error)`. A resource whose `URI` is a
template (contains `{var}` placeholders) is listed under
`resources/templates/list` when it also implements `server.URITemplate`; the
extracted template variables arrive as request arguments.

A `server.Prompt` reports its `Name`, `Description`, and declared `Arguments()`
(each built with `server.NewPromptArgument(name, description, required)`), and
implements `Handle(ctx, req) (*server.Response, error)`. Use
`response.AsAssistant()` to mark a prompt message authored by the assistant.

## Scaffolding primitives

When the provider is registered, three generators are available through the
Velocity CLI to scaffold starter files:

```bash
vel run make:mcp-tool WeatherForecast
vel run make:mcp-resource UserProfile
vel run make:mcp-prompt Summarize
```

Each accepts an optional `--dir` override. By default they write to
`internal/tools`, `internal/resources`, and `internal/prompts` respectively,
deriving a kebab-case primitive name from the supplied type name.

## Testing

The `mcptest` package provides helpers and a fake transport for asserting against
server responses without driving real process stdio. The `server.Server` type
also exposes `NewTestContext(sessionID...)` to exercise method handlers directly.
