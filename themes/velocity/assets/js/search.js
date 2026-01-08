/**
 * Search functionality
 * Uses FlexSearch for fast client-side search
 */
(function() {
  const modal = document.getElementById('search-modal');
  const trigger = document.getElementById('search-trigger');
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');

  let searchIndex = null;
  let searchData = [];
  let selectedIndex = -1;

  // Keyboard shortcut to open search
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      openSearch();
    }
    if (e.key === 'Escape' && modal?.classList.contains('open')) {
      closeSearch();
    }
  });

  // Open search modal
  function openSearch() {
    if (!modal) return;
    modal.classList.add('open');
    input?.focus();
    document.body.style.overflow = 'hidden';
    loadSearchIndex();
  }

  // Close search modal
  function closeSearch() {
    if (!modal) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
    if (input) input.value = '';
    selectedIndex = -1;
    renderResults([]);
  }

  // Load search index
  async function loadSearchIndex() {
    if (searchIndex) return;

    try {
      const response = await fetch('/index.json');
      searchData = await response.json();

      // Simple search implementation (replace with FlexSearch for production)
      searchIndex = {
        search: (query) => {
          const q = query.toLowerCase();
          return searchData.filter(item =>
            item.title.toLowerCase().includes(q) ||
            (item.content && item.content.toLowerCase().includes(q))
          ).slice(0, 10);
        }
      };
    } catch (e) {
      console.error('Failed to load search index:', e);
    }
  }

  // Perform search
  function performSearch(query) {
    if (!searchIndex || !query.trim()) {
      renderResults([]);
      return;
    }

    const matches = searchIndex.search(query);
    renderResults(matches);
  }

  // Get snippet of content around search term
  function getSnippet(content, query, maxLength = 120) {
    if (!content || !query) return '';

    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerContent.indexOf(lowerQuery);

    if (index === -1) return content.slice(0, maxLength) + '...';

    const start = Math.max(0, index - 40);
    const end = Math.min(content.length, index + query.length + 80);
    let snippet = content.slice(start, end);

    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    // Highlight the search term
    const regex = new RegExp(`(${query})`, 'gi');
    snippet = snippet.replace(regex, '<mark>$1</mark>');

    return snippet;
  }

  // Render search results
  function renderResults(items) {
    if (!results) return;

    if (!items.length) {
      results.innerHTML = `
        <p style="padding: var(--space-lg); color: var(--text-tertiary); text-align: center;">
          ${input?.value ? 'No results found' : 'Type to search...'}
        </p>
      `;
      return;
    }

    const query = input?.value || '';
    results.innerHTML = items.map((item, i) => `
      <a href="${item.permalink}" class="search-result${i === selectedIndex ? ' selected' : ''}" role="option" data-index="${i}">
        <div class="search-result-title">${item.title}</div>
        <div class="search-result-snippet">${getSnippet(item.content, query)}</div>
      </a>
    `).join('');
  }

  // Navigate results with keyboard
  function navigateResults(direction) {
    const resultElements = results?.querySelectorAll('.search-result');
    if (!resultElements?.length) return;

    resultElements[selectedIndex]?.classList.remove('selected');

    if (direction === 'down') {
      selectedIndex = (selectedIndex + 1) % resultElements.length;
    } else {
      selectedIndex = selectedIndex <= 0 ? resultElements.length - 1 : selectedIndex - 1;
    }

    resultElements[selectedIndex]?.classList.add('selected');
    resultElements[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }

  // Select result
  function selectResult() {
    const resultElements = results?.querySelectorAll('.search-result');
    if (selectedIndex >= 0 && resultElements?.[selectedIndex]) {
      window.location.href = resultElements[selectedIndex].getAttribute('href');
    }
  }

  // Event listeners
  trigger?.addEventListener('click', openSearch);

  // Mobile search button on docs pages
  document.getElementById('search-btn')?.addEventListener('click', openSearch);

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeSearch();
  });

  input?.addEventListener('input', (e) => {
    selectedIndex = -1;
    performSearch(e.target.value);
  });

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateResults('down');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateResults('up');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectResult();
    }
  });

  results?.addEventListener('click', (e) => {
    const result = e.target.closest('.search-result');
    if (result) {
      window.location.href = result.getAttribute('href');
    }
  });
})();
