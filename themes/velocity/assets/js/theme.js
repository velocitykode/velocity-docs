/**
 * Theme Toggle — V3 segmented [ dark | light ] chip.
 * - persists to localStorage under key "velocity-theme"
 * - on first load, respects saved value, then prefers-color-scheme, falling
 *   back to dark
 * - mutates document.documentElement.dataset.theme + .classList ("dark"/"")
 *   so CSS [data-theme="..."] selectors work and any legacy .dark consumers
 *   keep matching
 */
(function () {
  const STORAGE_KEY = 'velocity-theme';

  function readInitial() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    } catch (_) { /* ignore */ }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark';
  }

  function applyTheme(theme) {
    const html = document.documentElement;
    html.dataset.theme = theme;
    if (theme === 'dark') html.classList.add('dark');
    else html.classList.remove('dark');

    // Sync any V3-style segmented toggle in the DOM
    document.querySelectorAll('.theme-toggle-v3').forEach((btn) => {
      btn.dataset.active = theme;
      const next = theme === 'dark' ? 'light' : 'dark';
      btn.setAttribute('aria-label', `Switch to ${next} theme`);
      btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
      btn.setAttribute('title', `Switch to ${next} theme`);
    });

    // Legacy icon swap (kept for backwards compat with old .theme-toggle markup)
    document.querySelectorAll('.theme-toggle').forEach((btn) => {
      const lightIcon = btn.querySelector('.theme-icon-light');
      const darkIcon = btn.querySelector('.theme-icon-dark');
      if (lightIcon && darkIcon) {
        if (theme === 'dark') {
          lightIcon.style.display = 'block';
          darkIcon.style.display = 'none';
        } else {
          lightIcon.style.display = 'none';
          darkIcon.style.display = 'block';
        }
      }
    });
  }

  function toggleTheme() {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (_) { /* ignore */ }
  }

  // Apply (the inline FOUC-script in baseof.html has already done this once;
  // we re-apply to ensure the toggle UI state is in sync after JS runs).
  applyTheme(readInitial());

  // Bind both V3 segmented toggle and legacy icon button
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('#theme-toggle, .theme-toggle, .theme-toggle-v3');
    if (trigger) {
      e.preventDefault();
      toggleTheme();
    }
  });

  // Respond to OS theme changes when the user hasn't explicitly chosen
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (e) => {
      try {
        if (!localStorage.getItem(STORAGE_KEY)) {
          applyTheme(e.matches ? 'light' : 'dark');
        }
      } catch (_) { /* ignore */ }
    };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
  }
})();
