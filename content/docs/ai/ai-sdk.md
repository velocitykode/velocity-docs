---
title: AI SDK
description: The velocity-ai module - a first-party SDK for text generation, streaming, tools, structured output, embeddings, reranking, classification, images, and audio from a Velocity application, with provider failover and test fakes.
weight: 10
---

[Velocity AI](https://github.com/velocitykode/velocity-ai) is the first-party SDK
for calling AI providers from a Velocity application. One `Manager` gives you
agents, streaming, tool calls, structured output, embeddings, reranking,
classification, image and audio generation, and file storage, behind the same
fluent builders regardless of which provider serves the call.

The SDK has three layers:

- **Agent**: what you write. An agent is instructions plus optional tools, an
  output schema, and middleware.
- **Provider**: one driver per vendor. Each implements the capability interfaces
  it supports (`provider.TextProvider`, `provider.EmbeddingProvider`, and so on).
- **Gateway**: the HTTP calls to the vendor API, internal to each provider.

{{% callout type="info" %}}
Velocity AI is a separate module from core Velocity, so you opt in by adding a
single dependency. It is pre-1.0; the public API may change before a stable
release.
{{% /callout %}}

## Installation

```bash
go get github.com/velocitykode/velocity-ai
```

## Package layout

| Package | Import path | Purpose |
|---------|-------------|---------|
| `manager` | `.../velocity-ai/manager` | `Manager`, the fluent builders, `Lifecycle`, `Summarize`, `Decide` |
| `agent` | `.../velocity-ai/agent` | `Agent`, the agent builder, messages, the `Tool` and `Middleware` interfaces, schema helpers, file helpers |
| `provider` | `.../velocity-ai/provider` | Capability interfaces, response types, `TextStream`, provider sentinel errors |
| `provider/openai`, `anthropic`, `cohere`, `jina`, `typesafe` | `.../velocity-ai/provider/<name>` | Provider drivers, registered by blank import |
| `classify` | `.../velocity-ai/classify` | Classification questions and answers |
| `tool` | `.../velocity-ai/tool` | `NewTool` and the built-in tools |
| `conversation` | `.../velocity-ai/conversation` | `ConversationStore`, `MemoryStore`, `ORMStore` |
| `middleware` | `.../velocity-ai/middleware` | `LogPrompts`, `RateLimit`, `Cache` |
| `event` | `.../velocity-ai/event` | Event types the SDK dispatches |
| `config` | `.../velocity-ai/config` | `Config`, `ProviderConfig`, `ConfigFromEnv` |
| `fake` | `.../velocity-ai/fake` | Test doubles for every capability |
| `vector` | `.../velocity-ai/vector` | pgvector document store, covered on the [Vector search]({{< relref "/docs/database/vector-search" >}}) page |

## Setup

### Registering providers

A provider driver registers itself in its `init` function. Blank-import the ones
you use, once, anywhere in your application:

```go
import (
    _ "github.com/velocitykode/velocity-ai/provider/anthropic"
    _ "github.com/velocitykode/velocity-ai/provider/cohere"
    _ "github.com/velocitykode/velocity-ai/provider/jina"
    _ "github.com/velocitykode/velocity-ai/provider/openai"
    _ "github.com/velocitykode/velocity-ai/provider/typesafe"
)
```

A provider that is configured but not imported fails on first use with
`registry.ErrProviderNotFound`.

### Wiring the Manager

`manager.Lifecycle` builds the `Manager` from the environment and registers it in
the application's component registry. It is a helper you call from your own
[module]({{< relref "/docs/advanced/modules" >}}), not a module itself:

```go
package app

import (
    "context"

    "github.com/velocitykode/velocity"

    "github.com/velocitykode/velocity-ai/manager"
)

type AIModule struct {
    ai manager.Lifecycle
}

// Init creates the Manager from the environment and registers it.
func (m *AIModule) Init(s *velocity.Services) error {
    return m.ai.Register(s)
}

// Start hands the app's event dispatcher, queue and cache to the Manager.
func (m *AIModule) Start(s *velocity.Services) error {
    return m.ai.Boot(s)
}

// Shutdown has nothing to release: the framework closes the registered
// Manager when the app stops.
func (m *AIModule) Shutdown(ctx context.Context) error {
    return m.ai.Shutdown(ctx)
}

func Configure(reg *velocity.ModuleRegistry) {
    reg.Add(&AIModule{})
}
```

`Register` calls `config.ConfigFromEnv()`, creates the Manager, and registers it
as `*manager.Manager`. `Boot` wires `Services.Events`, `Services.Queue`, and
`Services.Cache` into it when they are set, plus a
`*broadcast.BroadcastManager` and a `*websocket.Server` when the application
registered them in the component registry.

Retrieve the Manager with `manager.From`, which returns an error when nothing
registered it:

```go
func Summary(ctx *router.Context) error {
    s, err := ctx.Services()
    if err != nil {
        return err
    }
    mgr, err := manager.From(s)
    if err != nil {
        return err
    }

    a := agent.New("You write one-paragraph release notes.").Build()

    resp, err := mgr.Agent(a).Prompt(ctx.Request.Context(), "Summarize the changes in v1.4.")
    if err != nil {
        return err
    }
    return ctx.JSON(router.StatusOK, map[string]string{"text": resp.Text})
}
```

The Manager is safe for concurrent use. It creates each provider on first use
and caches it.

### Using the Manager without the lifecycle

Outside a Velocity application (a CLI, a script, a test) build the config and the
Manager directly:

```go
cfg := config.Config{
    DefaultTextProvider: "anthropic",
    Providers: map[string]config.ProviderConfig{
        "anthropic": {APIKey: os.Getenv("ANTHROPIC_API_KEY")},
    },
}
mgr := manager.NewManager(&cfg)
```

Events, queueing, embedding caching, and broadcasting stay off until you call
`SetEventDispatcher`, `SetQueue`, `SetCache`, `SetBroadcaster`, or `SetWebSocket`.

## Configuration

`config.ConfigFromEnv()` reads two groups of environment variables.

**Default providers.** A builder called without a provider name uses the default
for its capability. With no default and no name, the call returns
`manager.ErrNoDefaultProvider`.

| Variable | Used by |
|----------|---------|
| `AI_DEFAULT_TEXT_PROVIDER` | `Agent`, `AnonymousAgent`, `Summarize` |
| `AI_DEFAULT_EMBEDDING_PROVIDER` | `Embeddings` |
| `AI_DEFAULT_RERANKING_PROVIDER` | `Rerank` |
| `AI_DEFAULT_CLASSIFICATION_PROVIDER` | `Classify`, `Classifier`, `Decide`. Falls back to `AI_DEFAULT_TEXT_PROVIDER` when empty |
| `AI_DEFAULT_IMAGE_PROVIDER` | `Image` |
| `AI_DEFAULT_AUDIO_PROVIDER` | `Audio` |
| `AI_DEFAULT_TRANSCRIPTION_PROVIDER` | `Transcription` |
| `AI_DEFAULT_FILE_PROVIDER` | `Files` |
| `AI_DEFAULT_STORE_PROVIDER` | `Stores` |

**Provider credentials.** Each known provider reads `<PREFIX>_API_KEY` and an
optional `<PREFIX>_BASE_URL`. A provider with no API key is left out of the
config, and naming it returns `manager.ErrProviderNotConfigured`.

| Provider name | API key | Base URL override | Driver shipped |
|---------------|---------|-------------------|----------------|
| `openai` | `OPENAI_API_KEY` | `OPENAI_BASE_URL` | Yes |
| `anthropic` | `ANTHROPIC_API_KEY` | `ANTHROPIC_BASE_URL` | Yes |
| `cohere` | `COHERE_API_KEY` | `COHERE_BASE_URL` | Yes |
| `jina` | `JINA_API_KEY` | `JINA_BASE_URL` | Yes |
| `typesafe` | `TYPESAFE_API_KEY` | `TYPESAFE_BASE_URL` | Yes |
| `gemini` | `GEMINI_API_KEY` | `GEMINI_BASE_URL` | No |
| `azure` | `AZURE_OPENAI_API_KEY` | `AZURE_OPENAI_BASE_URL` | No |
| `groq` | `GROQ_API_KEY` | `GROQ_BASE_URL` | No |
| `xai` | `XAI_API_KEY` | `XAI_BASE_URL` | No |
| `deepseek` | `DEEPSEEK_API_KEY` | `DEEPSEEK_BASE_URL` | No |
| `mistral` | `MISTRAL_API_KEY` | `MISTRAL_BASE_URL` | No |
| `ollama` | `OLLAMA_API_KEY` | `OLLAMA_BASE_URL` | No |
| `voyageai` | `VOYAGEAI_API_KEY` | `VOYAGEAI_BASE_URL` | No |
| `elevenlabs` | `ELEVENLABS_API_KEY` | `ELEVENLABS_BASE_URL` | No |

```bash
AI_DEFAULT_TEXT_PROVIDER=anthropic
AI_DEFAULT_EMBEDDING_PROVIDER=openai
AI_DEFAULT_RERANKING_PROVIDER=cohere
AI_DEFAULT_CLASSIFICATION_PROVIDER=typesafe

ANTHROPIC_API_KEY=
OPENAI_API_KEY=
COHERE_API_KEY=
TYPESAFE_API_KEY=
```

{{% callout type="warning" %}}
The names marked "No" are read from the environment, but the module ships no
driver for them. Using one returns `registry.ErrProviderNotFound` unless you
register your own factory with `registry.RegisterProvider`. `ollama` is the one
name accepted with a base URL and no API key.
{{% /callout %}}

## Providers and capabilities

| Capability | Builder | `openai` | `anthropic` | `cohere` | `jina` | `typesafe` |
|------------|---------|:--------:|:-----------:|:--------:|:------:|:----------:|
| Text generation | `Agent(...).Prompt` | Yes | Yes | | | |
| Streaming | `Agent(...).Stream`, `PromptStream` | Yes | Yes | | | |
| Embeddings | `Embeddings()` | Yes | | | | |
| Reranking | `Rerank(...)` | | | Yes | Yes | |
| Classification | `Classify`, `Classifier()` | Via chat model | Via chat model | | | Native |
| Image generation | `Image(...)` | Yes | | | | |
| Text to speech | `Audio(...)` | Yes | | | | |
| Transcription | `Transcription(...)` | Yes | | | | |
| File storage | `Files()` | Yes | | | | |
| Vector stores | `Stores()` | Yes | | | | |

Asking a provider for a capability it does not implement returns
`manager.ErrCapabilityNotSupported`.

Default models, used when you do not pick one:

| Provider | Default | Cheapest | Smartest | Other |
|----------|---------|----------|----------|-------|
| `openai` | `gpt-4o` | `gpt-4o-mini` | `o1` | Embeddings `text-embedding-3-small` (1536 dimensions), images `dall-e-3`, speech `tts-1`, transcription `whisper-1` |
| `anthropic` | `claude-sonnet-4-5-20250929` | `claude-haiku-4-5-20251001` | `claude-opus-4-6` | |
| `cohere` | `rerank-v3.5` | | | |
| `jina` | `jina-reranker-v2-base-multilingual` | | | |
| `typesafe` | `jev-latest` | | | |

## Agents

An agent is a value that reports its instructions. `agent.New` builds one:

```go
a := agent.New("You are a support assistant. Answer in two sentences.").Build()

resp, err := mgr.Agent(a).
    WithProvider("anthropic").
    WithModel("claude-haiku-4-5-20251001").
    WithMaxTokens(512).
    WithTemperature(0.2).
    Prompt(ctx, "How do I rotate an API key?")
if err != nil {
    return err
}

fmt.Println(resp.Text)
fmt.Println(resp.Model, resp.PromptTokens, resp.CompletionTokens, resp.TotalTokens)
```

`mgr.Agent(a)` returns a `*manager.PendingAgent`. Nothing is sent until you call
`Prompt`, `Stream`, `PromptStream`, or `Dispatch`.

### The response

`Prompt` returns `*agent.AgentResponse`:

| Field | Meaning |
|-------|---------|
| `Text` | The final assistant text |
| `PromptTokens`, `CompletionTokens`, `TotalTokens` | Usage, summed over every step of a tool loop |
| `Model` | The model that answered |
| `ConversationID` | Set when a conversation store is in use |
| `Structured` | Decoded structured output, when the agent has a schema |

### Request options

| Method | Effect |
|--------|--------|
| `WithProvider(name)` | Use one provider instead of the default |
| `WithProviders(names...)` | Ordered failover list, see [Failover](#failover) |
| `WithModel(model)` | Explicit model. Wins over the tier selectors |
| `UseCheapestModel()`, `UseSmartestModel()` | Resolve the provider's cheapest or smartest model at request time. The last call wins |
| `WithMaxTokens(n)` | Output token cap. Anthropic requires one, so the driver sends 4096 when unset |
| `WithTemperature(t)`, `WithTopP(p)`, `WithStop(seqs...)` | Sampling controls |
| `WithMaxSteps(n)` | Tool loop limit, default 10 |
| `WithMessages(msgs...)` | Extra messages placed before the prompt |
| `WithStore`, `ForUser`, `Continue` | See [Conversations](#conversations) |
| `WithMiddleware(mw...)` | Per-request middleware |

```go
// The provider's cheapest model, resolved when the request runs.
resp, err := mgr.Agent(a).UseCheapestModel().Prompt(ctx, "Tag this ticket.")

// The provider's most capable model.
resp, err = mgr.Agent(a).UseSmartestModel().Prompt(ctx, "Review this contract clause.")

// No agent value: instructions inline.
resp, err = mgr.AnonymousAgent("Reply with one word.").Prompt(ctx, "Capital of France?")
```

{{% callout type="warning" %}}
`WithTimeout(seconds)` and `WithAttachments(files...)` exist on the builder, but
the shipped OpenAI and Anthropic drivers do not act on them yet: no deadline is
applied and attachments are not sent. Bound a request with a context deadline
(`context.WithTimeout`) instead.
{{% /callout %}}

### Declaring defaults on the agent

Any type with an `Instructions() string` method is an agent. Add a `Config`
method and the Manager applies those defaults before the per-call options:

```go
type Triage struct{}

func (Triage) Instructions() string { return "You triage incoming support tickets." }

func (Triage) Config() agent.AgentConfig {
    return agent.AgentConfig{Provider: "openai", UseCheapest: true, MaxSteps: 4}
}
```

Precedence is per-call builder, then `Config`, then provider defaults.

## Streaming

`Stream` returns a `*provider.TextStream`. Range over `Events()` for the deltas,
then call `Response()` for the aggregated result:

```go
stream, err := mgr.Agent(a).Stream(ctx, "Explain context cancellation.")
if err != nil {
    return err
}
defer stream.Close()

for ev := range stream.Events() {
    fmt.Print(ev.Delta)
}

resp, err := stream.Response()
if err != nil {
    return err
}
fmt.Println(resp.Usage.TotalTokens)
```

`Stream` makes one provider call. It reports tool calls on the event
(`ev.ToolCall`) but does not execute them, does not run middleware, and does not
write to a conversation store. Either drain `Events()` or call `Close()`; an
abandoned stream leaks its goroutine.

### Streaming with tools

`PromptStream` runs the full tool loop while streaming. Tools execute between
steps, and the final exchange is saved to the conversation store like `Prompt`:

```go
stream, err := mgr.Agent(a).PromptStream(ctx, "What is the weather in Lahore?")
if err != nil {
    return err
}
defer stream.Close()

for ev := range stream.Events() {
    switch ev.Kind {
    case manager.StreamTextDelta:
        fmt.Print(ev.Text)
    case manager.StreamToolInvoking:
        fmt.Println("calling", ev.ToolName, ev.ToolParams)
    case manager.StreamToolInvoked:
        fmt.Println("result", ev.ToolResult)
    case manager.StreamDone:
        fmt.Println(ev.Response.TotalTokens)
    case manager.StreamError:
        return ev.Err
    }
}
```

The channel closes after a terminal `StreamDone` or `StreamError`. A
`StreamStepBoundary` event marks the end of each step that ran tools.
`PromptStream` does not run middleware.

### Streaming to a browser

`provider.WriteVercelDataStream` writes a `TextStream` to an HTTP response as
Vercel AI Data Stream Protocol v1 frames, flushing after each one:

```go
func Chat(ctx *router.Context) error {
    s, err := ctx.Services()
    if err != nil {
        return err
    }
    mgr, err := manager.From(s)
    if err != nil {
        return err
    }

    a := agent.New("You are a helpful assistant.").Build()

    stream, err := mgr.Agent(a).Stream(ctx.Request.Context(), ctx.Query("q"))
    if err != nil {
        return err
    }
    return provider.WriteVercelDataStream(ctx.Response, stream)
}
```

For [WebSockets]({{< relref "/docs/realtime/websockets" >}}),
`StreamToClient(ctx, prompt, client)` sends the same frames to one
`*websocket.Client` and `StreamToGroup(ctx, prompt, group)` fans them out to a
group. `StreamToGroup` returns `manager.ErrWebSocketNotConfigured` when no
WebSocket server is wired.

## Tools

A tool is a name, a description, a JSON Schema for its input, and a handler.
`tool.NewTool` builds one from those four values:

```go
weather := tool.NewTool(
    "get_weather",
    "Get the current temperature for a city.",
    agent.Object(map[string]agent.SchemaField{
        "city":  agent.String().Description("City name"),
        "units": agent.Enum("metric", "imperial").Optional(),
    }).Build(),
    func(ctx context.Context, params map[string]any) (string, error) {
        city, _ := params["city"].(string)
        if city == "" {
            return "", errors.New("city is required")
        }
        return "21 degrees and clear in " + city, nil
    },
)

a := agent.New("Answer weather questions with the get_weather tool.").
    WithTools(weather).
    Build()

resp, err := mgr.Agent(a).WithMaxSteps(5).Prompt(ctx, "Is it warm in Lahore?")
if errors.Is(err, manager.ErrMaxStepsExceeded) {
    // The model was still asking for tools after five provider calls.
    return err
}
if err != nil {
    return err
}
fmt.Println(resp.Text)
```

To carry state, implement the `agent.Tool` interface (`Name`, `Description`,
`Schema`, `Handle`) on your own type.

### The tool loop

`Prompt` calls the provider, runs every tool the model asked for, appends the
results, and calls the provider again. It stops when the model answers without
requesting a tool. One step is one provider call, and the limit is 10 unless
`WithMaxSteps` changes it. Reaching the limit returns
`manager.ErrMaxStepsExceeded`.

A handler error does not abort the loop. The model receives `error: <message>`
as the tool result and decides what to do next, as it does when it names a tool
that does not exist. Tool parameters arrive as the model produced them; validate
them in the handler.

### Built-in tools

| Constructor | Tool name | What it does |
|-------------|-----------|--------------|
| `tool.WebSearch(tool.WebSearchConfig{...})` | `web_search` | Searches the web through the Tavily API. Needs a Tavily API key in `APIKey`; `MaxResults` defaults to 5 |
| `tool.WebFetch(tool.WebFetchConfig{...})` | `web_fetch` | Fetches an `http` or `https` URL and returns its text with HTML stripped. Defaults: 30 second timeout, 5 MB body cap, 50,000 characters of output |
| `tool.SimilaritySearch(tool.SimilaritySearchConfig{...})` | `similarity_search` | Embeds the query and ranks an in-memory corpus by cosine similarity. `TopK` defaults to 5 |
| `tool.FileSearch(tool.FileSearchConfig{...})` | `file_search` | Retrieves chunks from a provider vector store |

```go
embedder, err := mgr.EmbeddingProvider()
if err != nil {
    return nil, err
}

a := agent.New("Research the question, then answer with sources.").
    WithTools(
        tool.WebSearch(tool.WebSearchConfig{APIKey: os.Getenv("TAVILY_API_KEY"), MaxResults: 3}),
        tool.WebFetch(tool.WebFetchConfig{Timeout: 10, MaxOutputLen: 20000}),
        tool.SimilaritySearch(tool.SimilaritySearchConfig{
            Provider: embedder,
            TopK:     3,
            Corpus: []tool.Document{
                {ID: "refunds", Text: "Refunds are issued within 14 days of purchase."},
                {ID: "shipping", Text: "Orders ship within two business days."},
            },
        }),
    ).
    Build()
```

{{% callout type="warning" %}}
`web_fetch` requests whatever URL the model supplies. It checks the scheme only:
it does not block private, loopback, or link-local addresses. Do not give it to
an agent that handles untrusted input on a network where internal services are
reachable, or pass an `HTTPClient` whose transport enforces your own allow list.
{{% /callout %}}

`similarity_search` keeps its corpus in memory and embeds each document once, on
first use. For a corpus in Postgres, use the document store on the
[Vector search]({{< relref "/docs/database/vector-search" >}}) page.

`file_search` needs a store provider that implements `provider.SupportsFileSearch`
or `tool.StoreSearcher`. The shipped OpenAI driver implements neither, so with it
the tool returns `file_search: provider does not support file search retrieval`.

## Structured output

Give the agent a JSON Schema and the response carries decoded data in
`Structured`. `agent.SchemaFromStruct` derives the schema from `json` and
`description` tags; a field tagged `omitempty` is optional:

```go
type Sentiment struct {
    Label string   `json:"label" description:"positive, neutral or negative"`
    Score int      `json:"score" description:"Strength from 1 to 10"`
    Tags  []string `json:"tags,omitempty" description:"Topics mentioned"`
}
```

```go
a := agent.New("Classify the sentiment of the review.").
    WithSchema(agent.SchemaFromStruct(Sentiment{})).
    Build()

resp, err := mgr.Agent(a).Prompt(ctx, "Arrived late, but the build quality is excellent.")
if err != nil {
    return err
}

var s Sentiment
if err := resp.Unmarshal(&s); err != nil {
    return err
}
fmt.Println(s.Label, s.Score, resp.Get("tags"))
```

`Unmarshal` returns an error when the response has no structured data. `Get`
returns one key, or `nil`.

The schema can also be built by hand. Fields are required unless marked
`Optional()`:

```go
schema := agent.Object(map[string]agent.SchemaField{
    "label": agent.Enum("positive", "neutral", "negative"),
    "score": agent.Int().Description("Strength from 1 to 10"),
    "tags":  agent.Array(agent.String()).Optional(),
}).Build()
```

OpenAI receives the schema as a native `json_schema` response format. Anthropic
has no such mode, so the driver sends the schema as a tool named
`structured_output` and reads the tool input back as the result. The calling code
is the same for both.

## Conversations

A `conversation.ConversationStore` persists turns. Pass one with `WithStore`,
then open a conversation with `ForUser` or resume one with `Continue`:

```go
store := conversation.NewMemoryStore()

// First turn: ForUser opens a new conversation owned by that user.
first, err := mgr.Agent(a).WithStore(store).ForUser("user-42").
    Prompt(ctx, "My order number is 1182.")
if err != nil {
    return err
}

// Later turns: Continue loads the stored messages and appends to them.
next, err := mgr.Agent(a).WithStore(store).Continue(first.ConversationID).
    Prompt(ctx, "What was my order number?")
if err != nil {
    return err
}
fmt.Println(next.Text)

// Resume the most recent conversation of a user.
id, err := store.LatestConversationID(ctx, "user-42")
if err != nil {
    return err
}
fmt.Println(id == first.ConversationID)
```

After a successful `Prompt` or `PromptStream`, the user message and the final
assistant text are stored. Without `ForUser` or `Continue`, a store is ignored.

What the stores do not do:

- Intermediate tool calls and tool results are not stored. A continued
  conversation replays user and assistant text only.
- `Continue` loads the whole history on every turn. Nothing trims or summarizes
  it, so a long conversation grows until it exceeds the model's context window.
- `Continue` does not check who owns the conversation. Verify that the ID
  belongs to the current user before you pass it.

### MemoryStore

`conversation.NewMemoryStore()` keeps everything in a map inside the process. It
is lost on restart, is not shared between instances, and is never evicted. Use it
for development and tests.

### ORMStore

`conversation.NewORMStore(db)` stores conversations in the `conversations` and
`messages` tables through the Velocity ORM. Import the migrations package once so
`migrate` provisions them, and build the store from the application's database
handle:

```go
import _ "github.com/velocitykode/velocity-ai/conversation/migrations"
```

```go
store := conversation.NewORMStore(s.DB)
```

It has the same five methods and the same ordering as `MemoryStore`, and survives
restarts. To use another backend, implement `ConversationStore` yourself.

## Embeddings

`mgr.Embeddings()` returns a builder. `For` sets the inputs and `Generate` runs
the request:

```go
resp, err := mgr.Embeddings().
    For("refund policy", "shipping times").
    WithDimensions(1536).
    Cached(24 * time.Hour).
    Generate(ctx)
if err != nil {
    return err
}
fmt.Println(len(resp.Embeddings), len(resp.Embeddings[0]), resp.Usage.TotalTokens)
```

`resp.Embeddings` is `[][]float64`, one vector per input in input order.
`WithModel` and `WithProvider` override the defaults.

`Cached(ttl)` stores the result in the application
[cache]({{< relref "/docs/core/cache" >}}), keyed by provider, model, dimensions,
and inputs. Caching is off unless you call it, and it is skipped silently when no
cache is wired into the Manager.

To store vectors in Postgres and search them, see
[Vector search]({{< relref "/docs/database/vector-search" >}}).

## Reranking

Reranking orders documents by relevance to a query. Cohere and Jina implement it:

```go
docs := []string{
    "Refunds are issued within 14 days of purchase.",
    "Orders ship within two business days.",
    "Gift cards cannot be refunded.",
}

resp, err := mgr.Rerank(docs, "cohere").Query("can I get my money back?").Limit(2).Generate(ctx)
if err != nil {
    return err
}
for _, r := range resp.Results {
    fmt.Printf("%.3f %s\n", r.Score, docs[r.Index])
}
```

Each `provider.RankedDocument` carries the document's `Index` in the input slice,
the `Document` text, and its `Score`. The optional second argument to `Rerank`
names the provider; without it the default reranking provider is used.

## Images, audio, and files

Only the OpenAI driver implements these capabilities.

```go
img, err := mgr.Image("A lighthouse at dusk, flat illustration").
    Landscape().
    Quality("high").
    Generate(ctx)
if err != nil {
    return err
}
if err := os.WriteFile("lighthouse.png", img.Data, 0o644); err != nil {
    return err
}

speech, err := mgr.Audio("Your order has shipped.").Voice("alloy").Generate(ctx)
if err != nil {
    return err
}
if err := os.WriteFile("shipped.mp3", speech.Data, 0o644); err != nil {
    return err
}

tr, err := mgr.Transcription(agent.FileFromPath("call.mp3")).Language("en").Generate(ctx)
if err != nil {
    return err
}
fmt.Println(tr.Text)
for _, seg := range tr.Segments {
    fmt.Printf("%.1fs-%.1fs %s\n", seg.Start, seg.End, seg.Text)
}
```

- **Images.** `Square()`, `Landscape()`, and `Portrait()` map to `1024x1024`,
  `1792x1024`, and `1024x1792`. `Quality("high")` or `"hd"` requests HD; anything
  else is standard. `Data` holds the decoded image bytes.
- **Speech.** `Voice` defaults to `alloy`, and `WithInstructions` passes tone or
  pacing guidance. `Data` is MP3.
- **Transcription.** The input is an `agent.AudioSource`, built with
  `agent.FileFromPath(path)` or `agent.FileFromBytes(name, mimeType, data)`.
  `Language` is a hint. Speaker labels are not requested, so `Segments[i].Speaker`
  is empty.

### Files and vector stores

`mgr.Files()` uploads, fetches, and deletes files in the provider's storage.
`mgr.Stores()` manages the provider's hosted vector stores:

```go
stored, err := mgr.Files().Upload(ctx, agent.FileFromPath("handbook.pdf"))
if err != nil {
    return err
}

store, err := mgr.Stores().Create(ctx, "handbook", provider.StoreOptions{
    Description:        "Employee handbook",
    ExpiresWhenIdleFor: 30 * 24 * time.Hour,
})
if err != nil {
    return err
}

docID, err := mgr.Stores().AddFile(ctx, store.ID, stored.ID, map[string]any{"year": 2026})
if err != nil {
    return err
}
fmt.Println(docID)

if err := mgr.Stores().Delete(ctx, store.ID); err != nil {
    return err
}
return mgr.Files().Delete(ctx, stored.ID)
```

`Files()` also has `Get(ctx, fileID)`, and `Stores()` has `Get(ctx, storeID)` and
`RemoveFile(ctx, storeID, documentID)`. These hosted stores are separate from the
pgvector document store on the
[Vector search]({{< relref "/docs/database/vector-search" >}}) page, which lives
in your own database.

## Classification

Classification asks typed questions about a piece of text and returns a
probability distribution for each. The model reports probabilities; your code
decides where to draw the line.

### Questions

The `classify` package has three question kinds. Each constructor validates its
input and returns an error:

```go
urgent, err := classify.Boolean("Is this message urgent?", "It reports an outage or data loss.")
if err != nil {
    return err
}

topic, err := classify.Choice("What is the message about?", []classify.Option{
    {Name: "billing", Description: "Invoices, charges, refunds"},
    {Name: "bug", Description: "Something is broken"},
    {Name: "other"},
})
if err != nil {
    return err
}

anger, err := classify.Score("How angry is the writer?", []classify.Level{
    {Value: 1, Label: "calm"},
    {Value: 2, Label: "annoyed"},
    {Value: 3, Label: "furious"},
})
if err != nil {
    return err
}
```

- `Boolean(question, criteria)` is a yes/no question. `criteria` says what makes
  the answer true and may be empty.
- `Choice(question, options)` picks one of two or more named options.
- `Score(question, levels)` places the text on a scale of two or more levels in
  strictly ascending `Value` order.

A question's answer is identified by its name, which defaults to the question
text. `Named` sets a shorter one. Names must be unique within one call.

### Asking and reading answers

`mgr.Classify` sends every question in one request to the default classification
provider:

```go
resp, err := mgr.Classify(ctx, "Production is down and nobody is answering!",
    urgent.Named("urgent"), topic.Named("topic"), anger.Named("anger"))
if err != nil {
    return err
}

if a, ok := resp.Boolean("urgent"); ok {
    fmt.Println(a.Probability(), a.IsTrue(0.8))
}
if a, ok := resp.Choice("topic"); ok {
    fmt.Println(a.Label(), a.Probability(), a.ProbabilityOf("billing"))
}
if a, ok := resp.Score("anger"); ok {
    fmt.Println(a.Level().Label, a.Score(), a.Normalized())
}
```

| Answer | Method | Returns |
|--------|--------|---------|
| `BooleanAnswer` | `Probability()` | Probability that the answer is true |
| | `IsTrue(threshold)` | Whether that probability reaches `threshold` |
| `ChoiceAnswer` | `Label()` | The most likely option; the earlier option wins a tie |
| | `Probability()` | Probability of that option |
| | `ProbabilityOf(option)` | Probability of a named option, zero if unknown |
| | `Probabilities()` | Every option's probability |
| `ScoreAnswer` | `Level()`, `Label()` | The most likely level; the lower level wins a tie |
| | `Score()` | Expected value of the scale. It can fall between two levels |
| | `Normalized()` | `Score()` mapped onto 0 to 1, lowest level to highest |
| | `Probabilities()` | Every level's probability, keyed by value |

`resp.Answers` holds the answers in question order, and `resp.All()` iterates
them by name.

### Choosing the backend

Two kinds of provider can answer:

- **A chat model.** When the provider implements only text generation (`openai`,
  `anthropic`), the Manager runs one structured-output prompt on the provider's
  cheapest model and asks it to state a probability for every option. These are
  the model's own estimates, not calibrated values. Unreadable output returns
  `manager.ErrInvalidClassification`.
- **A native classifier.** `typesafe` implements classification directly. Its
  model (`jev-latest` by default) returns calibrated probabilities and a
  confidence for choice and score answers.

Set `AI_DEFAULT_CLASSIFICATION_PROVIDER` to pick the default, or use the builder:

```go
resp, err := mgr.Classifier("typesafe").
    WithTimeout(5*time.Second).
    Classify(ctx, text, topic.Named("topic"))
if err != nil {
    return err
}

a, _ := resp.Choice("topic")
if c, ok := a.Confidence(); ok {
    fmt.Println("confidence", c)
} else {
    fmt.Println("the provider supplied no confidence")
}
```

`Classifier(names...)` also takes `WithModel`, `WithProvider`, `WithProviders`,
and `WithProviderOptions`. A configured builder holds only options, so one value
can classify any number of texts.

### Confidence

`Confidence()` returns `(float64, bool)`. It is how sure the provider is of the
answer as a whole, a value from 0 to 1 that the provider supplies separately from
the probabilities. The SDK never derives it.

- A chat model backend supplies none, so `ok` is `false`.
- `typesafe` supplies it for choice and score answers.
- A boolean answer never carries one. Its probability is the whole answer.

Always check `ok` before using the value.

{{% callout type="info" %}}
With `typesafe`, a score question's levels are sent as their labels in order;
level descriptions are not sent. `WithProviderOptions` is not forwarded by either
backend today.
{{% /callout %}}

## Helpers

Two one-call helpers cover the most common small jobs:

```go
summary, err := mgr.Summarize(ctx, article,
    manager.SummarizeSentences(2),
    manager.HelperTimeout(20*time.Second),
)
if err != nil {
    return err
}
fmt.Println(summary)

spam, err := mgr.Decide(ctx, comment, "Is this comment spam?",
    manager.DecideCriteria("It advertises a product or links to one.", "It discusses the article."),
    manager.DecideThreshold(0.9),
    manager.HelperProvider("typesafe"),
)
if err != nil {
    return err
}
fmt.Println(spam)
```

`Summarize` runs a fixed-instruction agent on the text provider and returns the
trimmed summary. The text travels as the user message, never inside the
instructions.

`Decide` asks one boolean classification question, named
`manager.DecisionName`, and reports whether the probability of true reaches the
threshold. It goes through the classification path, so the default
classification provider serves it.

| Option | Applies to | Default |
|--------|------------|---------|
| `HelperProvider(name)` | Both | The default provider for the path |
| `HelperModel(model)` | Both | The serving provider's cheapest model, or a native classifier's own default |
| `HelperTimeout(d)` | Both | None. Applied as a context deadline |
| `SummarizeSentences(n)` | `Summarize` | 3. Values below 1 become 1 |
| `DecideCriteria(whenTrue, whenFalse)` | `Decide` | Empty |
| `DecideThreshold(t)` | `Decide` | 0.5 |

## Failover

Every builder takes `WithProviders(names...)`, an ordered list. Each provider is
tried in turn and the first success is returned:

```go
resp, err := mgr.Agent(a).
    WithProviders("anthropic", "openai").
    UseCheapestModel().
    Prompt(ctx, "Draft a two-line status update.")
```

The rules:

- Any provider or transport error moves on to the next provider. After the last
  one fails, its error is returned.
- `context.Canceled` and `context.DeadlineExceeded` from your context stop
  immediately. So does `manager.ErrMaxStepsExceeded`.
- Each attempt starts from the original messages, so a provider that failed
  mid-way through a tool loop leaves nothing behind for the next one. Tools that
  already ran may run again.
- Model tiers resolve per provider, which is why `UseCheapestModel` pairs well
  with a list. An explicit `WithModel` is sent to every provider unchanged.
- `PromptStream` can fail over only until the first step starts streaming. After
  that a provider error ends the stream with `StreamError`.
- Every failed attempt still dispatches `event.ProviderError`.

## Queued prompts

`Dispatch` pushes a prompt onto the application
[queue]({{< relref "/docs/advanced/queue" >}}) and returns a handle. `Then` sets
a callback for the result:

```go
handle, err := mgr.Agent(a).UseCheapestModel().Dispatch("Write the weekly digest.", "ai")
if errors.Is(err, manager.ErrQueueNotConfigured) {
    return err
}
if err != nil {
    return err
}

handle.Then(func(resp *agent.AgentResponse, err error) {
    if err != nil {
        return
    }
    fmt.Println(resp.Text)
})
```

The queue name is optional and defaults to `default`. `Embeddings()`, `Image()`,
`Audio()`, `Transcription()`, and `Rerank()` have the same `Dispatch` and `Then`
pair, with the callback typed to their response.

The SDK does not start a worker. Run one on the queue you dispatch to; the job's
`Handle` method does the work:

```go
worker := queue.NewWorker(s.Queue, "ai", func(j queue.Job) error {
    return j.Handle()
}, queue.WithConcurrency(2), queue.WithMaxRetries(1))
worker.Start(ctx)
```

{{% callout type="warning" %}}
How queued prompts work today:

- The job holds the builder and the callback in process memory. It is meant for
  the `memory` queue driver with a worker in the same process; it carries no
  serialized payload for a worker in another process.
- `Dispatch` enqueues before `Then` attaches the callback, and `Then` is not
  synchronized with the worker. A worker that is already polling can run the job
  before the callback is set, and the result is then dropped. Until this is
  fixed, hold your own lock across `Dispatch` and `Then` and take the same lock
  in the worker handler before calling `Handle`.
- The job runs with `context.Background()`. Cancelling the caller's context or
  stopping the worker does not interrupt an in-flight provider call.
- A job that fails invokes the callback from the run and again when the worker
  gives up on it. Make the callback safe to call more than once.
- Each retry calls the provider again.
{{% /callout %}}

### Broadcasting a response

With a [broadcaster]({{< relref "/docs/realtime/broadcast" >}}) registered,
`BroadcastNow` runs the prompt and emits the response onto channels. The event
name is `ai.agent.response` unless `WithBroadcastAs` changes it:

```go
resp, err := mgr.Agent(a).WithBroadcastAs("digest.ready").
    BroadcastNow(ctx, "Write the weekly digest.", "team.42")
if err != nil {
    return err
}
fmt.Println(resp.Text)
```

`Broadcast(prompt, channels...)` and `BroadcastOnQueue(queue, prompt, channels...)`
do the same through the queue and share the limitations above. All three return
`manager.ErrBroadcasterNotConfigured` when no broadcaster is wired.

## Middleware

Middleware wraps an agent prompt. It implements one method and decides whether to
call `next`:

```go
type redact struct{}

func (redact) Handle(prompt *agent.AgentPrompt, next func(*agent.AgentPrompt) (any, error)) (any, error) {
    for i, m := range prompt.Messages {
        prompt.Messages[i].Content = scrub(m.Content)
    }

    out, err := next(prompt)
    if err != nil {
        return nil, err
    }
    if resp, ok := out.(*provider.TextResponse); ok {
        resp.Text = scrub(resp.Text)
    }
    return out, nil
}
```

The value passed along the chain is typed `any` to keep the `agent` package free
of a dependency on `provider`; it is always a `*provider.TextResponse`.

Middleware attaches at three levels and runs in this order: global, per agent,
per request.

```go
// Global: runs on every agent prompt made through this Manager.
mgr.Use(middleware.LogPrompts(func(p *agent.AgentPrompt, response any, d time.Duration, err error) {
    logger.Info("ai prompt", "model", p.Model, "messages", len(p.Messages), "duration", d, "error", err)
}))

// Per agent.
a := agent.New("You answer billing questions.").
    WithMiddleware(redact{}).
    Build()

// Per request.
resp, err := mgr.Agent(a).
    WithMiddleware(
        middleware.RateLimit(20, time.Minute, func(p *agent.AgentPrompt) string { return p.Provider }),
        middleware.Cache(10*time.Minute, func(p *agent.AgentPrompt) string {
            return p.Instructions + "\x00" + p.Messages[len(p.Messages)-1].Content
        }),
    ).
    Prompt(ctx, "When is my next invoice?")
if errors.Is(err, middleware.ErrRateLimited) {
    return
}
```

| Middleware | Behavior |
|------------|----------|
| `middleware.LogPrompts(fn)` | Calls `fn` after every prompt with the prompt, response, duration, and error |
| `middleware.RateLimit(limit, window, keyFn)` | Sliding window per key. Over the limit returns `middleware.ErrRateLimited` without calling the provider |
| `middleware.Cache(ttl, keyFn)` | Returns a stored response for a repeated key without calling the provider |

Limits to know:

- The chain wraps the whole run, including failover and the tool loop, so it
  executes once per `Prompt`, not once per provider call.
- Middleware runs for `Prompt` only. `Stream`, `PromptStream`, and the
  non-agent builders (embeddings, images, classification) bypass it.
- `RateLimit` and `Cache` keep their state in the middleware value, in process
  memory. Build each once and reuse it. They are not shared across instances,
  and their maps are not evicted.

## Events

When an event dispatcher is wired, the SDK dispatches a typed event at each stage
of a call. Listen for them like any other
[event]({{< relref "/docs/advanced/events" >}}):

```go
func Events(logger log.Logger) func(events.Dispatcher) {
    return func(d events.Dispatcher) {
        d.Listen("ai.response.received", listenerFunc(func(_ context.Context, e interface{}) error {
            if ev, ok := e.(*event.ResponseReceived); ok {
                logger.Info("ai response", "provider", ev.Provider, "model", ev.Model, "tokens", ev.Usage.TotalTokens)
            }
            return nil
        }))

        d.Listen("ai.provider.error", listenerFunc(func(_ context.Context, e interface{}) error {
            if ev, ok := e.(*event.ProviderError); ok {
                logger.Error("ai provider error", "provider", ev.Provider, "model", ev.Model, "error", ev.Err)
            }
            return nil
        }))
    }
}
```

`listenerFunc` here is a small adapter that satisfies `events.Listener`:

```go
type listenerFunc func(ctx context.Context, e interface{}) error

func (f listenerFunc) Handle(ctx context.Context, e interface{}) error { return f(ctx, e) }
func (f listenerFunc) Async() bool                                     { return false }
```

| Event name | Type | Fields |
|------------|------|--------|
| `ai.prompt.sent` | `event.PromptSent` | `Provider`, `Model`, `Messages` |
| `ai.response.received` | `event.ResponseReceived` | `Provider`, `Model`, `Usage` |
| `ai.stream.started` | `event.StreamStarted` | `Provider`, `Model` |
| `ai.stream.completed` | `event.StreamCompleted` | `Provider`, `Model`, `Usage` |
| `ai.tool.invoking` | `event.ToolInvoking` | `ToolName`, `Params` |
| `ai.tool.invoked` | `event.ToolInvoked` | `ToolName`, `Result`, `Error` |
| `ai.provider.error` | `event.ProviderError` | `Provider`, `Model`, `Err` |
| `ai.embeddings.generated` | `event.EmbeddingsGenerated` | `Provider`, `Model`, `InputCount`, `Usage` |
| `ai.documents.reranked` | `event.DocumentsReranked` | `Provider`, `Model`, `DocumentCount` |
| `ai.image.generated` | `event.ImageGenerated` | `Provider`, `Model` |
| `ai.audio.generated` | `event.AudioGenerated` | `Provider`, `Model` |
| `ai.transcription.completed` | `event.TranscriptionCompleted` | `Provider`, `Model` |
| `ai.file.uploaded` | `event.FileUploaded` | `Provider`, `FileID`, `FileName` |
| `ai.file.deleted` | `event.FileDeleted` | `Provider`, `FileID` |
| `ai.store.created` | `event.StoreCreated` | `Provider`, `StoreID`, `StoreName` |
| `ai.store.deleted` | `event.StoreDeleted` | `Provider`, `StoreID` |

Events are dispatched as pointers. An error returned by a listener is discarded
and never fails the AI call.

## Errors

Every failure is a returned error; the SDK does not panic. Test for the sentinel
errors with `errors.Is`:

```go
resp, err := mgr.Agent(a).Prompt(ctx, "Hello")
switch {
case err == nil:
    fmt.Println(resp.Text)
case errors.Is(err, manager.ErrNoDefaultProvider):
    // AI_DEFAULT_TEXT_PROVIDER is unset and no provider was named.
case errors.Is(err, manager.ErrProviderNotConfigured):
    // The named provider has no API key in the environment.
case errors.Is(err, manager.ErrCapabilityNotSupported):
    // The provider exists but does not implement this capability.
case errors.Is(err, manager.ErrMaxStepsExceeded):
    // The tool loop hit its step limit.
case errors.Is(err, context.DeadlineExceeded):
    // The caller's context expired.
default:
    // A provider or transport error.
}
```

| Error | Returned when |
|-------|---------------|
| `manager.ErrNoDefaultProvider` | No provider was named and the capability has no default |
| `manager.ErrProviderNotConfigured` | The named provider has no entry in the config |
| `manager.ErrCapabilityNotSupported` | The provider does not implement the capability |
| `manager.ErrMaxStepsExceeded` | The tool loop reached its step limit |
| `manager.ErrQueueNotConfigured` | `Dispatch` was called with no queue driver |
| `manager.ErrBroadcasterNotConfigured` | A `Broadcast*` method was called with no broadcaster |
| `manager.ErrWebSocketNotConfigured` | `StreamToGroup` was called with no WebSocket server |
| `manager.ErrClientDisconnected` | `StreamToClient` lost its client |
| `manager.ErrNoQuestions` | A classification had no questions |
| `manager.ErrDuplicateQuestion` | Two questions in one classification share a name |
| `manager.ErrUnsupportedQuestion` | A question type from outside the `classify` package |
| `manager.ErrInvalidClassification` | A chat model's classification output could not be read |
| `provider.ErrMissingAPIKey` | A provider was created with an empty API key |
| `provider.ErrStreamClosed` | A stream was read after `Close` |
| `provider.ErrRateLimited` | The provider answered with a rate limit |
| `provider.ErrOverloaded` | The provider is overloaded or unreachable behind its gateway |
| `registry.ErrProviderNotFound` | No driver is registered under that name |
| `middleware.ErrRateLimited` | The `RateLimit` middleware rejected the prompt |
| `classify.ErrEmptyQuestion` | A question has no text |
| `classify.ErrTooFewOptions`, `classify.ErrInvalidOption` | A choice question has fewer than two options, or an unnamed or repeated one |
| `classify.ErrTooFewLevels`, `classify.ErrLevelsNotOrdered` | A score question has fewer than two levels, or values that do not ascend |
| `classify.ErrInvalidProbabilities`, `classify.ErrInvalidConfidence` | An answer was built from invalid values (provider authors and fakes) |

{{% callout type="warning" %}}
Only the `typesafe` driver maps HTTP status codes to `provider.ErrRateLimited`
and `provider.ErrOverloaded` today. The OpenAI, Anthropic, Cohere, and Jina
drivers return a plain error for those responses, so `errors.Is` does not match
them.

Provider errors can carry text from the upstream API. Log them on the server and
return a generic message to the client.
{{% /callout %}}

## Testing

The `fake` package has a test double for every capability. `fake.NewManager`
returns a real `*manager.Manager` wired to the fakes you pass, each registered as
the default for its capability, and cleans up when the test ends. Tests need no
API keys and make no network calls.

Given this function:

```go
// Reply drafts an answer to a ticket unless the ticket is spam.
func Reply(ctx context.Context, mgr *manager.Manager, ticket string) (string, error) {
    spam, err := mgr.Decide(ctx, ticket, "Is this ticket spam?")
    if err != nil {
        return "", err
    }
    if spam {
        return "", nil
    }

    a := agent.New("You draft replies to support tickets.").Build()
    resp, err := mgr.Agent(a).Prompt(ctx, ticket)
    if err != nil {
        return "", err
    }
    return resp.Text, nil
}
```

its tests script the fakes, call the function, and assert on what was sent:

```go
package support

import (
    "context"
    "testing"

    "github.com/velocitykode/velocity-ai/fake"
)

func TestReply(t *testing.T) {
    text := fake.Text(fake.TextResponse("Thanks, we are on it.")).PreventStray()
    classifier := fake.Classification().WithDecision(false)

    mgr := fake.NewManager(t,
        fake.WithText(text),
        fake.WithClassification(classifier),
    )

    got, err := Reply(context.Background(), mgr, "The export button does nothing.")
    if err != nil {
        t.Fatal(err)
    }
    if got != "Thanks, we are on it." {
        t.Fatalf("got %q", got)
    }

    classifier.AssertDecided(t, "The export button does nothing.", "Is this ticket spam?")
    text.AssertCallCount(t, 1)
    text.AssertCalledWith(t, "The export button does nothing.")
}

func TestReply_Spam(t *testing.T) {
    text := fake.Text().PreventStray()
    classifier := fake.Classification().WithDecision(true)

    mgr := fake.NewManager(t, fake.WithText(text), fake.WithClassification(classifier))

    got, err := Reply(context.Background(), mgr, "Buy cheap watches")
    if err != nil {
        t.Fatal(err)
    }
    if got != "" {
        t.Fatalf("got %q, want no reply", got)
    }
    text.AssertNotCalled(t)
}
```

### Scripting responses

```go
// A tool call followed by the final answer: responses are returned in order.
text := fake.Text(
    &provider.TextResponse{ToolCalls: []provider.ToolCallEvent{
        {ID: "call_1", Name: "get_weather", Params: map[string]any{"city": "Lahore"}},
    }},
    fake.TextResponse("It is 21 degrees in Lahore."),
)

// A response computed from the prompt.
echo := fake.Text().WithCallback(func(_ context.Context, p *agent.AgentPrompt) (*provider.TextResponse, error) {
    return fake.TextResponse("echo: " + p.Messages[len(p.Messages)-1].Content), nil
})

// A provider failure.
down := fake.Text().WithCallback(func(context.Context, *agent.AgentPrompt) (*provider.TextResponse, error) {
    return nil, errors.New("upstream unavailable")
})

// Classification answers, keyed by question name.
classifier := fake.Classification().
    WithBoolean("urgent", 0.93).
    WithChoice("topic", "bug").
    WithChoiceConfidence("topic", 0.88).
    WithScoreWeights("anger", map[int]float64{2: 1, 3: 3})
```

- Canned responses are returned in order, and the last one repeats.
- `WithCallback` replaces the canned responses.
- `PreventStray()` turns a call with nothing scripted into an error, which
  catches AI calls you did not expect.
- An unscripted classification question gets a deterministic default: false, the
  first option, or the lowest level. Answers carry no confidence unless you
  script one with `WithChoiceConfidence` or `WithScoreConfidence`.
- `Summarize` is scripted as a text response; `Decide` with `WithDecision` or
  `WithDecisionProbability`.

### Fakes and assertions

| Constructor | Registered with | Assertions beyond `AssertCalled`, `AssertNotCalled`, `AssertCallCount` |
|-------------|-----------------|-----------------------------------------------------------------------|
| `fake.Text(...)` | `fake.WithText` | `AssertCalledWith(text)`, `AssertSummarized(text)`, `AssertNotSummarized(text)` |
| `fake.Classification()` | `fake.WithClassification` | `AssertClassified`, `AssertNotClassified`, `AssertClassifiedWith(text)`, `AssertClassifiedMatching(fn)`, `AssertDecided(text, question)`, `AssertNotDecided(text, question)` |
| `fake.Embedding(...)` | `fake.WithEmbedding` | |
| `fake.Reranking(...)` | `fake.WithReranking` | `AssertCalledWithQuery(query)` |
| `fake.Image(...)` | `fake.WithImage` | `AssertCalledWith(prompt)` |
| `fake.Audio(...)` | `fake.WithAudio` | `AssertCalledWith(text)` |
| `fake.Transcription(...)` | `fake.WithTranscription` | |
| `fake.File(...)` | `fake.WithFile` | `AssertGetFileCalledWith`, `AssertPutFileCalledWithName`, `AssertDeleteFileCalledWith` |
| `fake.Store(...)` | `fake.WithStore` | `AssertCalledWith(storeID)`, `AssertCreateStoreCalledWith(name)`, `AssertAddFileCalledWith(storeID, fileID)` |

The classification fake uses `AssertClassified`, `AssertNotClassified`, and
`AssertCallCount` in place of `AssertCalled` and `AssertNotCalled`. Every fake
exposes `Calls()` for assertions the helpers do not cover, and the text fake's
`Stream` emits its response as a single delta.
