import { QueryStateReaders } from '../core/queryState.js';
import { registerAppUiActionDependencies } from '../core/appUiActions.js';
import {
  formatBackendProgressDetail,
  formatBackendProgressSummary,
  normalizeBackendProgress
} from '../core/queryProgress.js';
import { createTableQueryCircuitOverlay } from './spacefieldOverlay.js';

function formatQueryBubbleElapsed(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function clearTableQueryBubbleTimers(bubble) {
  if (!bubble) return;
  if (bubble._elapsedTimer) {
    clearInterval(bubble._elapsedTimer);
    bubble._elapsedTimer = null;
  }
}

function createQueryBubblePopParticles(bubble) {
  if (!bubble) return;

  const rect = bubble.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const particleCount = 25;

  for (let index = 0; index < particleCount; index += 1) {
    const particle = document.createElement('div');
    particle.className = 'bubble-particle';
    particle.style.zIndex = getComputedStyle(bubble).zIndex;

    const angle = Math.random() * Math.PI * 2;
    const radiusX = (rect.width / 2) * (0.8 + Math.random() * 0.3);
    const radiusY = (rect.height / 2) * (0.8 + Math.random() * 0.3);
    const startX = centerX + Math.cos(angle) * radiusX;
    const startY = centerY + Math.sin(angle) * radiusY;
    const size = Math.random() * 10 + 4;
    const burstSpeed = 20 + Math.random() * 50;
    const travelX = Math.cos(angle) * burstSpeed;
    const gravity = 60 + Math.random() * 60;
    const travelY = Math.sin(angle) * burstSpeed + gravity;
    const duration = 0.35 + Math.random() * 0.25;

    particle.style.left = `${startX}px`;
    particle.style.top = `${startY}px`;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.setProperty('--tx', `${travelX}px`);
    particle.style.setProperty('--ty', `${travelY}px`);
    particle.style.animation = `bubble-pop-anim ${duration}s ease-in forwards`;

    document.body.appendChild(particle);
    setTimeout(() => {
      particle.remove();
    }, duration * 1000);
  }
}

function updateTableQueryBubbleMetrics(bubble, metrics = {}) {
  if (!bubble) return;

  if (typeof metrics.startTime === 'number' && Number.isFinite(metrics.startTime)) {
    bubble._queryStartTime = metrics.startTime;
  }
  if (typeof metrics.resultCount === 'number' && Number.isFinite(metrics.resultCount)) {
    bubble._resultCount = metrics.resultCount;
  }
  if (metrics.progress !== undefined) {
    bubble._queryProgress = normalizeBackendProgress(metrics.progress);
  }

  const metricsRoot = bubble._hud || bubble;
  const elapsedValue = metricsRoot.querySelector('[data-query-elapsed-value]');
  const resultsValue = metricsRoot.querySelector('[data-query-results-value]');
  const progressRoot = metricsRoot.querySelector('[data-query-progress]');
  const progressSummary = metricsRoot.querySelector('[data-query-progress-summary]');
  const progressDetail = metricsRoot.querySelector('[data-query-progress-detail]');
  if (elapsedValue) {
    const startTime = Number.isFinite(bubble._queryStartTime) ? bubble._queryStartTime : Date.now();
    elapsedValue.textContent = formatQueryBubbleElapsed((Date.now() - startTime) / 1000);
  }
  if (resultsValue) {
    resultsValue.textContent = Number(bubble._resultCount || 0).toLocaleString();
  }
  if (progressRoot) {
    const progress = bubble._queryProgress;
    progressRoot.hidden = !progress;
    if (progressSummary) {
      progressSummary.textContent = progress ? formatBackendProgressSummary(progress) : '';
    }
    if (progressDetail) {
      progressDetail.textContent = progress ? formatBackendProgressDetail(progress) : '';
    }
  }
}

function startTableQueryAnimation() {
  const tableContainer = document.getElementById('table-container');
  if (!tableContainer) return;

  const oldBubble = document.getElementById('table-query-bubble');
  if (oldBubble) oldBubble.remove();

  const bubble = document.createElement('div');
  bubble.id = 'table-query-bubble';
  bubble.className = 'table-query-bubble';

  const rippleLayer = document.createElement('div');
  rippleLayer.className = 'table-query-bubble-ripples';
  for (let index = 0; index < 3; index += 1) {
    const ripple = document.createElement('span');
    ripple.className = 'table-query-bubble-ripple';
    ripple.style.setProperty('--ripple-delay', `${index * 1.05}s`);
    rippleLayer.appendChild(ripple);
  }

  const textNode = document.createElement('span');
  textNode.className = 'table-query-bubble-text';
  textNode.textContent = 'Querying...';

  const metricsNode = document.createElement('div');
  metricsNode.className = 'table-query-bubble-metrics';
  metricsNode.innerHTML = `
    <div class="table-query-bubble-metric">
      <span class="table-query-bubble-metric-label">Elapsed</span>
      <span class="table-query-bubble-metric-value" data-query-elapsed-value>0:00</span>
    </div>
    <div class="table-query-bubble-metric">
      <span class="table-query-bubble-metric-label">Results</span>
      <span class="table-query-bubble-metric-value" data-query-results-value>0</span>
    </div>
    <div class="table-query-bubble-progress" data-query-progress hidden>
      <span class="table-query-bubble-progress-summary" data-query-progress-summary></span>
      <span class="table-query-bubble-progress-detail" data-query-progress-detail></span>
    </div>
  `;

  const contentNode = document.createElement('div');
  contentNode.className = 'table-query-bubble-content';
  contentNode.appendChild(textNode);

  const hudNode = document.createElement('div');
  hudNode.className = 'table-query-bubble-hud';
  hudNode.appendChild(metricsNode);

  // Stop button — revealed on hover while the query is running
  const stopOverlay = document.createElement('div');
  stopOverlay.className = 'table-query-bubble-stop';
  stopOverlay.setAttribute('role', 'button');
  stopOverlay.setAttribute('aria-label', 'Stop query');
  stopOverlay.setAttribute('tabindex', '0');
  stopOverlay.innerHTML = `
    <span class="table-query-bubble-stop-icon" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
        <rect x="5" y="5" width="14" height="14" rx="2.5"/>
      </svg>
    </span>
    <span class="table-query-bubble-stop-label">Stop Query</span>
  `;

  const triggerStop = () => {
    // Delegate to the header run button click (which handles the cancel path)
    const runBtn = document.getElementById('run-query-btn');
    if (runBtn && QueryStateReaders.getLifecycleState().queryRunning) runBtn.click();
  };

  stopOverlay.addEventListener('click', e => { e.stopPropagation(); triggerStop(); });
  stopOverlay.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); triggerStop(); }
  });

  const circuit = createTableQueryCircuitOverlay();

  bubble.appendChild(rippleLayer);
  bubble.appendChild(circuit);
  bubble.appendChild(contentNode);
  bubble.appendChild(stopOverlay);
  bubble._queryStartTime = Date.now();
  bubble._resultCount = 0;
  bubble._hud = hudNode;

  const rect = tableContainer.getBoundingClientRect();
  bubble.style.width = rect.width + 'px';
  bubble.style.height = rect.height + 'px';
  bubble.style.top = (rect.top + rect.height / 2) + 'px';
  bubble.style.left = (rect.left + rect.width / 2) + 'px';
  bubble.style.borderRadius = '1.5rem';

  document.body.appendChild(bubble);
  document.body.appendChild(hudNode);
  tableContainer.classList.add('table-container-hidden');

  const filterPanel = document.getElementById('filter-side-panel');
  if (filterPanel) {
    filterPanel.classList.add('fade-out');
  }

  void bubble.offsetWidth; /* force layout before starting render and transitions */

  if (circuit._startAnimation) circuit._startAnimation();
  updateTableQueryBubbleMetrics(bubble, {
    startTime: bubble._queryStartTime,
    resultCount: 0
  });
  bubble._elapsedTimer = setInterval(() => {
    if (!document.body.contains(bubble)) {
      clearTableQueryBubbleTimers(bubble);
      return;
    }
    updateTableQueryBubbleMetrics(bubble);
  }, 1000);

  document.body.classList.add('scene-fade-transition', 'scene-fade-out');

  bubble.style.width = '350px';
  bubble.style.height = '350px';
  bubble.style.top = '50%';
  bubble.style.left = '50%';
  bubble.style.borderRadius = '50%';

  // Enable pointer events once the bubble has finished morphing to circle size
  // (350 px). We wait for the CSS transition to complete before making the
  // bubble interactive so stray clicks during the entrance animation are ignored.
  const enableInteraction = () => {
    if (document.getElementById('table-query-bubble') === bubble) {
      bubble.classList.add('is-interactive');
    }
  };
  const MORPH_IN_MS = 700; // generous cover for the 0.6s CSS width/height transition
  setTimeout(enableInteraction, MORPH_IN_MS);

  setTimeout(() => {
    if (document.getElementById('table-query-circuit')) {
      document.getElementById('table-query-circuit').classList.add('active');
    }
  }, 120);
}

function updateTableQueryAnimationProgress(metrics = {}) {
  const bubble = document.getElementById('table-query-bubble');
  if (!bubble) return;
  updateTableQueryBubbleMetrics(bubble, metrics);
}

function endTableQueryAnimation() {
  const tableContainer = document.getElementById('table-container');
  const bubble = document.getElementById('table-query-bubble');
  const circuit = document.getElementById('table-query-circuit');

  if (!bubble || !tableContainer) {
    if (tableContainer) tableContainer.classList.remove('table-container-hidden');
    document.body.classList.remove('scene-fade-out', 'scene-fade-transition');
    return;
  }

  clearTableQueryBubbleTimers(bubble);
  bubble.classList.remove('is-interactive');
  bubble.classList.add('is-completing');
  bubble.style.pointerEvents = 'none';
  if (bubble._hud) bubble._hud.classList.add('is-completing');

  const stopOverlay = bubble.querySelector('.table-query-bubble-stop');
  if (stopOverlay) {
    stopOverlay.setAttribute('aria-hidden', 'true');
    stopOverlay.setAttribute('tabindex', '-1');
  }

  const circuitFadeDuration = 220;
  const circuitFadeLead = 240;

  if (circuit && circuit.classList.contains('active')) {
    circuit.classList.add('fading-out');
    circuit.classList.remove('active');
    if (circuit._stopAnimation) circuit._stopAnimation();
    setTimeout(() => {
      startExpansionMorph();
    }, circuitFadeDuration + circuitFadeLead);
  } else {
    if (circuit) circuit.remove();
    startExpansionMorph();
  }

  function startExpansionMorph() {
    document.body.classList.remove('scene-fade-out');
    setTimeout(() => {
      document.body.classList.remove('scene-fade-transition');
    }, 600);

    const rect = tableContainer.getBoundingClientRect();
    const morphDuration = Math.max(0.4, (rect.width + rect.height) / 1800);
    bubble.style.setProperty('--morph-duration', `${morphDuration}s`);

    const targetTop = (rect.top + rect.height / 2) + 'px';
    const targetLeft = (rect.left + rect.width / 2) + 'px';
    const targetWidth = rect.width + 'px';
    const targetHeight = rect.height + 'px';

    const willMove = bubble.style.top !== targetTop || bubble.style.left !== targetLeft;
    const willMorph = bubble.style.width !== targetWidth
      || bubble.style.height !== targetHeight
      || bubble.style.borderRadius !== '1.5rem';

    const finishAnim = () => {
      bubble.classList.add('popping');
      createQueryBubblePopParticles(bubble);

      tableContainer.classList.remove('table-container-hidden');

      const filterPanel = document.getElementById('filter-side-panel');
      if (filterPanel) {
        filterPanel.classList.remove('fade-out');
      }

      setTimeout(() => {
        if (bubble.parentNode) bubble.remove();
        if (bubble._hud && bubble._hud.parentNode) bubble._hud.remove();
      }, 400);
    };

    const startSizeMorph = () => {
      if (!willMorph) {
        finishAnim();
        return;
      }

      let finished = false;
      const completeMorph = () => {
        if (finished) return;
        finished = true;
        bubble.removeEventListener('transitionend', onMorphTransitionEnd);
        finishAnim();
      };

      const onMorphTransitionEnd = (event) => {
        if (event.propertyName !== 'width' && event.propertyName !== 'height' && event.propertyName !== 'border-radius') {
          return;
        }
        completeMorph();
      };

      bubble.addEventListener('transitionend', onMorphTransitionEnd);

      requestAnimationFrame(() => {
        bubble.style.width = targetWidth;
        bubble.style.height = targetHeight;
        bubble.style.borderRadius = '1.5rem';
      });

      setTimeout(completeMorph, (morphDuration * 1000) + 120);
    };

    if (!willMove) {
      startSizeMorph();
    } else {
      let finished = false;
      const completeMove = () => {
        if (finished) return;
        finished = true;
        bubble.removeEventListener('transitionend', onMoveTransitionEnd);
        startSizeMorph();
      };

      const onMoveTransitionEnd = (event) => {
        if (event.propertyName !== 'top' && event.propertyName !== 'left') {
          return;
        }
        completeMove();
      };

      bubble.addEventListener('transitionend', onMoveTransitionEnd);

      requestAnimationFrame(() => {
        bubble.style.top = targetTop;
        bubble.style.left = targetLeft;
      });

      setTimeout(completeMove, (morphDuration * 1000) + 120);
    }
  }
}

const queryTableAnimation = Object.freeze({
  endTableQueryAnimation,
  startTableQueryAnimation,
  updateTableQueryAnimationProgress
});

registerAppUiActionDependencies({ queryTableAnimation });

export { createTableQueryCircuitOverlay };
