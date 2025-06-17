/* ===================================
   MODAL MANAGEMENT SYSTEM
   ===================================
   
   This module contains all modal-related functionality extracted from query.js
   including panel toggles, focus management, accessibility features, and
   event handlers for the application's modal system.
*/

/* ===== Modal Panel Configuration ===== */
// Centralized modal panel IDs
const MODAL_PANEL_IDS = ['json-panel', 'queries-panel', 'help-panel', 'mobile-menu-dropdown'];

/* ===== Input Locking System ===== */
// Input locking state variables
let isInputLocked = false;
let inputLockTimeout = null;

// Full-screen overlay for pointer-events blocking
let inputBlockOverlay = document.getElementById('input-block-overlay');
if (!inputBlockOverlay) {
  inputBlockOverlay = document.createElement('div');
  inputBlockOverlay.id = 'input-block-overlay';
  inputBlockOverlay.style.position = 'fixed';
  inputBlockOverlay.style.top = '0';
  inputBlockOverlay.style.left = '0';
  inputBlockOverlay.style.width = '100vw';
  inputBlockOverlay.style.height = '100vh';
  inputBlockOverlay.style.zIndex = '99999';
  inputBlockOverlay.style.pointerEvents = 'none';
  inputBlockOverlay.style.background = 'rgba(0,0,0,0)';
  inputBlockOverlay.style.display = 'none';
  document.body.appendChild(inputBlockOverlay);
}

/**
 * Lock user input for a specified duration
 * Prevents interactions during animations or critical operations
 * @param {number} duration - Duration in milliseconds to lock input
 */
function lockInput(duration = 600) {
  isInputLocked = true;
  inputBlockOverlay.style.pointerEvents = 'all';
  inputBlockOverlay.style.display = 'block';
  if (inputLockTimeout) clearTimeout(inputLockTimeout);
  inputLockTimeout = setTimeout(() => {
    isInputLocked = false;
    inputBlockOverlay.style.pointerEvents = 'none';
    inputBlockOverlay.style.display = 'none';
  }, duration);
}

/* ===== Focus Management ===== */
/**
 * Get all focusable elements within a panel
 * @param {Element} panel - The panel element to search within
 * @returns {NodeList} List of focusable elements
 */
function getFocusableElements(panel) {
  return panel.querySelectorAll(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
  );
}

/**
 * Trap focus within a modal panel for accessibility
 * Ensures tab navigation stays within the modal
 * @param {Element} panel - The panel element to trap focus within
 */
function trapFocus(panel) {
  const focusable = getFocusableElements(panel);
  if (!focusable.length) return;
  let first = focusable[0];
  let last = focusable[focusable.length - 1];
  panel.addEventListener('keydown', function(e) {
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
  });
}

/* ===== Accessibility Helpers ===== */
/**
 * Set aria-hidden on main content except header and open modal
 * Improves screen reader accessibility when modals are open
 * @param {boolean} hidden - Whether to hide main content
 * @param {string} openPanelId - ID of the currently open panel (optional)
 */
function setMainContentAriaHidden(hidden, openPanelId = null) {
  const pageBody = document.getElementById('page-body');
  if (pageBody) pageBody.setAttribute('aria-hidden', hidden ? 'true' : 'false');
  
  // Unhide the open modal and header
  if (openPanelId) {
    const panel = document.getElementById(openPanelId);
    if (panel) panel.setAttribute('aria-hidden', 'false');
  }
  const header = document.getElementById('header-bar');
  if (header) header.setAttribute('aria-hidden', 'false');
}

/* ===== Modal Operations ===== */
/**
 * Open a specific modal panel
 * Handles focus management, accessibility, and overlay display
 * @param {string} panelId - The ID of the panel to open
 */
function openModal(panelId) {
  closeAllModals();
  const panel = document.getElementById(panelId);
  if (!panel) return;
  
  panel.classList.remove('hidden');
  panel.classList.add('show');
  
  const overlay = document.getElementById('overlay');
  if (overlay) overlay.classList.add('show');
  
  // Focus first focusable element
  const focusable = getFocusableElements(panel);
  if (focusable.length) {
    setTimeout(() => focusable[0].focus(), 0);
  }
  
  // Trap focus
  trapFocus(panel);
  
  // Accessibility: hide main content from screen readers
  setMainContentAriaHidden(true, panelId);
}

/**
 * Close a specific modal panel
 * @param {string} panelId - The ID of the panel to close
 */
function closeModal(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  
  panel.classList.add('hidden');
  panel.classList.remove('show');
  
  // If no other modal is open, hide overlay
  const anyOpen = MODAL_PANEL_IDS.some(id => {
    // Don't count the panel we just closed
    if (id === panelId) return false;
    const p = document.getElementById(id);
    // A panel is open if it's not hidden AND has the 'show' class
    return p && !p.classList.contains('hidden') && p.classList.contains('show');
  });
  
  if (!document.querySelector('.active-bubble') && !anyOpen) {
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.classList.remove('show');
  }
}

/**
 * Close all modal panels
 * Used when overlay is clicked or escape is pressed
 */
function closeAllModals() {
  MODAL_PANEL_IDS.forEach(id => {
    const p = document.getElementById(id);
    if (p) {
      p.classList.add('hidden');
      p.classList.remove('show');
    }
  });
  
  const overlay = document.getElementById('overlay');
  if (overlay) overlay.classList.remove('show');
  
  // Accessibility: unhide main content
  setMainContentAriaHidden(false);
}

/* ===== Mobile Utilities ===== */
/**
 * Get the mobile breakpoint from CSS variable
 * @returns {number} The mobile breakpoint in pixels
 */
function getMobileBreakpoint() {
  return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mobile-breakpoint').trim(), 10);
}

/**
 * Check if currently in mobile mode
 * @returns {boolean} Whether the viewport is in mobile mode
 */
function checkMobileMode() {
  const bp = getMobileBreakpoint();
  return window.innerWidth <= bp;
}

/* ===== Event Handlers Setup ===== */
/**
 * Initialize all modal-related event handlers
 * This function should be called after DOM content is loaded
 */
function initializeModalSystem() {
  // Desktop modal toggles
  const panelToggles = {
    'toggle-json': 'json-panel',
    'toggle-queries': 'queries-panel',
    'toggle-help': 'help-panel'
  };
  
  // Use shared event utility to reduce duplicate code
  const toggleHandlers = {};
  Object.entries(panelToggles).forEach(([btnId, panelId]) => {
    toggleHandlers[btnId] = () => openModal(panelId);
  });
  window.EventUtils.attachBulkClickListeners(toggleHandlers);
  
  // Collapse buttons (close buttons in panel headers)
  document.querySelectorAll('.collapse-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      if (targetId) closeModal(targetId);
    });
  });
  
  // Mobile hamburger menu functionality
  const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', () => openModal('mobile-menu-dropdown'));
  }
  
  // Mobile menu item click handlers
  const mobileRunQuery = document.getElementById('mobile-run-query');
  if (mobileRunQuery) {
    mobileRunQuery.addEventListener('click', () => {
      closeModal('mobile-menu-dropdown');
      const runBtn = document.getElementById('run-query-btn');
      if (runBtn) runBtn.click();
    });
  }
  
  const mobileDownload = document.getElementById('mobile-download');
  if (mobileDownload) {
    mobileDownload.addEventListener('click', () => {
      closeModal('mobile-menu-dropdown');
      const downloadBtn = document.getElementById('download-btn');
      if (downloadBtn) downloadBtn.click();
    });
  }
  
  // Mobile panel toggles
  const mobilePanelToggles = {
    'mobile-toggle-json': 'json-panel',
    'mobile-toggle-queries': 'queries-panel',
    'mobile-toggle-help': 'help-panel'
  };
  
  Object.entries(mobilePanelToggles).forEach(([btnId, panelId]) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', () => {
        closeModal('mobile-menu-dropdown');
        openModal(panelId);
      });
    }
  });
  
  // Accessibility: Add ARIA attributes to modal panels
  MODAL_PANEL_IDS.forEach(id => {
    const panel = document.getElementById(id);
    if (panel) {
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      
      // Prefer aria-labelledby if a heading exists, else fallback to aria-label
      const heading = panel.querySelector('h2, h1, .modal-title');
      if (heading && heading.id) {
        panel.setAttribute('aria-labelledby', heading.id);
      } else if (heading) {
        // Generate a unique id if needed
        const uniqueId = id + '-label';
        heading.id = uniqueId;
        panel.setAttribute('aria-labelledby', uniqueId);
      } else {
        // Fallback: use aria-label
        panel.setAttribute('aria-label', id.replace(/-panel$/, '').replace(/\b\w/g, c => c.toUpperCase()));
      }
    }
  });
}

/* ===== Module Exports ===== */
// Export functions and constants for use in other modules
window.ModalSystem = {
  // Constants
  MODAL_PANEL_IDS,
  
  // Core functions
  openModal,
  closeModal,
  closeAllModals,
  
  // Focus management
  getFocusableElements,
  trapFocus,
  
  // Input locking
  lockInput,
  
  // Accessibility
  setMainContentAriaHidden,
  
  // Mobile utilities
  getMobileBreakpoint,
  checkMobileMode,
  
  // Initialization
  initialize: initializeModalSystem,
  
  // State getters
  get isInputLocked() { return isInputLocked; }
};

/* ===== Auto-initialization ===== */
// Initialize the modal system when DOM is ready
window.onDOMReady(initializeModalSystem);

// Also run mobile mode check on load and resize  
window.onDOMReady(() => {
  const isMobile = checkMobileMode();
  // You can use isMobile for conditional UI logic if needed
});

window.addEventListener('resize', () => {
  const isMobile = checkMobileMode();
  // You can use isMobile for conditional UI logic if needed
});
