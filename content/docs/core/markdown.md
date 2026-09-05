---
title: Markdown
description: Render Markdown safely with the str helpers, or build documentation sites from embedded Markdown with the markdown package.
weight: 62
---

Velocity renders Markdown at two levels. The `str` package converts a string to HTML in one call, safe by default. The `markdown` package renders whole documents and hands back the structure a docs site needs: front matter, title, table of contents, plain text for search, and a collection helper that turns an embedded directory of Markdown files into pages, navigation, search index and llms.txt output.

## Quick Start

{{< tabs items="One string,A document,A docs site" >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/str"

html := str.Markdown("# Release notes\n\nFixes **12** bugs.")
// <h1>Release notes</h1>
// <p>Fixes <strong>12</strong> bugs.</p>

label := str.InlineMarkdown("Read the **docs**")
// Read the <strong>docs</strong>
```
{{< /tab >}}

{{< tab >}}
```go
import "github.com/velocitykode/velocity/markdown"

r := markdown.New()

doc, err := r.Render(src)
if err != nil {
    return err // only malformed front matter fails
}

doc.HTML        // template.HTML, ready for a template or an Inertia prop
doc.Title       // front matter title, else the first h1
doc.TOC         // []markdown.Heading nested from h2 and h3
doc.FrontMatter // map[string]any
doc.Plain       // text without markup, for search and llms.txt
doc.Words       // word count of Plain
```
{{< /tab >}}

{{< tab >}}
```go
import (
    "embed"

    "github.com/velocitykode/velocity/markdown"
)

//go:embed docs
var docsFS embed.FS

site, err := markdown.LoadFS(docsFS, "docs", markdown.New())
if err != nil {
    return err
}

site.Tree()                 // sections and pages, ordered by weight
site.Find("apps/deploy")    // by slug or by path
site.SearchIndex("/docs")   // title, section, url, excerpt per page
site.LLMSText("https://example.com/docs")
```
{{< /tab >}}

{{< /tabs >}}

{{% callout type="info" %}}
**Safe by default.** Both levels strip raw HTML and drop link, image and autolink destinations that use `javascript:`, `vbscript:`, `file:` or a non-image `data:` scheme. Pass `markdown.AllowHTML()` only for input you trust.
{{% /callout %}}

## String Helpers

`str.Markdown` renders CommonMark plus the GitHub extensions: tables, strikethrough, task lists and autolinks. Headings render as bare `<h1>` through `<h6>` and fenced code as `<pre><code class="language-go">`. It fits user-facing content such as comments, descriptions and release notes.

```go
str.Markdown("- [x] shipped\n- [ ] pending")
// <ul>
// <li><input checked="" disabled="" type="checkbox"> shipped</li>
// <li><input disabled="" type="checkbox"> pending</li>
// </ul>

str.Markdown("Visit https://vel.build")
// <p>Visit <a href="https://vel.build">https://vel.build</a></p>
```

`str.InlineMarkdown` recognises inline syntax only and wraps nothing in `<p>`. Block syntax such as `# ` or `- ` stays literal text, which makes it the right call for labels, titles and single-line fields.

```go
str.InlineMarkdown("**Bold** and `code` with a [link](/docs)")
// <strong>Bold</strong> and <code>code</code> with a <a href="/docs">link</a>

str.InlineMarkdown("# not a heading")
// # not a heading
```

Both accept the same options as the `markdown` package, and the fluent interface mirrors them:

```go
str.Markdown(trusted, markdown.AllowHTML())
str.Markdown(body, markdown.WithLinkRewrite(func(href string) string {
    return strings.TrimSuffix(href, ".md")
}))

str.Of("**bold**").InlineMarkdown().Upper().String()
// <STRONG>BOLD</STRONG>
```

What the safety defaults do to hostile input:

```go
str.Markdown("hello <script>alert(1)</script>")
// <p>hello alert(1)</p>

str.Markdown("[click](javascript:alert(1))")
// <p><a>click</a></p>

str.Markdown("![x](data:text/html,x)")
// <p><img alt="x"></p>
```

## Documents

`markdown.New` builds a `*Renderer`. Build it once, at startup or as a package variable, and reuse it: it holds no per-document state and is safe for concurrent use.

```go
var docs = markdown.New(
    markdown.TOCLevels(2, 4),
    markdown.WithHighlighter(chroma.New()),
)
```

### Front matter

A YAML block between `---` lines at the top of the file is decoded into `Document.FrontMatter` and removed from the body. `title`, when it is a non-empty string, becomes `Document.Title`; otherwise the first h1 does.

```markdown
---
title: Deploy an app
weight: 2
description: Ship a Velocity app to Velship.
---
# Deploy an app
```

`markdown.ParseFrontMatter(src)` splits the block on its own, for code that builds a navigation tree before rendering. A `---` line with no closing fence is a thematic break, not front matter, and malformed YAML is the one error `Render` returns.

### Headings and the table of contents

Every heading gets a stable, GitHub-style id: lower-cased, punctuation removed, spaces turned into hyphens, letters of any script kept. Repeated headings get `-1`, `-2` suffixes and `## Title {#custom-id}` sets an explicit id. Explicit ids win wherever they appear in the document: a generated id never takes a slug an explicit id claims, so `## Foo` followed by `## Bar {#foo}` renders `foo-1` and `foo`. Headings from h2 down carry an anchor link:

```html
<h2 id="install">Install<a class="anchor" href="#install" aria-label="Link to this section">#</a></h2>
```

`Document.TOC` nests the h2 and h3 headings in document order; `markdown.TOCLevels(min, max)` widens or narrows the range.

```go
type Heading struct {
    ID       string
    Level    int
    Text     string    // heading text without markup
    Children []Heading
}
```

`markdown.WithHeading(fn)` replaces the heading markup. The hook receives the `Heading` (with its id and plain text) and the rendered inline body:

```go
markdown.WithHeading(func(w io.Writer, h markdown.Heading, body template.HTML) {
    fmt.Fprintf(w, `<h%d id="%s">%s</h%d>`+"\n", h.Level, h.ID, body, h.Level)
})
```

### Extensions

Tables, strikethrough, task lists, autolinks, footnotes and definition lists are on. Smart punctuation is off on purpose: quotes, dashes and ellipses in code-heavy prose render as typed.

### Container directives

A fenced block of three or more colons followed by a name groups content under a directive. An optional title follows the name.

```markdown
:::note
Rendering is pure and reusable.
:::

:::warning Keys rotate
Restarting the process rotates the signing key.
:::
```

Any name renders as a neutral callout, labelled with the title or the capitalised name:

```html
<aside class="callout" data-kind="note"><p class="callout-label">Note</p><p>Rendering is pure and reusable.</p>
</aside>
```

`:::steps` turns the h3 headings in its body into an ordered list, one `<li>` per step; content before the first h3 renders ahead of the list.

```markdown
:::steps
### Install the CLI
Run the installer.
### Create an app
Run `vel new`.
:::
```

```html
<ol class="steps"><li><h3 id="install-the-cli">Install the CLI<a class="anchor" ...>#</a></h3>
<p>Run the installer.</p>
</li>
<li><h3 id="create-an-app">Create an app<a class="anchor" ...>#</a></h3>
<p>Run <code>vel new</code>.</p>
</li>
</ol>
```

A line of colons inside a fenced code block is code, not the end of the directive, so examples that show the directive syntax render as expected. To nest directives, give the outer fence more colons than the inner one:

```markdown
::::steps
### First
:::note
Nested inside a step.
:::
::::
```

`markdown.WithContainer(name, fn)` replaces the markup for one name. The hook receives the title and the rendered body; for `steps` the body is the sequence of `<li>` items.

```go
markdown.WithContainer("note", func(w io.Writer, title string, body template.HTML) {
    fmt.Fprintf(w, `<div class="admonition admonition-note">%s</div>`+"\n", body)
})
```

### Code blocks

The info string carries the language and optional `key=value` attributes. A `title` wraps the block in a figure:

````markdown
```go title="main.go"
fmt.Println("hi")
```
````

```html
<figure class="code"><figcaption>main.go</figcaption><pre><code class="language-go">fmt.Println(&quot;hi&quot;)
</code></pre></figure>
```

`markdown.WithCodeBlock(fn)` replaces the markup for every fenced and indented block:

```go
markdown.WithCodeBlock(func(w io.Writer, b markdown.CodeBlock) {
    // b.Lang, b.Title, b.Attrs, b.Code (raw source), b.Body (highlighted or escaped)
    fmt.Fprintf(w, `<code-block lang="%s" title="%s">%s</code-block>`+"\n", b.Lang, b.Title, b.Body)
})
```

Highlighting is a hook. `markdown.WithHighlighter(fn)` receives the language and source and returns the markup for the inside of `<code>`, or reports false to keep the escaped source. The `markdown/chroma` subpackage adapts Chroma so the base package carries no highlighter dependency:

```go
import "github.com/velocitykode/velocity/markdown/chroma"

r := markdown.New(markdown.WithHighlighter(chroma.New()))

// Tokens carry CSS classes; serve the stylesheet for a Chroma style once.
// Its rules are scoped to pre, matching the default markup, so the pre
// takes the style's background and every token its colour with no wiring.
css, err := chroma.Stylesheet("github")

// Or emit inline styles for self-contained output. Only the tokens carry
// styles; give the pre the style's background yourself.
r = markdown.New(markdown.WithHighlighter(chroma.New(chroma.WithStyle("monokai"))))
```

### Link rewriting

Docs written for GitHub link to sibling files. `markdown.WithLinkRewrite(fn)` maps every link and image destination before it is written; the safety check runs on the original and on the rewritten value.

```go
markdown.WithLinkRewrite(func(href string) string {
    if strings.Contains(href, "://") || !strings.HasSuffix(href, ".md") {
        return href
    }
    href = strings.TrimPrefix(strings.TrimPrefix(href, "../"), "./")
    return "/docs/" + strings.TrimSuffix(href, ".md")
})
// ../apps/deploy.md becomes /docs/apps/deploy
```

### Basic and inline modes

`markdown.Basic()` limits the engine to CommonMark plus the GitHub extensions with plain headings and code blocks and no front matter, directives, footnotes or definition lists. `markdown.Inline()` renders inline syntax only, with no block wrappers. `str.Markdown` and `str.InlineMarkdown` use these modes.

## Sites

`markdown.LoadFS(fsys, root, r)` walks every `.md` and `.markdown` file below `root`, renders each with `r` (a default renderer when nil) and returns a `*Collection`. The first file that fails to render aborts the load with an error naming the file.

### Pages

```go
type Page struct {
    Path     string    // apps/deploy.md, relative to root
    Slug     string    // apps/deploy; index pages take their directory
    Section  string    // front matter section, else the first directory
    Weight   int       // front matter weight, 0 when absent
    Index    bool      // index.md, _index.md or README.md
    Document *Document
    Source   []byte    // Markdown body, front matter removed
}

page.URL("/docs")   // /docs/apps/deploy; the root index gives /docs
```

### Navigation

`Tree()` returns the sections in order: root-level pages first, then sections by the weight of their index page (lower first), then by name. A section without an index page, or whose index page has no weight, comes after every weighted section, alphabetically. Within a section the index page leads and the rest sort by weight, then title, then path; unweighted pages follow every weighted one. Authors weight what matters and the rest fall in alphabetically. The docs navigation depends on this order, so give every section an index page with a weight.

```go
for _, section := range site.Tree() {
    fmt.Println(section.Title)            // index title, or "Getting Started" from getting-started
    for _, page := range section.Pages {
        fmt.Println("  ", page.Document.Title, page.URL("/docs"))
    }
}

page, ok := site.Find("apps/deploy")      // slug or path, leading slash ignored
prev, next := site.Prev(page), site.Next(page)  // within the section, nil at the ends
```

### Search and llms.txt

`SearchIndex(baseURL)` returns one entry per page with the title, section name, url and an excerpt: the front matter `description` when present, otherwise the opening words of the plain text.

`LLMSText(baseURL)` renders an llms.txt index: an H1 with the root index title, its description as a blockquote, then one H2 per section listing `- [title](url): excerpt`. `LLMSFullText(baseURL)` concatenates every page as an H1, a `URL:` line and the Markdown body.

```go
r.Get("/llms.txt", func(ctx *router.Context) error {
    return ctx.String(200, site.LLMSText("https://example.com/docs"))
})
```

### Serving through Inertia

```go
func (h *DocsHandler) Show(ctx *router.Context) error {
    page, ok := site.Find(ctx.Param("slug"))
    if !ok {
        return router.NewHTTPError(404, "page not found")
    }
    props := view.Props{
        "nav":   site.Tree(),
        "title": page.Document.Title,
        "html":  page.Document.HTML,
        "toc":   page.Document.TOC,
    }
    if prev := site.Prev(page); prev != nil {
        props["prev"] = map[string]string{"title": prev.Document.Title, "url": prev.URL("/docs")}
    }
    if next := site.Next(page); next != nil {
        props["next"] = map[string]string{"title": next.Document.Title, "url": next.URL("/docs")}
    }
    return view.Render(ctx, "Docs/Show", props)
}
```

### Hook types

```go
type Option func(*config)                                            // markdown.New and the str helpers accept these
type ContainerFunc func(w io.Writer, title string, body template.HTML) // markdown.WithContainer
type CodeBlockFunc func(w io.Writer, block CodeBlock)                  // markdown.WithCodeBlock
type Highlighter   func(lang, code string) (template.HTML, bool)       // markdown.WithHighlighter
type HeadingFunc   func(w io.Writer, heading Heading, body template.HTML) // markdown.WithHeading

type SearchEntry struct {                                              // (*Collection).SearchIndex
    Title   string
    Section string
    URL     string
    Excerpt string
}
```

`chroma.Option` values configure `chroma.New`; `chroma.WithStyle` is the only one today.

## API Reference

| Symbol | Purpose |
|--------|---------|
| `str.Markdown(s, opts...)` | Render GitHub Flavored Markdown to HTML |
| `str.InlineMarkdown(s, opts...)` | Render inline Markdown with no block wrappers |
| `markdown.New(opts...)` | Build a reusable, concurrency-safe `*Renderer` |
| `(*Renderer).Render(src)` | Render a document to a `*Document` |
| `markdown.ParseFrontMatter(src)` | Split YAML front matter from a source |
| `markdown.Slug(text)` | GitHub-style heading id |
| `markdown.AllowHTML()` | Pass raw HTML and unsafe destinations through |
| `markdown.Basic()` | CommonMark plus GitHub extensions only |
| `markdown.Inline()` | Inline syntax only, no block wrappers |
| `markdown.TOCLevels(min, max)` | Heading levels collected into the TOC |
| `markdown.WithContainer(name, fn)` | Replace the markup of one directive |
| `markdown.WithCodeBlock(fn)` | Replace the code block markup |
| `markdown.WithHighlighter(fn)` | Plug in syntax highlighting |
| `markdown.WithLinkRewrite(fn)` | Map link and image destinations |
| `markdown.WithHeading(fn)` | Replace the heading markup |
| `markdown.LoadFS(fsys, root, r)` | Render a directory of Markdown into a `*Collection` |
| `(*Collection).Pages()` | Every page in navigation order |
| `(*Collection).Tree()` | Sections and pages ordered by weight |
| `(*Collection).Find(key)` | Look up a page by slug or path |
| `(*Collection).Prev(p)`, `Next(p)` | Neighbours within a section |
| `(*Collection).SearchIndex(baseURL)` | Search entries with excerpts |
| `(*Collection).LLMSText(baseURL)` | llms.txt index |
| `(*Collection).LLMSFullText(baseURL)` | llms-full.txt body |
| `(*Page).URL(baseURL)` | Public URL of a page |
| `chroma.New(opts...)` | Chroma-backed `markdown.Highlighter` |
| `chroma.WithStyle(name)` | Inline styles instead of CSS classes |
| `chroma.Stylesheet(name)` | CSS for class-based output, scoped to `pre` |
