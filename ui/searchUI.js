window.onDOMReady(() => {
  if (typeof window.initializeSearchInputs === 'function') {
    window.initializeSearchInputs(document);
  }
});

window.enhanceSearchInput = function(input, options = {}) {
  if (!(input instanceof HTMLInputElement)) {
    return null;
  }

  if (input.dataset.searchEnhanced === 'true') {
    return {
      wrapper: input.closest('.app-search-field'),
      input,
      clearButton: input.closest('.app-search-field')?.querySelector('.app-search-clear') || null
    };
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'app-search-field';
  if (options.wrapperClass) {
    wrapper.classList.add(options.wrapperClass);
  }

  const icon = document.createElement('span');
  icon.className = 'app-search-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.5" cy="8.5" r="5.5"></circle><path d="M13 13l4.25 4.25"></path></svg>';

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'app-search-clear';
  clearButton.setAttribute('aria-label', options.clearLabel || 'Clear search');
  clearButton.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8"></path><path d="M12 4 4 12"></path></svg>';

  input.dataset.searchEnhanced = 'true';
  input.type = 'search';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.classList.add('app-search-input');

  const parent = input.parentNode;
  if (parent) {
    parent.insertBefore(wrapper, input);
  }
  wrapper.appendChild(icon);
  wrapper.appendChild(input);
  wrapper.appendChild(clearButton);

  function syncState() {
    const hasValue = Boolean(String(input.value || '').trim());
    wrapper.classList.toggle('has-value', hasValue);
    clearButton.disabled = !hasValue;
  }

  function clearSearch() {
    if (!input.value) return;
    input.value = '';
    syncState();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('search', { bubbles: true }));
    input.focus();
  }

  clearButton.addEventListener('click', clearSearch);
  input.addEventListener('input', syncState);
  input.addEventListener('change', syncState);
  input.addEventListener('search', syncState);
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape' && input.value) {
      event.preventDefault();
      clearSearch();
    }
  });

  syncState();

  return {
    wrapper,
    input,
    clearButton
  };
};

window.initializeSearchInputs = function(root = document) {
  const searchRoot = root && typeof root.querySelectorAll === 'function' ? root : document;
  const inputs = Array.from(searchRoot.querySelectorAll('input[data-search-ui="enhanced"]'));

  inputs.forEach(input => {
    window.enhanceSearchInput(input, {
      wrapperClass: input.dataset.searchWrapperClass || '',
      clearLabel: input.dataset.searchClearLabel || 'Clear search'
    });
  });

  return inputs;
};