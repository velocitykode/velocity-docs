/**
 * Theme Toggle
 * Handles dark/light mode switching with localStorage persistence
 */
(function() {
  const STORAGE_KEY = 'velocity-theme';
  const toggle = document.getElementById('theme-toggle');
  const lightIcon = toggle?.querySelector('.theme-icon-light');
  const darkIcon = toggle?.querySelector('.theme-icon-dark');

  function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function getTheme() {
    return localStorage.getItem(STORAGE_KEY) || getSystemTheme();
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
    updateIcons(theme);
    updateLogo(theme);
  }

  function updateLogo(theme) {
    const logo = document.querySelector('.logo-img');
    if (!logo) return;

    const lightSrc = logo.getAttribute('data-light');
    const darkSrc = logo.getAttribute('data-dark');

    if (theme === 'dark' && darkSrc) {
      logo.src = darkSrc;
    } else if (lightSrc) {
      logo.src = lightSrc;
    }
  }

  function updateIcons(theme) {
    if (!lightIcon || !darkIcon) return;

    if (theme === 'dark') {
      lightIcon.style.display = 'block';
      darkIcon.style.display = 'none';
    } else {
      lightIcon.style.display = 'none';
      darkIcon.style.display = 'block';
    }
  }

  function toggleTheme() {
    const current = getTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }

  // Initialize
  const currentTheme = getTheme();
  updateIcons(currentTheme);
  updateLogo(currentTheme);

  // Event listeners
  if (toggle) {
    toggle.addEventListener('click', toggleTheme);
  }

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setTheme(e.matches ? 'light' : 'dark');
    }
  });
})();
