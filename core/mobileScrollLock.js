const MOBILE_VIEWPORT_QUERY = '(max-width: 1024px)';
const LOCKED_CLASS = 'mobile-overlay-scroll-locked';
const LOCK_TRIGGER_CLASSES = [
  'raised-ui-open',
  'modal-panel-open',
  'mobile-filter-panel-open',
  'post-filter-overlay-open',
  'export-overlay-open',
  'table-expanded-open',
  'history-details-open'
];

const originalStyles = {
  bodyLeft: '',
  bodyOverflow: '',
  bodyPosition: '',
  bodyRight: '',
  bodyTop: '',
  bodyWidth: '',
  htmlOverflow: '',
  htmlOverscrollBehavior: ''
};

let initialized = false;
let isLocked = false;
let lockedScrollY = 0;
let viewportMediaQuery = null;

function isMobileViewport() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  viewportMediaQuery = viewportMediaQuery || window.matchMedia(MOBILE_VIEWPORT_QUERY);
  return viewportMediaQuery.matches;
}

function hasLockTrigger() {
  return LOCK_TRIGGER_CLASSES.some(className => document.body.classList.contains(className));
}

function saveOriginalStyles() {
  originalStyles.bodyLeft = document.body.style.left;
  originalStyles.bodyOverflow = document.body.style.overflow;
  originalStyles.bodyPosition = document.body.style.position;
  originalStyles.bodyRight = document.body.style.right;
  originalStyles.bodyTop = document.body.style.top;
  originalStyles.bodyWidth = document.body.style.width;
  originalStyles.htmlOverflow = document.documentElement.style.overflow;
  originalStyles.htmlOverscrollBehavior = document.documentElement.style.overscrollBehavior;
}

function lockPageScroll() {
  if (isLocked) {
    return;
  }

  lockedScrollY = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
  saveOriginalStyles();
  document.documentElement.classList.add(LOCKED_CLASS);
  document.documentElement.style.overflow = 'hidden';
  document.documentElement.style.overscrollBehavior = 'none';

  document.body.dataset.mobileScrollLockY = String(lockedScrollY);
  document.body.classList.add(LOCKED_CLASS);
  document.body.style.position = 'fixed';
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
  document.body.style.overflow = 'hidden';
  isLocked = true;
}

function unlockPageScroll() {
  if (!isLocked) {
    return;
  }

  const restoreScrollY = Number.parseInt(document.body.dataset.mobileScrollLockY || String(lockedScrollY), 10);
  document.documentElement.classList.remove(LOCKED_CLASS);
  document.documentElement.style.overflow = originalStyles.htmlOverflow;
  document.documentElement.style.overscrollBehavior = originalStyles.htmlOverscrollBehavior;

  document.body.classList.remove(LOCKED_CLASS);
  document.body.style.position = originalStyles.bodyPosition;
  document.body.style.top = originalStyles.bodyTop;
  document.body.style.left = originalStyles.bodyLeft;
  document.body.style.right = originalStyles.bodyRight;
  document.body.style.width = originalStyles.bodyWidth;
  document.body.style.overflow = originalStyles.bodyOverflow;
  delete document.body.dataset.mobileScrollLockY;

  isLocked = false;
  lockedScrollY = 0;
  window.scrollTo(0, Number.isFinite(restoreScrollY) ? restoreScrollY : 0);
}

function syncMobileScrollLock() {
  if (!document.body || !isMobileViewport() || !hasLockTrigger()) {
    unlockPageScroll();
    return;
  }

  lockPageScroll();
}

function initializeMobileScrollLock() {
  if (initialized || !document.body) {
    return;
  }

  initialized = true;
  const observer = new MutationObserver(syncMobileScrollLock);
  observer.observe(document.body, {
    attributeFilter: ['class'],
    attributes: true
  });

  viewportMediaQuery = window.matchMedia?.(MOBILE_VIEWPORT_QUERY) || null;
  viewportMediaQuery?.addEventListener?.('change', syncMobileScrollLock);
  window.addEventListener('orientationchange', syncMobileScrollLock);
  window.addEventListener('resize', syncMobileScrollLock);
  syncMobileScrollLock();
}

initializeMobileScrollLock();

export { initializeMobileScrollLock, syncMobileScrollLock };
