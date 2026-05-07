import { appServices } from '../core/appServices.js';
import { AppState } from '../core/queryState.js';
import { appRuntime } from '../core/appRuntime.js';

var services = appServices;

function reconcileBubbleResetInteractionState(skipFields = new Set()) {
  const bubbles = Array.from(document.querySelectorAll('.bubble'));
  bubbles.forEach(bubble => {
    const fieldName = bubble.textContent ? bubble.textContent.trim() : '';
    if (skipFields.has(fieldName)) return;
    bubble.classList.remove('bubble-disabled');
    bubble.style.visibility = '';
    bubble.style.opacity = '';
    bubble.removeAttribute('data-filter-for');
    services.applyBubbleStyling(bubble);
  });
}

var appState = AppState;

function finalizeBubbleReset(reason, payload = {}) {
  const bubbleService = services.bubble;
  if (!bubbleService) {
    return;
  }

  if (bubbleService.animatingBackBubbles.size === 0) {
    bubbleService.isBubbleAnimatingBack = false;
    if (bubbleService.pendingRenderBubbles) {
      services.renderBubbles();
      bubbleService.pendingRenderBubbles = false;
    }
    reconcileBubbleResetInteractionState();
    services.bubbleDebugLog('reset.complete', { reason, ...payload });
  }
}

function resetActiveBubblesImpl() {
  const bubbleService = services.bubble;
  if (!bubbleService) {
    return;
  }

  bubbleService.isBubbleAnimating = false;

  services.lockModalInput(0);

  const clones = document.querySelectorAll('.active-bubble, .bubble-clone');
  services.bubbleDebugLog('reset.start', { cloneCount: clones.length });

  if (clones.length > 0) {
    bubbleService.isBubbleAnimatingBack = true;
  }

  clones.forEach(clone => {
    const origin = clone._origin;
    const originInDOM = origin && document.body.contains(origin);
    const fieldName = origin ? origin.textContent.trim() : (clone.textContent ? clone.textContent.trim() : '');

    if (originInDOM) {
      bubbleService.animatingBackBubbles.add(fieldName);

      const originalRect = clone._originalRect;
      clone.style.opacity = '1';
      clone.style.transition = 'all 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)';
      clone.style.backdropFilter = 'none';
      clone.style.webkitBackdropFilter = 'none';

      if (originalRect) {
        clone.style.top = originalRect.top + 'px';
        clone.style.left = originalRect.left + 'px';
        if (originalRect.width) clone.style.width = originalRect.width + 'px';
        if (originalRect.height) clone.style.height = originalRect.height + 'px';
      } else {
        const nowRect = origin.getBoundingClientRect();
        clone.style.top = nowRect.top + 'px';
        clone.style.left = nowRect.left + 'px';
      }

      clone.style.transform = 'translate(0, 0)';
      clone.style.fontSize = '';
      clone.style.padding = '';

      origin.style.opacity = '0';
      origin.style.visibility = 'hidden';

      clone.classList.remove('enlarge-bubble');
      clone.classList.remove('active-bubble');
      clone.classList.remove('bubble-clone');

      clone.addEventListener('transitionend', () => {
        services.bubbleDebugLog('reset.clone.transitionend', { fieldName });
        clone.remove();
        bubbleService.animatingBackBubbles.delete(fieldName);

        requestAnimationFrame(() => {
          const bubbles = Array.from(document.querySelectorAll('.bubble'));
          bubbles.forEach(bubble => {
            if (bubble.textContent.trim() !== fieldName) return;
            const stillExists = appRuntime.fieldDefs.has(fieldName) && appRuntime.shouldFieldHavePurpleStyling(fieldName);
            if (!stillExists && appState.currentCategory === 'Selected') {
              bubble.remove();
            } else {
              bubble.style.visibility = '';
              bubble.style.opacity = '1';
              bubble.classList.remove('bubble-disabled');
              bubble.removeAttribute('data-filter-for');
              services.applyBubbleStyling(bubble);
            }
          });
        });

        finalizeBubbleReset('all-transitionend');
      }, { once: true });
    } else {
      clone.remove();
      services.bubbleDebugLog('reset.clone.removedWithoutOrigin', { fieldName });
      if (origin) {
        bubbleService.animatingBackBubbles.delete(fieldName);
        const matchingBubble = Array.from(document.querySelectorAll('.bubble'))
          .find(bubble => bubble.textContent.trim() === fieldName);
        if (matchingBubble) {
          const stillExists = appRuntime.fieldDefs.has(fieldName) && appRuntime.shouldFieldHavePurpleStyling(fieldName);
          if (!stillExists && appState.currentCategory === 'Selected') {
            matchingBubble.remove();
          } else {
            matchingBubble.style.opacity = '';
            matchingBubble.style.visibility = '';
            matchingBubble.classList.remove('bubble-disabled');
            matchingBubble.removeAttribute('data-filter-for');
            services.applyBubbleStyling(matchingBubble);
          }
        }
      }

      finalizeBubbleReset('no-origin-clone');
    }
  });

  setTimeout(() => {
    if (clones.length === 0) {
      bubbleService.isBubbleAnimatingBack = false;
      services.rerenderBubbles();
      reconcileBubbleResetInteractionState();
      services.bubbleDebugLog('reset.complete', { reason: 'no-clones' });
    }
  }, 0);

  setTimeout(() => {
    if (!bubbleService.isBubbleAnimatingBack) return;
    bubbleService.isBubbleAnimatingBack = false;
    bubbleService.pendingRenderBubbles = false;
    const staleCloneCount = document.querySelectorAll('.bubble-clone').length;
    document.querySelectorAll('.bubble-clone').forEach(clone => clone.remove());
    reconcileBubbleResetInteractionState();
    services.rerenderBubbles();
    services.bubbleDebugLog('reset.complete', { reason: 'fallback-timeout', removedStaleClones: staleCloneCount });
  }, 650);
}

appRuntime.BubbleReset = {
  reconcileBubbleInteractionState: reconcileBubbleResetInteractionState,
  resetActiveBubbles: resetActiveBubblesImpl
};
