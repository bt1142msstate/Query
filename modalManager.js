/**
 * Centralized Modal and Panel Management
 * Handles logic for side panels (JSON, Queries, Help), Generic Modals,
 * and overlay/backdrop management.
 * @class ModalManager
 */
class ModalManager {
  constructor() {
    this.overlay = document.getElementById('overlay');
    this.panels = ['json-panel', 'queries-panel', 'help-panel', 'mobile-menu-dropdown'];
    this.activePanel = null;
    
    // Input locking overlay
    this.createInputBlockOverlay();
    
    this.setupListeners();
  }

  /**
   * Creates the overlay used to block input during animations
   */
  createInputBlockOverlay() {
    this.inputBlockOverlay = document.getElementById('input-block-overlay');
    if (!this.inputBlockOverlay) {
      this.inputBlockOverlay = document.createElement('div');
      this.inputBlockOverlay.id = 'input-block-overlay';
      this.inputBlockOverlay.style.position = 'fixed';
      this.inputBlockOverlay.style.top = '0';
      this.inputBlockOverlay.style.left = '0';
      this.inputBlockOverlay.style.width = '100vw';
      this.inputBlockOverlay.style.height = '100vh';
      this.inputBlockOverlay.style.zIndex = '99999';
      this.inputBlockOverlay.style.pointerEvents = 'none';
      this.inputBlockOverlay.style.background = 'rgba(0,0,0,0)';
      this.inputBlockOverlay.style.display = 'none';
      document.body.appendChild(this.inputBlockOverlay);
    }
    this.isInputLocked = false;
    this.inputLockTimeout = null;
  }

  setupListeners() {
    // Top-level overlay click closes active panel
    if (this.overlay) {
      this.overlay.addEventListener('click', () => this.closeAllPanels());
    }

    // Escape key closes panels
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllPanels();
      }
    });

    // Toggle button listeners
    // We assume buttons have data-target="panel-id" or are specific named buttons
    document.addEventListener('click', (e) => {
      // Handle collapse buttons (inside panels)
      if (e.target.closest('.collapse-btn')) {
        const btn = e.target.closest('.collapse-btn');
        const targetId = btn.getAttribute('data-target');
        if (targetId) this.closePanel(targetId);
      }
    });
  }

  /**
   * Toggles a side panel by ID
   * @param {string} panelId - The ID of the panel
   */
  togglePanel(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    // If opening a new panel, close others first
    if (this.activePanel && this.activePanel !== panelId) {
      // If we are switching panels, we might want to keep overlay? 
      // Current behavior in modals.js seems to be one at a time.
      this.closePanel(this.activePanel);
    }

    if (panel.classList.contains('hidden')) {
      this.openPanel(panelId);
    } else {
      this.closePanel(panelId);
    }
  }

  openPanel(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    panel.classList.remove('hidden');
    // Force reflow for animation if needed (though existing CSS seems to use hidden class)
    // Existing styles might rely on removing hidden to show.
    
    if (this.overlay) this.overlay.classList.add('show'); // Assuming 'show' class handles visibility
    this.activePanel = panelId;
    
    // Accessibility
    this.trapFocus(panel);
    this.setMainContentAriaHidden(true, panelId);
  }

  closePanel(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    panel.classList.add('hidden');
    
    if (this.activePanel === panelId) {
      this.activePanel = null;
    }

    // If no other panels are open, hide overlay
    if (!this.activePanel) {
      if (this.overlay) this.overlay.classList.remove('show');
      this.setMainContentAriaHidden(false);
    }
  }

  closeAllPanels() {
    if (this.activePanel) {
      this.closePanel(this.activePanel);
    }
    // Also iterate known panels just in case
    this.panels.forEach(pid => {
      const p = document.getElementById(pid);
      if (p && !p.classList.contains('hidden')) {
        p.classList.add('hidden');
      }
    });
    
    if (this.overlay) this.overlay.classList.remove('show');
    this.activePanel = null;
    this.setMainContentAriaHidden(false);
  }

  /**
   * Initialize all modal-related event handlers
   */
  initialize() {
    // Desktop: Bind click events to the toggle buttons
    const panelToggles = {
      'toggle-json': 'json-panel',
      'toggle-queries': 'queries-panel',
      'toggle-help': 'help-panel'
    };
    
    Object.entries(panelToggles).forEach(([btnId, panelId]) => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener('click', () => this.togglePanel(panelId));
      }
    });

    // Mobile: Hamburger Menu
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', () => this.togglePanel('mobile-menu-dropdown'));
    }

    // Mobile: Menu Items
    const mobileRunQuery = document.getElementById('mobile-run-query');
    if (mobileRunQuery) {
        mobileRunQuery.addEventListener('click', () => {
            this.closePanel('mobile-menu-dropdown');
            const runBtn = document.getElementById('run-query-btn');
            if(runBtn) runBtn.click();
        });
    }

    const mobileDownload = document.getElementById('mobile-download');
    if (mobileDownload) {
        mobileDownload.addEventListener('click', () => {
            this.closePanel('mobile-menu-dropdown');
            const downloadBtn = document.getElementById('download-btn');
            if(downloadBtn) downloadBtn.click();
        });
    }

    // Mobile: Panel Toggles
    const mobilePanelToggles = {
        'mobile-toggle-json': 'json-panel',
        'mobile-toggle-queries': 'queries-panel',
        'mobile-toggle-help': 'help-panel'
    };

    Object.entries(mobilePanelToggles).forEach(([btnId, panelId]) => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', () => {
                this.closePanel('mobile-menu-dropdown');
                this.openPanel(panelId);
            });
        }
    });
  }

  /**
   * Lock user input for a specified duration
   * @param {number} duration - Milliseconds
   */
  lockInput(duration = 600) {
    this.isInputLocked = true;
    this.inputBlockOverlay.style.pointerEvents = 'all';
    this.inputBlockOverlay.style.display = 'block';
    
    if (this.inputLockTimeout) clearTimeout(this.inputLockTimeout);
    
    this.inputLockTimeout = setTimeout(() => {
      this.isInputLocked = false;
      this.inputBlockOverlay.style.pointerEvents = 'none';
      this.inputBlockOverlay.style.display = 'none';
    }, duration);
  }

  /**
   * Trap focus within a modal panel
   */
  trapFocus(panel) {
    const focusable = panel.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    
    const currHandler = (e) => {
        // If panel is closed/hidden, remove listener (this is a simplified logic)
        // Ideally we store the reference to remove it later.
        if(panel.classList.contains('hidden')) {
             panel.removeEventListener('keydown', currHandler);
             return;
        }

        if (e.key === 'Tab') {
            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }
    };

    // Remove old listener if any? Hard to track without weakmap or instance var per panel.
    // For now, we'll just add it. Note: this might add duplicate listeners if opened/closed multiple times
    // A better approach is to have a single keydown listener on document that checks activePanel.
    panel.addEventListener('keydown', currHandler);
  }

  setMainContentAriaHidden(hidden, openPanelId = null) {
    const pageBody = document.getElementById('page-body');
    if (!pageBody) return;
    
    // We want to hide everything except the modal
    // This depends on DOM structure. 
    // Assuming modals are direct children of body or outside page-body?
    // Based on index.html, panels are children of body (direct or indirect).
    
    if (hidden) {
      pageBody.setAttribute('aria-hidden', 'true');
    } else {
      pageBody.removeAttribute('aria-hidden');
    }
  }
}

// Global instance
window.modalManager = new ModalManager();

// Expose legacy global functions to maintain compatibility with existing on-click attributes if any
window.lockInput = (duration) => window.modalManager.lockInput(duration);
window.closeAllModals = () => window.modalManager.closeAllPanels();

// Helper to open specific panels (used by toolbar buttons)
window.toggleJsonPanel = () => window.modalManager.togglePanel('json-panel');
window.toggleQueriesPanel = () => window.modalManager.togglePanel('queries-panel');
window.toggleHelpPanel = () => window.modalManager.togglePanel('help-panel');
window.toggleMobileMenu = () => window.modalManager.togglePanel('mobile-menu-dropdown');

// Backward Compatibility for ModalSystem
window.ModalSystem = {
  closeAllModals: () => window.modalManager.closeAllPanels(),
  lockInput: (d) => window.modalManager.lockInput(d),
  openModal: (id) => window.modalManager.openPanel(id),
  closeModal: (id) => window.modalManager.closePanel(id)
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.modalManager.initialize());
} else {
  window.modalManager.initialize();
}
