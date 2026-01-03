# Velocity Website Redesign Requirements

## Overview

Modernize the Velocity landing page and documentation site to establish a distinctive, professional identity that reflects the framework's core values: **Unified API**, **Driver-Based Architecture**, and **Flexibility**.

---

## Brand Foundation

### Core Identity
- **What**: Go web framework with unified API and driver-based architecture
- **Philosophy**: "Explicit over implicit"
- **Voice**: Direct, Technical, Confident, Humble

### Three Pillars (to highlight throughout)
| Pillar | Message |
|--------|---------|
| **Unified API** | One pattern across all packages |
| **Driver-Based** | Swap backends via .env config |
| **Flexible** | Full-stack or API-only |

### Taglines
- Primary: "Fast, Simple, Powerful"
- Secondary: "Unified API. Driver-based. Go-native."
- Technical: "21 packages. One API pattern. Zero configuration lock-in."

---

## Design System

### Color Palette

#### Dark Mode (Primary)
| Role | Color | Usage |
|------|-------|-------|
| Background | `#0a0a0f` | Main background |
| Surface | `#12121a` | Cards, code blocks |
| Border | `#1a1a24` | Subtle borders |
| Border Accent | `#00d9ff20` | Glowing borders |
| Primary | `#00d9ff` | Links, highlights, accents |
| Primary Hover | `#00f5ff` | Hover states |
| Text Primary | `#f0f0f5` | Headings |
| Text Secondary | `#8b8b9a` | Body text |
| Success | `#00ff88` | Positive states |
| Warning | `#ffb800` | Warnings |

#### Light Mode
| Role | Color | Usage |
|------|-------|-------|
| Background | `#ffffff` | Main background |
| Surface | `#f8f9fa` | Cards, code blocks |
| Border | `#e5e7eb` | Subtle borders |
| Primary | `#0891b2` | Links, highlights |
| Primary Hover | `#0e7490` | Hover states |
| Text Primary | `#111827` | Headings |
| Text Secondary | `#6b7280` | Body text |

### Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Headings | Inter, system | 700-800 | 2.5-4rem |
| Body | Inter, system | 400-500 | 1-1.125rem |
| Code | JetBrains Mono, Fira Code | 400 | 0.875rem |
| Monospace UI | JetBrains Mono | 500 | Varies |

### Visual Elements
- Subtle grid/matrix background pattern (low opacity)
- Glowing cyan borders on hover (cards, buttons)
- Monospace elements for technical content
- Directory tree visualizations
- Code blocks with syntax highlighting + copy button

---

## Technical Stack

### Framework
- **Hugo** (keep existing)
- **Custom theme** (replace Hextra)
- **TailwindCSS** for styling
- **Alpine.js** for minimal interactivity

### Build & Deploy
- Vercel (existing)
- Optimized for performance (no heavy JS frameworks)

---

## Landing Page Sections

### 1. Hero Section
- Version badge (e.g., "v2.0")
- Main headline: "Fast, Simple, Powerful"
- Subheadline: "The Full Stack Framework for Go"
- Tagline: "Build faster. Ship sooner. Scale without complexity."
- CTA buttons: "Get Started" (primary) + "View on GitHub" (secondary)
- Optional: Subtle animated gradient or particle effect (lightweight)

### 2. Three Pillars Feature Cards
Display the core value propositions:
```
[Icon] Unified API          [Icon] Driver-Based        [Icon] Flexible
One pattern across          Swap backends via          Full-stack or API-only
all packages                .env config                Your choice
```

Cards should have:
- Geometric icon (diamond, circle, triangle as in screenshots)
- Title
- Short description
- Subtle border glow on hover

### 3. Code Example Section
Interactive code showcase demonstrating:
- Unified API pattern across packages
- Simple, clean Go code
- Syntax highlighting
- Copy button

Example content:
```go
// Same pattern everywhere
cache.Get(key)              storage.Get(path)
cache.Put(key, val, ttl)    storage.Put(path, content)

mail.Send(message)          queue.Push(job)
```

### 4. Project Structure Showcase
Visual directory tree (as in screenshots):
- Animated/interactive file tree
- Code preview panel showing file contents
- Demonstrates Go-idiomatic structure:
  - `cmd/server/main.go`
  - `internal/handlers/`
  - `internal/middleware/`
  - `routes/web.go`

### 5. Why Velocity Section
Two-column layout:
- **Move Faster**: Auto route discovery, RESTful resources, Smart defaults
- **Ship with Confidence**: Type safety, Performance, Testing, Production ready

### 6. Comparison Section (New)
| Feature | Velocity | Other Go Frameworks |
|---------|----------|---------------------|
| Unified API | Yes | No |
| Driver-based | Yes | Partial |
| Full-stack + API | Yes | Usually one |
| Go-idiomatic | Yes | Varies |

Avoid naming competitors directly (per brand guidelines).

### 7. Social Proof Section (New)
- GitHub stars count (live badge)
- "Built with Go" badge
- Key stats: "21 packages", "X contributors"
- Optional: Testimonial quotes (when available)

### 8. CTA Section
- Final call to action
- "Get Started in Seconds"
- Installation command: `go install github.com/velocitykode/vel@latest`
- Copy button

---

## Documentation Site

### Navigation Structure
Keep existing structure:
1. Getting Started
2. CLI (Installation, Commands, Configuration)
3. Core Framework
4. Frontend & Views
5. Database & Models
6. Real-time Features
7. Advanced Topics

### Doc Page Layout
- **Left sidebar**: Navigation tree
- **Main content**: Documentation
- **Right sidebar**: Table of contents (on-page navigation)

### Doc Page Features
- Clean, fast-loading pages (no animations)
- Syntax-highlighted code blocks with copy buttons
- Collapsible sections
- Tabs for code examples (Go code vs config vs output)
- Callout boxes (tip, warning, info)
- File tree shortcode for directory structures
- Version badges where relevant

### Search
- Keep FlexSearch (fast, client-side)
- Prominent search in navbar
- Keyboard shortcut (Cmd/Ctrl + K)

---

## Components to Build

### Shortcodes (Hugo)
1. `{{< code-block >}}` - Enhanced code with language, filename, copy
2. `{{< file-tree >}}` - Directory structure visualization
3. `{{< feature-card >}}` - Landing page feature cards
4. `{{< callout >}}` - Tip/Warning/Info boxes
5. `{{< tabs >}}` - Tabbed content
6. `{{< comparison-table >}}` - Feature comparisons
7. `{{< terminal >}}` - Terminal/CLI output styling
8. `{{< version-badge >}}` - Version indicators

### Reusable Components
1. Navbar (logo, nav links, search, theme toggle, GitHub)
2. Footer (links, copyright)
3. Sidebar navigation (collapsible, hierarchical)
4. TOC (table of contents)
5. Code block (syntax highlighting, copy, filename)
6. Cards (feature, link, info)

---

## Performance Requirements

| Metric | Target |
|--------|--------|
| Lighthouse Performance | >95 |
| First Contentful Paint | <1.5s |
| Total Blocking Time | <100ms |
| Cumulative Layout Shift | <0.1 |
| Bundle Size (JS) | <50KB gzipped |
| Bundle Size (CSS) | <30KB gzipped |

### Optimization Strategies
- Minimal JavaScript (Alpine.js only where needed)
- Purged TailwindCSS
- Optimized images (WebP, lazy loading)
- Preloaded critical fonts
- No heavy animation libraries

---

## Responsive Design

### Breakpoints
| Name | Width | Changes |
|------|-------|---------|
| Mobile | <640px | Single column, hamburger nav, stacked cards |
| Tablet | 640-1024px | Two-column grids, collapsible sidebar |
| Desktop | >1024px | Full layout, three-column docs |

### Mobile-First Considerations
- Touch-friendly navigation
- Readable font sizes (min 16px body)
- Thumb-reachable CTAs
- Collapsible code blocks for long examples

---

## Accessibility Requirements

- WCAG 2.1 AA compliance
- Keyboard navigation throughout
- Skip to content links
- Proper heading hierarchy
- Alt text for all images
- Sufficient color contrast (4.5:1 for text)
- Focus indicators
- Screen reader friendly navigation

---

## Theme Toggle Implementation

### Behavior
- Default: System preference
- User choice persisted in localStorage
- Smooth transition between modes
- No flash of wrong theme on load

### Toggle Location
- Navbar (icon button)
- Keyboard shortcut (optional)

---

## Content Updates

### Landing Page Copy
Update to align with brand identity:
- Remove "Laravel-like" references
- Emphasize "Unified API" and "Driver-Based"
- Use Go terminology (handlers not controllers)
- Direct, technical tone

### Documentation
- Update terminology (controllers -> handlers, etc.)
- Reflect Go-standard project structure
- Remove framework comparison language

---

## File Structure (Custom Theme)

```
themes/velocity/
├── layouts/
│   ├── _default/
│   │   ├── baseof.html
│   │   ├── single.html
│   │   └── list.html
│   ├── index.html          # Landing page
│   ├── docs/
│   │   ├── single.html     # Doc page
│   │   └── list.html       # Doc index
│   ├── partials/
│   │   ├── head.html
│   │   ├── navbar.html
│   │   ├── sidebar.html
│   │   ├── toc.html
│   │   ├── footer.html
│   │   └── search.html
│   └── shortcodes/
│       ├── code-block.html
│       ├── file-tree.html
│       ├── feature-card.html
│       ├── callout.html
│       ├── tabs.html
│       └── terminal.html
├── assets/
│   ├── css/
│   │   ├── main.css        # TailwindCSS
│   │   └── syntax.css      # Code highlighting
│   └── js/
│       ├── main.js         # Alpine.js + core
│       ├── search.js       # FlexSearch
│       └── theme.js        # Theme toggle
├── static/
│   └── images/
└── theme.toml
```

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Create custom Hugo theme structure
- [ ] Set up TailwindCSS + build pipeline
- [ ] Implement color system (light/dark)
- [ ] Create base layouts

### Phase 2: Landing Page
- [ ] Hero section
- [ ] Feature cards
- [ ] Code example section
- [ ] Project structure showcase
- [ ] Why Velocity section
- [ ] Comparison section
- [ ] Social proof section
- [ ] CTA section

### Phase 3: Documentation
- [ ] Doc page layout
- [ ] Sidebar navigation
- [ ] Table of contents
- [ ] Search integration
- [ ] All shortcodes

### Phase 4: Polish
- [ ] Responsive testing
- [ ] Performance optimization
- [ ] Accessibility audit
- [ ] Cross-browser testing

---

## Success Criteria

1. **Visual**: Site matches brand identity (dark theme, cyan accents, professional)
2. **Performance**: All Lighthouse scores >95
3. **Usability**: Clear navigation, fast search, mobile-friendly
4. **Content**: Updated terminology, aligned with brand guidelines
5. **Maintainability**: Clean code, documented shortcodes, easy to update
