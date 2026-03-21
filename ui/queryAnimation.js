/* ---------- Table morph animation — Spacefield bubble ---------- */
function createTableQueryCircuitOverlay() {
  const container = document.createElement('div');
  container.id   = 'table-query-circuit';
  container.className = 'table-query-cosmos';

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;border-radius:inherit;';
  container.appendChild(canvas);

  container._startAnimation = function () {
    if (container._spaceRunning) return;
    container._spaceRunning = true;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const getSize = () => ({
      w: container.clientWidth || 350,
      h: container.clientHeight || 350
    });

    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let stars = [];
    let comets = [];
    let nebulae = [];
    let lastFrame = performance.now();
    let cometCooldown = 0.2;

    function randomBetween(min, max) {
      return min + Math.random() * (max - min);
    }

    function buildScene() {
      const starCount = Math.max(50, Math.round((width * height) / 1800));
      stars = Array.from({ length: starCount }, () => ({
        x: Math.random(),
        y: Math.random(),
        size: randomBetween(0.6, 2.4),
        alpha: randomBetween(0.3, 1),
        hue: randomBetween(190, 255),
        twinkleOffset: randomBetween(0, Math.PI * 2),
        speed: randomBetween(0.004, 0.018)
      }));

      nebulae = [
        { x: 0.24, y: 0.22, radius: 0.34, hue: 198, alpha: 0.22, drift: 0.12 },
        { x: 0.76, y: 0.32, radius: 0.28, hue: 286, alpha: 0.18, drift: -0.1 },
        { x: 0.56, y: 0.76, radius: 0.38, hue: 232, alpha: 0.16, drift: 0.08 }
      ];
    }

    function resizeCanvas() {
      const nextSize = getSize();
      width = nextSize.w;
      height = nextSize.h;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      buildScene();
    }

    function spawnComet() {
      const fromLeft = Math.random() > 0.5;
      comets.push({
        x: fromLeft ? -0.1 * width : 1.1 * width,
        y: randomBetween(0.18, 0.62) * height,
        vx: fromLeft ? randomBetween(110, 170) : randomBetween(-170, -110),
        vy: randomBetween(-18, 18),
        life: randomBetween(0.8, 1.25),
        ttl: randomBetween(0.8, 1.25),
        length: randomBetween(34, 64),
        hue: randomBetween(190, 220)
      });
    }

    function drawBackground(timeSeconds) {
      const bg = ctx.createRadialGradient(width * 0.5, height * 0.52, width * 0.08, width * 0.5, height * 0.52, width * 0.72);
      bg.addColorStop(0, 'rgba(30, 64, 175, 0.22)');
      bg.addColorStop(0.35, 'rgba(14, 25, 61, 0.94)');
      bg.addColorStop(1, 'rgba(4, 8, 19, 1)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      nebulae.forEach((cloud, index) => {
        const pulse = Math.sin(timeSeconds * (0.22 + index * 0.08) + index) * 0.04;
        const driftX = Math.cos(timeSeconds * cloud.drift + index) * width * 0.03;
        const driftY = Math.sin(timeSeconds * cloud.drift * 0.7 + index) * height * 0.025;
        const gradient = ctx.createRadialGradient(
          cloud.x * width + driftX,
          cloud.y * height + driftY,
          0,
          cloud.x * width + driftX,
          cloud.y * height + driftY,
          cloud.radius * Math.min(width, height)
        );
        gradient.addColorStop(0, `hsla(${cloud.hue}, 95%, 72%, ${cloud.alpha + pulse})`);
        gradient.addColorStop(0.45, `hsla(${cloud.hue}, 85%, 56%, ${cloud.alpha * 0.42})`);
        gradient.addColorStop(1, `hsla(${cloud.hue}, 85%, 40%, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cloud.x * width + driftX, cloud.y * height + driftY, cloud.radius * Math.min(width, height), 0, Math.PI * 2);
        ctx.fill();
      });
    }

    function drawStars(timeSeconds) {
      stars.forEach(star => {
        star.y += star.speed * 0.0009;
        if (star.y > 1.08) {
          star.y = -0.08;
          star.x = Math.random();
        }

        const twinkle = 0.62 + Math.sin(timeSeconds * 2.4 + star.twinkleOffset) * 0.38;
        const x = star.x * width;
        const y = star.y * height;
        const radius = star.size * (0.75 + twinkle * 0.45);

        ctx.fillStyle = `hsla(${star.hue}, 100%, 88%, ${star.alpha * twinkle})`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `hsla(${star.hue}, 100%, 92%, ${star.alpha * 0.2 * twinkle})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - radius * 2.4, y);
        ctx.lineTo(x + radius * 2.4, y);
        ctx.moveTo(x, y - radius * 2.4);
        ctx.lineTo(x, y + radius * 2.4);
        ctx.stroke();
      });
    }

    function drawPlanet(timeSeconds) {
      const planetX = width * 0.76;
      const planetY = height * 0.73;
      const planetRadius = Math.min(width, height) * 0.18;
      const glow = ctx.createRadialGradient(planetX - planetRadius * 0.4, planetY - planetRadius * 0.45, planetRadius * 0.05, planetX, planetY, planetRadius * 1.8);
      glow.addColorStop(0, 'rgba(125, 211, 252, 0.9)');
      glow.addColorStop(0.45, 'rgba(56, 189, 248, 0.26)');
      glow.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(planetX, planetY, planetRadius * 1.9, 0, Math.PI * 2);
      ctx.fill();

      const planet = ctx.createLinearGradient(planetX - planetRadius, planetY - planetRadius, planetX + planetRadius, planetY + planetRadius);
      planet.addColorStop(0, 'rgba(251, 191, 36, 0.92)');
      planet.addColorStop(0.55, 'rgba(249, 115, 22, 0.92)');
      planet.addColorStop(1, 'rgba(91, 33, 182, 0.96)');
      ctx.fillStyle = planet;
      ctx.beginPath();
      ctx.arc(planetX, planetY, planetRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.lineWidth = Math.max(1.6, planetRadius * 0.08);
      ctx.beginPath();
      ctx.ellipse(planetX, planetY + Math.sin(timeSeconds * 0.8) * planetRadius * 0.03, planetRadius * 1.48, planetRadius * 0.4, -0.22, 0, Math.PI * 2);
      ctx.stroke();
    }

    function drawSignal(timeSeconds) {
      const centerX = width * 0.34;
      const centerY = height * 0.38;
      const ringBase = Math.min(width, height) * 0.12;
      for (let index = 0; index < 3; index += 1) {
        const wave = (timeSeconds * 0.22 + index / 3) % 1;
        const radius = ringBase + wave * Math.min(width, height) * 0.2;
        ctx.strokeStyle = `rgba(125, 211, 252, ${0.22 * (1 - wave)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    function drawComets(deltaSeconds) {
      cometCooldown -= deltaSeconds;
      if (cometCooldown <= 0) {
        spawnComet();
        cometCooldown = randomBetween(0.8, 1.8);
      }

      comets = comets.filter(comet => {
        comet.ttl -= deltaSeconds;
        comet.x += comet.vx * deltaSeconds;
        comet.y += comet.vy * deltaSeconds;
        if (comet.ttl <= 0) {
          return false;
        }

        const progress = 1 - (comet.ttl / comet.life);
        const alpha = 0.9 * (1 - progress);
        const tailX = comet.x - Math.sign(comet.vx) * comet.length;
        const gradient = ctx.createLinearGradient(comet.x, comet.y, tailX, comet.y - comet.vy * 0.15);
        gradient.addColorStop(0, `hsla(${comet.hue}, 100%, 88%, ${alpha})`);
        gradient.addColorStop(1, `hsla(${comet.hue}, 100%, 70%, 0)`);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(comet.x, comet.y);
        ctx.lineTo(tailX, comet.y - comet.vy * 0.12);
        ctx.stroke();
        return true;
      });
    }

    function tick(now) {
      if (!container._spaceRunning) return;
      container._raf = requestAnimationFrame(tick);

      const deltaSeconds = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;
      const timeSeconds = now / 1000;

      ctx.clearRect(0, 0, width, height);
      drawBackground(timeSeconds);
      drawStars(timeSeconds);
      drawSignal(timeSeconds);
      drawPlanet(timeSeconds);
      drawComets(deltaSeconds);
    }

    let resizeObs = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(() => {
        resizeCanvas();
      });
      resizeObs.observe(container);
      container._resizeObs = resizeObs;
    }

    resizeCanvas();
    tick(lastFrame);
  };

  container._stopAnimation = function () {
    container._spaceRunning = false;
    if (container._resizeObs) { container._resizeObs.disconnect(); container._resizeObs = null; }
    if (container._raf) { cancelAnimationFrame(container._raf); container._raf = null; }
  };

  return container;
}

window.startTableQueryAnimation = function() {
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
  textNode.style.position = 'relative';
  textNode.style.zIndex = '2';

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
    if (runBtn && window.queryRunning) runBtn.click();
  };

  stopOverlay.addEventListener('click', e => { e.stopPropagation(); triggerStop(); });
  stopOverlay.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); triggerStop(); }
  });

  const circuit = createTableQueryCircuitOverlay();

  bubble.appendChild(rippleLayer);
  bubble.appendChild(circuit);
  bubble.appendChild(textNode);
  bubble.appendChild(stopOverlay);

  const rect = tableContainer.getBoundingClientRect();
  bubble.style.width = rect.width + 'px';
  bubble.style.height = rect.height + 'px';
  bubble.style.top = (rect.top + rect.height / 2) + 'px';
  bubble.style.left = (rect.left + rect.width / 2) + 'px';
  bubble.style.borderRadius = '1.5rem';

  document.body.appendChild(bubble);
  tableContainer.classList.add('table-container-hidden');

  const filterPanel = document.getElementById('filter-side-panel');
  if (filterPanel) {
    filterPanel.classList.add('fade-out');
  }

  void bubble.offsetWidth; /* force layout before starting render and transitions */

  if (circuit._startAnimation) circuit._startAnimation();

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
};

window.endTableQueryAnimation = function() {
  const tableContainer = document.getElementById('table-container');
  const bubble = document.getElementById('table-query-bubble');
  const circuit = document.getElementById('table-query-circuit');

  if (!bubble || !tableContainer) {
    if (tableContainer) tableContainer.classList.remove('table-container-hidden');
    document.body.classList.remove('scene-fade-out', 'scene-fade-transition');
    return;
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
      if (window.createBubblePopParticles) {
        window.createBubblePopParticles(bubble);
      }

      tableContainer.classList.remove('table-container-hidden');

      const filterPanel = document.getElementById('filter-side-panel');
      if (filterPanel) {
        filterPanel.classList.remove('fade-out');
      }

      setTimeout(() => {
        if (bubble.parentNode) bubble.remove();
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
};