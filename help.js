/**
 * Help overlay functionality
 * Manages the help panel content and provides programmatic access to help system.
 * @module Help
 */
(function initializeHelp() {
  
  // Help panel content structure
  const helpContent = {
    title: 'Help',
    sections: [
      {
        title: 'Getting Started',
        content: 'Use this tool to build library item queries and reports.'
      },
      {
        title: 'Working with Bubbles',
        items: [
          'Click a bubble to view filter options',
          'Drag bubbles to the table area to add columns',
          'White bubbles indicate fields that are already filtered or displayed'
        ]
      },
      {
        title: 'Building Queries',
        items: [
          'Apply filters by clicking bubbles and selecting conditions',
          'Rearrange columns by dragging table headers',
          'Remove columns by hovering over a header and clicking the trash icon',
          'View and edit your query JSON by clicking the JSON button'
        ]
      },
      {
        title: 'Running Queries',
        items: [
          'Click the green play button to run your query',
          'Click it again (stop icon) to cancel a running query',
          'Download results using the download button',
          'View your query history in the Queries panel'
        ]
      }
    ]
  };

  /**
   * Generates the complete HTML for the help panel based on content structure.
   * @function generateHelpHTML
   * @returns {string} Complete HTML string for the help panel
   */
  function generateHelpHTML() {
    const sectionsHTML = helpContent.sections.map(section => {
      if (section.items) {
        // Section with list items
        const itemsHTML = section.items.map(item => `<li>${item}</li>`).join('');
        return `
          <h4 class="text-md font-semibold mt-4 mb-2">${section.title}</h4>
          <ul class="list-disc pl-5 mb-3">
            ${itemsHTML}
          </ul>
        `;
      } else {
        // Section with simple content
        return `
          <h3 class="text-lg font-semibold mb-3">${section.title}</h3>
          <p class="mb-3">${section.content}</p>
        `;
      }
    }).join('');

    return `
      <!-- HELP PANEL -->
      <div id="help-panel" class="w-full modal-panel hidden">
        <h2 class="mt-8 mb-0 px-3 py-2 bg-purple-100 text-purple-800 font-semibold text-sm uppercase tracking-wider border border-purple-200 flex items-center justify-between">
          <span>${helpContent.title}</span>
          <button class="collapse-btn p-1.5 rounded hover:bg-purple-200 focus:outline-none transition-colors ml-2" data-target="help-panel" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="#7e22ce" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
              <line x1="4" y1="4" x2="16" y2="16" />
              <line x1="16" y1="4" x2="4" y2="16" />
            </svg>
          </button>
        </h2>
        <div id="help-container" class="w-full -mt-px border border-purple-200 border-t-0 rounded-b overflow-y-auto bg-white p-4">
          ${sectionsHTML}
        </div>
      </div><!-- end help-panel -->
    `;
  }

  /**
   * Injects the help panel into the DOM at the appropriate location.
   * Removes existing panel if present and creates a new one.
   * @function injectHelpPanel
   */
  function injectHelpPanel() {
    // Find the existing help panel if it exists
    const existingPanel = document.getElementById('help-panel');
    if (existingPanel) {
      // Remove existing help panel
      existingPanel.remove();
    }

    // Find a suitable place to inject the help panel (after queries panel)
    const queriesPanel = document.getElementById('queries-panel');
    if (queriesPanel) {
      // Insert the help panel after the queries panel
      queriesPanel.insertAdjacentHTML('afterend', generateHelpHTML());
    } else {
      // Fallback: append to overlay div or body
      const overlay = document.getElementById('overlay');
      if (overlay && overlay.parentNode) {
        overlay.parentNode.insertAdjacentHTML('beforeend', generateHelpHTML());
      }
    }
  }

  /**
   * Sets up event handlers for the help panel.
   * Note: Most modal functionality is handled by the main modal system.
   * @function setupHelpEventHandlers
   */
  function setupHelpEventHandlers() {
    // The main modal system in query.js already handles:
    // - toggle-help button click
    // - mobile-toggle-help button click  
    // - collapse-btn click events
    // - modal open/close functionality
    // - focus management and accessibility
    
    // We just need to make sure the help panel is in the MODAL_PANEL_IDS array
    // This is already handled in query.js where MODAL_PANEL_IDS includes 'help-panel'
    
    console.log('Help panel initialized and ready');
  }

  /**
   * Updates help content programmatically and re-renders the panel.
   * @function updateHelpContent
   * @param {Object} newContent - New content object to merge with existing content
   */
  function updateHelpContent(newContent) {
    Object.assign(helpContent, newContent);
    injectHelpPanel();
    setupHelpEventHandlers();
  }

  /**
   * Initializes the help panel when DOM is ready.
   * Uses shared DOM ready utility to eliminate duplicate patterns.
   * @function initializeHelpPanel
   */
  function initializeHelpPanel() {
    window.onDOMReady(() => {
      injectHelpPanel();
      setupHelpEventHandlers();
    });
  }

  // Public API (attach to window if needed for external access)
  window.Help = {
    updateContent: updateHelpContent,
    reinitialize: initializeHelpPanel
  };

  // Auto-initialize
  initializeHelpPanel();

})();
