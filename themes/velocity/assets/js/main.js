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

      triggers.forEach(trigger => {
        trigger.addEventListener('click', () => {
          const targetId = trigger.getAttribute('data-tab');

          triggers.forEach(t => t.classList.remove('active'));
          panels.forEach(p => p.classList.remove('active'));

          trigger.classList.add('active');
          tabContainer.querySelector(`#${targetId}`)?.classList.add('active');
        });
      });
    });
  }

  // Table of contents scroll spy
  function initScrollSpy() {
    const toc = document.querySelector('.docs-toc');
    if (!toc) return;

    const links = toc.querySelectorAll('.toc-link');
    const headings = Array.from(links).map(link => {
      const id = link.getAttribute('href')?.replace('#', '');
      return document.getElementById(id);
    }).filter(Boolean);

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          links.forEach(link => link.classList.remove('active'));
          const activeLink = toc.querySelector(`a[href="#${entry.target.id}"]`);
          activeLink?.classList.add('active');
        }
      });
    }, { rootMargin: '-20% 0% -35% 0%' });

    headings.forEach(heading => observer.observe(heading));
  }

  // Smooth scroll for anchor links
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', (e) => {
        const targetId = anchor.getAttribute('href')?.slice(1);
        const target = document.getElementById(targetId);

        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth' });
          history.pushState(null, '', `#${targetId}`);
        }
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

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    initCopyButtons();
    initMobileNav();
    initTabs();
    initScrollSpy();
    initSmoothScroll();
    initFileTree();
  });
})();
