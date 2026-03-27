/**
 * Centralized Modal and Panel Management
 * Handles logic for side panels (JSON, Queries, Help), Generic Modals,
 * and overlay/backdrop management.
 * @class ModalManager
 */
class ModalManager {
  constructor() {
    this.initialized = false;
    this.overlay = window.DOM?.overlay || document.getElementById('overlay');
    this.panels = ['json-panel', 'queries-panel', 'help-panel', 'mobile-menu-dropdown'];
    this.panelTitles = {
      'json-panel': 'Query JSON',
      'queries-panel': 'Queries',
      'help-panel': 'Help'
    };
    this.activePanel = null;
    this.mobileMenuLabelMap = {
      'run-query-btn': 'Run Query',
      'split-columns-toggle': 'Multi-value Export',
      'toggle-json': 'JSON',
      'toggle-queries': 'Queries',
      'toggle-help': 'Help'
    };
    
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
    if (panelId === 'mobile-menu-dropdown') {
      this.rebuildMobileMenu();
      panel.classList.add('show');
    }
    // Force reflow for animation if needed (though existing CSS seems to use hidden class)
    // Existing styles might rely on removing hidden to show.
    
    if (this.overlay) this.overlay.classList.add('show'); // Assuming 'show' class handles visibility
    this.activePanel = panelId;
    this.syncHeaderOverlayTitle(panelId);

    if (panelId === 'queries-panel') {
      window.AppServices?.fetchHistoryQueryStatus?.();
      window.AppServices?.startHistoryDurationUpdates?.();
    }
    
    // Accessibility
    this.trapFocus(panel);
    this.setMainContentAriaHidden(true, panelId);
  }

  closePanel(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    if (panelId === 'queries-panel') {
      window.AppServices?.stopHistoryDurationUpdates?.();
      window.QueryHistorySystem?.closeDetailsOverlay?.();
    }

    if (panelId === 'mobile-menu-dropdown') {
      panel.classList.remove('show');
    }
    panel.classList.add('hidden');
    
    if (this.activePanel === panelId) {
      this.activePanel = null;
    }

    this.syncHeaderOverlayTitle(this.activePanel);

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
        if (pid === 'queries-panel') {
          window.AppServices?.stopHistoryDurationUpdates?.();
          window.QueryHistorySystem?.closeDetailsOverlay?.();
        }
        if (pid === 'mobile-menu-dropdown') {
          p.classList.remove('show');
        }
        p.classList.add('hidden');
      }
    });
    
    if (this.overlay) this.overlay.classList.remove('show');
    this.activePanel = null;
    this.syncHeaderOverlayTitle(null);
    this.setMainContentAriaHidden(false);
  }

  syncHeaderOverlayTitle(panelId) {
    const titleEl = window.DOM?.headerOverlayTitle || document.getElementById('header-overlay-title');
    if (!titleEl) {
      return;
    }

    const nextTitle = panelId ? this.panelTitles[panelId] : '';
    if (nextTitle) {
      titleEl.textContent = nextTitle;
      titleEl.classList.remove('hidden');
      titleEl.setAttribute('data-panel-id', panelId);
    } else {
      titleEl.textContent = '';
      titleEl.classList.add('hidden');
      titleEl.removeAttribute('data-panel-id');
    }
  }

  /**
   * Initialize all modal-related event handlers
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

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
    const mobileMenuToggle = window.DOM?.mobileMenuToggle || document.getElementById('mobile-menu-toggle');
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', () => this.togglePanel('mobile-menu-dropdown'));
    }

    const mobileMenuItems = document.getElementById('mobile-menu-items');
    if (mobileMenuItems && !mobileMenuItems.dataset.bound) {
      mobileMenuItems.addEventListener('click', event => {
        const item = event.target.closest('[data-source-control-id]');
        if (!item) {
          return;
        }

        const sourceId = item.getAttribute('data-source-control-id');
        const sourceButton = sourceId ? document.getElementById(sourceId) : null;
        if (!sourceButton || sourceButton.disabled) {
          return;
        }

        this.closePanel('mobile-menu-dropdown');
        sourceButton.click();
      });
      mobileMenuItems.dataset.bound = 'true';
    }
  }

  isDesktopControlVisible(button) {
    if (!button || button.classList.contains('hidden') || button.hidden) {
      return false;
    }

    const styles = window.getComputedStyle(button);
    return styles.display !== 'none' && styles.visibility !== 'hidden';
  }

  getMobileMenuLabel(button) {
    if (!button) {
      return '';
    }

    return String(
      button.dataset.mobileMenuLabel
      || this.mobileMenuLabelMap[button.id]
      || button.getAttribute('aria-label')
      || button.getAttribute('data-tooltip')
      || button.id
    ).trim();
  }

  createMobileMenuItem(button, isLastItem) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `mobile-menu-item hover:bg-gray-100${isLastItem ? '' : ' border-b border-gray-200'}`;
    item.setAttribute('data-source-control-id', button.id);
    item.setAttribute('data-tooltip', button.getAttribute('data-tooltip') || '');
    item.setAttribute('aria-label', this.getMobileMenuLabel(button));
    item.disabled = Boolean(button.disabled);

    const iconShell = document.createElement('span');
    iconShell.className = 'mobile-menu-icon';
    iconShell.innerHTML = button.innerHTML;
    iconShell.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    item.appendChild(iconShell);

    const label = document.createElement('span');
    label.textContent = this.getMobileMenuLabel(button);
    item.appendChild(label);

    return item;
  }

  rebuildMobileMenu() {
    const mobileMenuItems = document.getElementById('mobile-menu-items');
    const headerControls = document.getElementById('header-controls');
    if (!mobileMenuItems || !headerControls) {
      return;
    }

    const sourceButtons = Array.from(headerControls.querySelectorAll('button[id]'))
      .filter(button => this.isDesktopControlVisible(button));

    mobileMenuItems.replaceChildren();

    sourceButtons.forEach((button, index) => {
      mobileMenuItems.appendChild(this.createMobileMenuItem(button, index === sourceButtons.length - 1));
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
    const pageBody = window.DOM?.pageBody || document.getElementById('page-body');
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

window.lockInput = (duration) => window.modalManager.lockInput(duration);

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
