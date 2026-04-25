/**
 * Main JavaScript
 * Handles copy buttons, mobile navigation, and other interactions
 */
(function() {
  // Copy button functionality
  function initCopyButtons() {
    document.querySelectorAll('.code-copy-btn, .code-block-copy, .cta-copy-btn').forEach(button => {
      button.addEventListener('click', async () => {
        const codeBlock = button.closest('.code-block-simple, .code-block, .cta-install');
        const code = codeBlock?.querySelector('code, pre')?.textContent;

        if (code) {
          try {
            await navigator.clipboard.writeText(code.trim());
            button.classList.add('copied');

            setTimeout(() => {
              button.classList.remove('copied');
            }, 2000);
          } catch (e) {
            console.error('Failed to copy:', e);
          }
        }
      });
    });
  }

  // Mobile navigation
  function initMobileNav() {
    const toggle = document.getElementById('mobile-nav-toggle');
    const mobileMenu = document.getElementById('mobile-menu');
    const sidebar = document.querySelector('.docs-sidebar');

    // Determine if we're on a docs page
    const isDocsPage = !!sidebar;

    if (toggle) {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();

        if (isDocsPage && sidebar) {
          // On docs pages, toggle sidebar only
          const isOpen = sidebar.classList.toggle('open');
          toggle.classList.toggle('open', isOpen);
          toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        } else if (mobileMenu) {
          // On other pages, toggle mobile menu
          const isOpen = mobileMenu.classList.toggle('open');
          toggle.classList.toggle('open', isOpen);
          toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        }
      });

      // Close when clicking outside
      document.addEventListener('click', (e) => {
        if (!toggle.contains(e.target)) {
          if (isDocsPage && sidebar && !sidebar.contains(e.target)) {
            sidebar.classList.remove('open');
            toggle.classList.remove('open');
            toggle.setAttribute('aria-expanded', 'false');
          } else if (mobileMenu && !mobileMenu.contains(e.target)) {
            mobileMenu.classList.remove('open');
            toggle.classList.remove('open');
            toggle.setAttribute('aria-expanded', 'false');
          }
        }
      });

      // Close menu when clicking a link
      if (mobileMenu) {
        mobileMenu.querySelectorAll('a').forEach(link => {
          link.addEventListener('click', () => {
            mobileMenu.classList.remove('open');
            toggle.classList.remove('open');
            toggle.setAttribute('aria-expanded', 'false');
          });
        });
      }
    }
  }

  // Tabs functionality
  function initTabs() {
    document.querySelectorAll('.tabs').forEach(tabContainer => {
      const triggers = tabContainer.querySelectorAll('.tab-trigger');
      const panels = tabContainer.querySelectorAll('.tab-panel');

      triggers.forEach((trigger, index) => {
        trigger.addEventListener('click', () => {
          triggers.forEach(t => t.classList.remove('active'));
          panels.forEach(p => p.classList.remove('active'));

          trigger.classList.add('active');
          if (panels[index]) {
            panels[index].classList.add('active');
          }
        });
      });
    });
  }

  // Versus interactive comparison
  function initVersus() {
    const container = document.querySelector('.versus-container');
    if (!container) return;

    const items = container.querySelectorAll('.versus-item');
    const details = container.querySelectorAll('.versus-detail-content');

    items.forEach(item => {
      item.addEventListener('click', () => {
        const detailId = item.getAttribute('data-detail');

        items.forEach(i => i.classList.remove('active'));
        details.forEach(d => d.classList.remove('active'));

        item.classList.add('active');
        container.querySelector(`.versus-detail-content[data-detail="${detailId}"]`)?.classList.add('active');
      });
    });
  }

  // Table of contents scroll spy
  function initScrollSpy() {
    const toc = document.querySelector('.docs-toc');
    if (!toc) return;

    // Hugo renders {{ .TableOfContents }} as a nav>ul tree of plain <a>.
    // Also match a .toc-link class in case custom TOCs use it.
    const links = Array.from(toc.querySelectorAll('nav a, .toc-link'));
    const linkByHeading = new Map();
    links.forEach(link => {
      const id = (link.getAttribute('href') || '').replace(/^#/, '');
      const heading = id ? document.getElementById(id) : null;
      if (heading) linkByHeading.set(heading, link);
    });
    if (!linkByHeading.size) return;

    const setActive = (heading) => {
      links.forEach(l => l.classList.remove('active'));
      linkByHeading.get(heading)?.classList.add('active');
    };

    // Read navbar height from CSS so it tracks the actual var.
    const navH = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--navbar-height'),
      10,
    ) || 80;

    // rootMargin shrinks the observer viewport:
    //   top = navbar + small buffer (so a heading right below the navbar counts)
    //   bottom = shrink so only the upper portion of the viewport activates entries
    const observer = new IntersectionObserver((entries) => {
      // Of the currently intersecting headings pick the topmost one so the
      // active link tracks where the reader actually is.
      const hit = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit) setActive(hit.target);
    }, {
      rootMargin: `-${navH + 16}px 0px -65% 0px`,
      threshold: 0,
    });

    linkByHeading.forEach((_, heading) => observer.observe(heading));
  }

  // Smooth scroll for anchor links
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', (e) => {
        const targetId = anchor.getAttribute('href')?.slice(1);
        const target = targetId ? document.getElementById(targetId) : null;
        if (!target) return;

        e.preventDefault();

        // If this is a TOC link, mark it active straight away - the user
        // shouldn't have to wait for the IntersectionObserver to settle.
        const toc = anchor.closest('.docs-toc');
        if (toc) {
          toc.querySelectorAll('nav a, .toc-link').forEach(l =>
            l.classList.remove('active'),
          );
          anchor.classList.add('active');
        }

        target.scrollIntoView({ block: 'start' });
        history.pushState(null, '', `#${targetId}`);
      });
    });
  }

  // File tree interactivity
  function initFileTree() {
    const fileTree = document.querySelector('.file-tree');
    const codePreview = document.querySelector('.file-tree-preview');

    if (!fileTree || !codePreview) return;

    fileTree.querySelectorAll('.file-tree-item[data-content]').forEach(item => {
      item.addEventListener('click', () => {
        fileTree.querySelectorAll('.file-tree-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        const content = item.getAttribute('data-content');
        const filename = item.getAttribute('data-filename');

        if (codePreview) {
          const filenameEl = codePreview.querySelector('.code-block-filename');
          const codeEl = codePreview.querySelector('code');

          if (filenameEl) filenameEl.textContent = filename;
          if (codeEl) codeEl.textContent = content;
        }
      });
    });
  }

  // Bring the currently-active left-sidebar link into view on load. If
  // the active entry is far down the nav list and the sidebar's
  // internal scroll is at the top, the user can't see where they are.
  function initSidebarScrollToActive() {
    const sidebar = document.querySelector('.docs-sidebar');
    const active = sidebar?.querySelector('.sidebar-link.active');
    if (!sidebar || !active) return;

    // Manual offset (not scrollIntoView) so we only move the sidebar's
    // internal scroll, not the window - and so we can place the active
    // link in the upper third for context.
    const activeTop = active.offsetTop;
    const targetTop = activeTop - sidebar.clientHeight / 3;
    sidebar.scrollTop = Math.max(0, targetTop);
  }

  // Scroll to top FAB - visible only when the page has scrolled past a
  // threshold and when there's genuinely something to scroll back to.
  // Manages two buttons: the desktop one inside the right TOC sidebar and the
  // mobile floating one. CSS picks which is actually visible per viewport.
  function initScrollToTop() {
    const btns = Array.from(
      document.querySelectorAll('#scroll-to-top, #scroll-to-top-mobile'),
    );
    if (!btns.length) return;

    const THRESHOLD = 400;
    let raf = 0;

    const update = () => {
      raf = 0;
      const scrollable = (document.documentElement.scrollHeight - window.innerHeight) > THRESHOLD;
      const show = scrollable && window.scrollY > THRESHOLD;
      btns.forEach(btn => {
        // Only toggle the [hidden] attribute on the desktop button. The mobile
        // FAB uses opacity/pointer-events via the .visible class, and setting
        // [hidden] would defeat its `display: flex` rule via the UA stylesheet.
        if (btn.id === 'scroll-to-top') btn.hidden = !show;
        btn.classList.toggle('visible', show);
      });
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    update();
  }

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    initCopyButtons();
    initMobileNav();
    initTabs();
    initVersus();
    initScrollSpy();
    initSmoothScroll();
    initFileTree();
    initScrollToTop();
    initSidebarScrollToActive();
  });
})();
