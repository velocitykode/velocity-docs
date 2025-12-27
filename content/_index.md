---
title: Velocity
layout: hextra-home
---


{{< hextra/hero-badge >}}
  <div class="hx-w-2 hx-h-2 hx-rounded-full" style="background-color: #dc2626;"></div>
  <span style="color: #dc2626;">Fast, Simple, Powerful</span>
{{< /hextra/hero-badge >}}

<div class="hx-mt-8 hx-mb-8">
  <h1 style="font-size: 3.8rem; line-height: 1.1; font-weight: 700; letter-spacing: -0.02em; color: #2c3e50; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    The Full Stack Framework<br />
    <span style="color: #1e3a8a;">for Rapid App Development</span>
  </h1>
</div>

<div class="hx-mb-12">
<p style="font-size: 1.25rem; line-height: 1.6; color: #5a6c7d; font-weight: 400; margin: 0 auto; max-width: 600px;">
  Build faster. Ship sooner. Scale without complexity.
</p>
</div>

<br>

<div class="hx-mb-6">
  <a href="/docs" style="display: inline-block; background-color: #1e3a8a !important; color: white !important; padding: 12px 32px; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 6px; border: 2px solid #1e3a8a; transition: all 0.2s ease; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;" onmouseover="this.style.backgroundColor='#1e3070'; this.style.borderColor='#1e3070'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(30,58,138,0.3)';" onmouseout="this.style.backgroundColor='#1e3a8a'; this.style.borderColor='#1e3a8a'; this.style.transform='translateY(0)'; this.style.boxShadow='none';">Read the Docs</a>
</div>

<div class="feature-cards-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; margin: 3rem 0;">
  <div class="feature-card-item" style="background: white; border-left: 6px solid #1e3a8a; padding: 2rem; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 8px;">
    <h3 class="feature-card-title" style="color: #1e3a8a; font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem;">Zero Config Start</h3>
    <p class="feature-card-desc" style="color: #4a5568; font-size: 1.1rem; line-height: 1.6; margin-bottom: 1.5rem;">Smart defaults that just work. Get up and running in seconds, not hours.</p>
    <ul style="list-style: none; padding: 0;">
      <li class="feature-card-list" style="color: #4a5568; font-size: 1rem; margin-bottom: 0.5rem;"><span style="color: #dc2626;">✓</span> Automatic route discovery</li>
      <li class="feature-card-list" style="color: #4a5568; font-size: 1rem; margin-bottom: 0.5rem;"><span style="color: #dc2626;">✓</span> Built-in middleware</li>
      <li class="feature-card-list" style="color: #4a5568; font-size: 1rem;"><span style="color: #dc2626;">✓</span> Production defaults</li>
    </ul>
  </div>

  <div class="feature-card-item" style="background: white; border-left: 6px solid #1e3a8a; padding: 2rem; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 8px;">
    <h3 class="feature-card-title" style="color: #1e3a8a; font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem;">Batteries Included</h3>
    <p class="feature-card-desc" style="color: #4a5568; font-size: 1.1rem; line-height: 1.6; margin-bottom: 1.5rem;">Everything you need in one framework. No hunting for packages.</p>
    <ul style="list-style: none; padding: 0;">
      <li class="feature-card-list" style="color: #4a5568; font-size: 1rem; margin-bottom: 0.5rem;"><span style="color: #dc2626;">✓</span> Routing & middleware</li>
      <li class="feature-card-list" style="color: #4a5568; font-size: 1rem; margin-bottom: 0.5rem;"><span style="color: #dc2626;">✓</span> Logging & validation</li>
      <li class="feature-card-list" style="color: #4a5568; font-size: 1rem;"><span style="color: #dc2626;">✓</span> Queues, mail & cache</li>
    </ul>
  </div>

  <div class="feature-card-item" style="background: white; border-left: 6px solid #1e3a8a; padding: 2rem; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 8px;">
    <h3 class="feature-card-title" style="color: #1e3a8a; font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem;">Type-Safe Magic</h3>
    <p class="feature-card-desc" style="color: #4a5568; font-size: 1.1rem; line-height: 1.6; margin-bottom: 1.5rem;">Incredible productivity without sacrificing Go's type safety.</p>
    <ul style="list-style: none; padding: 0;">
      <li class="feature-card-list" style="color: #4a5568; font-size: 1rem; margin-bottom: 0.5rem;"><span style="color: #dc2626;">✓</span> Full Go type checking</li>
      <li class="feature-card-list" style="color: #4a5568; font-size: 1rem; margin-bottom: 0.5rem;"><span style="color: #dc2626;">✓</span> Compile-time safety</li>
      <li class="feature-card-list" style="color: #4a5568; font-size: 1rem;"><span style="color: #dc2626;">✓</span> Zero runtime overhead</li>
    </ul>
  </div>
</div>

<style>
/* Dark mode - change card background and text (not headings) */
@media (prefers-color-scheme: dark) {
  .feature-card-item {
    background: #1a202c !important;
  }

  /* Change text colors for readability in dark mode - NOT headings */
  .feature-card-desc {
    color: #cbd5e0 !important;
  }

  .feature-card-list {
    color: #a0aec0 !important;
  }

  /* Why Velocity text - white except for emphasis */
  .why-velocity-text {
    color: #ffffff !important;
  }

  .why-velocity-text .velocity-emphasis {
    color: #4a90e2 !important;
  }
}

.dark .feature-card-item {
  background: #1a202c !important;
}

.dark .feature-card-desc {
  color: #cbd5e0 !important;
}

.dark .feature-card-list {
  color: #a0aec0 !important;
}

.dark .why-velocity-text {
  color: #ffffff !important;
}

.dark .why-velocity-text .velocity-emphasis {
  color: #4a90e2 !important;
}
</style>

<br>

<h2 class="hx-mt-16 hx-mb-8" style="color: #1e3a8a; font-size: 2.5rem; font-weight: 800; letter-spacing: -0.02em;">Why Velocity?</h2>

<p class="why-velocity-text" style="font-size: 1.1rem; line-height: 1.7; color: #000000;">
Go delivers unmatched performance and reliability. But building web applications shouldn't require writing endless boilerplate or sacrificing developer productivity. <strong class="velocity-emphasis" style="color: #1e3a8a;">Velocity gives you the best of both worlds</strong> – Go's raw power and type safety combined with a modern developer experience that lets you focus on building features, not fighting the framework.
</p>


<div style="display: flex; gap: 2rem; margin-top: 3rem; width: 100%;">
  <div style="width: 50%;">
    <h3 style="color: #dc2626; font-size: 1.8rem; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 1rem;">Move Faster</h3>
    <ul style="list-style: none; padding-left: 0;">
      <li style="margin-bottom: 1rem; padding-left: 1rem; position: relative;">
        <span style="position: absolute; left: 0; color: #dc2626;">▸</span>
        <strong>Automatic Route Discovery</strong><br>
        <span style="color: #6b7280;">Routes auto-register from your routes/ directory</span>
      </li>
      <li style="margin-bottom: 1rem; padding-left: 1rem; position: relative;">
        <span style="position: absolute; left: 0; color: #dc2626;">▸</span>
        <strong>RESTful Resources</strong><br>
        <span style="color: #6b7280;">Built-in support for RESTful controller patterns</span>
      </li>
      <li style="margin-bottom: 1rem; padding-left: 1rem; position: relative;">
        <span style="position: absolute; left: 0; color: #dc2626;">▸</span>
        <strong>Built-in Logging</strong><br>
        <span style="color: #6b7280;">Production-ready logging with multiple drivers</span>
      </li>
      <li style="margin-bottom: 1rem; padding-left: 1rem; position: relative;">
        <span style="position: absolute; left: 0; color: #dc2626;">▸</span>
        <strong>Smart Defaults</strong><br>
        <span style="color: #6b7280;">Convention-based routing, auto-initialization, and more</span>
      </li>
    </ul>
  </div>

  <div style="width: 50%;">
    <h3 style="color: #dc2626; font-size: 1.8rem; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 1rem;">Ship with Confidence</h3>
    <ul style="list-style: none; padding-left: 0;">
      <li style="margin-bottom: 1rem; padding-left: 1rem; position: relative;">
        <span style="position: absolute; left: 0; color: #dc2626;">▸</span>
        <strong>Type Safety</strong><br>
        <span style="color: #6b7280;">Full Go type checking throughout your application</span>
      </li>
      <li style="margin-bottom: 1rem; padding-left: 1rem; position: relative;">
        <span style="position: absolute; left: 0; color: #dc2626;">▸</span>
        <strong>Performance</strong><br>
        <span style="color: #6b7280;">Native Go performance with minimal overhead</span>
      </li>
      <li style="margin-bottom: 1rem; padding-left: 1rem; position: relative;">
        <span style="position: absolute; left: 0; color: #dc2626;">▸</span>
        <strong>Testing</strong><br>
        <span style="color: #6b7280;">Built-in testing utilities and factories</span>
      </li>
      <li style="margin-bottom: 1rem; padding-left: 1rem; position: relative;">
        <span style="position: absolute; left: 0; color: #dc2626;">▸</span>
        <strong>Production Ready</strong><br>
        <span style="color: #6b7280;">Single binary deployment with embedded assets</span>
      </li>
    </ul>
  </div>
</div>
