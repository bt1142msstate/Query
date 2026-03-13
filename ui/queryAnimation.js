/* ---------- Table morph animation ---------- */
function createTableQueryCircuitOverlay() {
  const circuit = document.createElement('div');
  circuit.id = 'table-query-circuit';
  circuit.className = 'table-query-circuit';

  const cols = 12;
  const rows = 10;
  const xMin = 8;
  const yMin = 9;
  const xStep = 84 / (cols - 1);
  const yStep = 80 / (rows - 1);

  const colors = ['#22d3ee', '#38bdf8', '#34d399', '#facc15'];
  const segments = [];
  const segmentIndex = new Map();
  const usedNodes = new Map();
  const busRows = [randomInt(2, 3), randomInt(rows - 4, rows - 3)].sort((a, b) => a - b);
  const busCols = [randomInt(2, 3), randomInt(cols - 4, cols - 3)].sort((a, b) => a - b);
  const serviceRows = [1, rows - 2];

  function point(col, row) {
    return {
      col,
      row,
      x: xMin + col * xStep,
      y: yMin + row * yStep,
      key: `${col},${row}`
    };
  }

  function addNodeUsage(pt) {
    usedNodes.set(pt.key, (usedNodes.get(pt.key) || 0) + 1);
  }

  function addSegment(a, b, options = {}) {
    if (!a || !b) return;
    if (a.key === b.key) return;
    if (a.col !== b.col && a.row !== b.row) return;

    const key = [a.key, b.key].sort().join('|');
    if (segmentIndex.has(key)) {
      const existing = segments[segmentIndex.get(key)];
      existing.width = Math.max(existing.width, options.width || 3);
      existing.pulseChance = Math.max(existing.pulseChance, options.pulseChance || 0);
      return;
    }

    segmentIndex.set(key, segments.length);
    segments.push({
      a,
      b,
      width: options.width || 3,
      pulseChance: options.pulseChance ?? 0.35
    });
    addNodeUsage(a);
    addNodeUsage(b);
  }

  function addPath(points, options = {}) {
    for (let i = 0; i < points.length - 1; i++) {
      addSegment(points[i], points[i + 1], options);
    }
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function nearestValue(value, candidates) {
    return candidates.reduce((best, candidate) => {
      return Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best;
    }, candidates[0]);
  }

  function routePadToNetwork(pad) {
    const padPoint = pad.point;

    if (pad.side === 'left' || pad.side === 'right') {
      const targetCol = pad.side === 'left' ? busCols[0] : busCols[busCols.length - 1];
      const targetRow = nearestValue(padPoint.row, busRows);
      addPath([
        padPoint,
        point(targetCol, padPoint.row),
        point(targetCol, targetRow)
      ], { width: 2, pulseChance: 0.22 });
      return;
    }

    const targetRow = pad.side === 'top' ? busRows[0] : busRows[busRows.length - 1];
    const targetCol = nearestValue(padPoint.col, busCols);
    addPath([
      padPoint,
      point(padPoint.col, targetRow),
      point(targetCol, targetRow)
    ], { width: 2, pulseChance: 0.2 });
  }

  function createChip(col, row, width, height) {
    const pads = [];

    const padRows = Array.from({ length: height }, (_, index) => row + index);
    const padCols = Array.from({ length: width }, (_, index) => col + index);

    if (col - 1 >= 1) {
      addSegment(point(col - 1, row), point(col - 1, row + height - 1), { width: 2, pulseChance: 0.12 });
      padRows.forEach(padRow => {
        const pad = { point: point(col - 1, padRow), side: 'left' };
        pads.push(pad);
        addNodeUsage(pad.point);
      });
    }

    if (col + width <= cols - 2) {
      addSegment(point(col + width, row), point(col + width, row + height - 1), { width: 2, pulseChance: 0.12 });
      padRows.forEach(padRow => {
        const pad = { point: point(col + width, padRow), side: 'right' };
        pads.push(pad);
        addNodeUsage(pad.point);
      });
    }

    if (Math.random() < 0.7 && row - 1 >= 1) {
      padCols.forEach((padCol, index) => {
        if (index !== 0 && index !== padCols.length - 1 && Math.random() < 0.45) return;
        const pad = { point: point(padCol, row - 1), side: 'top' };
        pads.push(pad);
        addNodeUsage(pad.point);
      });
    }

    if (Math.random() < 0.8 && row + height <= rows - 2) {
      padCols.forEach((padCol, index) => {
        if (index !== 0 && index !== padCols.length - 1 && Math.random() < 0.45) return;
        const pad = { point: point(padCol, row + height), side: 'bottom' };
        pads.push(pad);
        addNodeUsage(pad.point);
      });
    }

    pads
      .filter((_, index) => index % 2 === 0 || Math.random() < 0.28)
      .forEach(routePadToNetwork);
  }

  function createBottomConnectorBank() {
    const count = randomInt(5, 7);
    const startCol = randomInt(3, cols - count - 2);

    for (let index = 0; index < count; index++) {
      const col = startCol + index;

      const feedPoint = point(col, rows - 2);
      addNodeUsage(feedPoint);

      if (index % 2 === 0 || Math.random() < 0.4) {
        addPath([
          feedPoint,
          point(col, busRows[busRows.length - 1]),
          point(nearestValue(col, busCols), busRows[busRows.length - 1])
        ], { width: 2, pulseChance: 0.16 });
      }
    }
  }

  busRows.forEach(row => addSegment(point(1, row), point(cols - 2, row), { width: 4, pulseChance: 0.72 }));
  busCols.forEach(col => addSegment(point(col, 1), point(col, rows - 2), { width: 4, pulseChance: 0.64 }));
  serviceRows.forEach(row => addSegment(point(2, row), point(cols - 3, row), { width: 2, pulseChance: 0.14 }));

  const chipCandidates = [
    { col: randomInt(3, 4), row: randomInt(2, 3), width: randomInt(2, 3), height: randomInt(2, 3) },
    { col: randomInt(6, 7), row: randomInt(2, 4), width: randomInt(2, 3), height: randomInt(2, 3) },
    { col: randomInt(4, 6), row: randomInt(5, 6), width: 2, height: randomInt(2, 3), optional: true }
  ];

  chipCandidates.forEach(candidate => {
    if (candidate.optional && Math.random() < 0.45) return;
    createChip(candidate.col, candidate.row, candidate.width, candidate.height);
  });

  createBottomConnectorBank();

  for (let i = 0; i < randomInt(2, 4); i++) {
    const trunkCol = busCols[randomInt(0, busCols.length - 1)];
    const stubRow = nearestValue(randomInt(2, rows - 3), busRows);
    const direction = Math.random() < 0.5 ? -1 : 1;
    const endRow = Math.max(1, Math.min(rows - 2, stubRow + direction * randomInt(1, 2)));
    addSegment(point(trunkCol, stubRow), point(trunkCol, endRow), { width: 2, pulseChance: 0.14 });
  }

  for (let i = 0; i < randomInt(2, 3); i++) {
    const serviceRow = serviceRows[randomInt(0, serviceRows.length - 1)];
    const startCol = randomInt(2, cols - 4);
    const endCol = Math.min(cols - 3, startCol + randomInt(1, 2));
    addSegment(point(startCol, serviceRow), point(endCol, serviceRow), { width: 2, pulseChance: 0.12 });
  }

  segments.forEach(({ a, b, width, pulseChance }) => {
    const trace = document.createElement('div');
    trace.className = 'table-query-circuit-trace';

    const angle = a.row === b.row ? 0 : 90;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const pulseDuration = Math.max(0.52, length / 26);
    const centerX = (a.x + b.x) / 2;
    const centerY = (a.y + b.y) / 2;
    const colorA = colors[Math.floor(Math.random() * colors.length)];
    const colorB = colors[Math.floor(Math.random() * colors.length)];

    trace.style.setProperty('--trace-angle', `${angle}deg`);
    trace.style.setProperty('--trace-len', `${length.toFixed(2)}%`);
    trace.style.setProperty('--trace-x', `${centerX.toFixed(2)}%`);
    trace.style.setProperty('--trace-y', `${centerY.toFixed(2)}%`);
    trace.style.setProperty('--trace-thickness', `${width}px`);
    trace.style.setProperty('--trace-color-a', colorA);
    trace.style.setProperty('--trace-color-b', colorB);
    trace.style.setProperty('--trace-flicker-delay', `${(-Math.random() * 3).toFixed(2)}s`);

    if (Math.random() < pulseChance) {
      const pulse = document.createElement('span');
      pulse.className = 'table-query-circuit-pulse';
      pulse.style.setProperty('--pulse-duration', `${pulseDuration.toFixed(2)}s`);
      pulse.style.setProperty('--pulse-delay', `${(-Math.random() * 1.6).toFixed(2)}s`);
      pulse.style.setProperty('--pulse-color', colorA);
      pulse.style.setProperty('--pulse-size', `${Math.max(7, width + 5)}px`);
      trace.appendChild(pulse);
    }

    circuit.appendChild(trace);
  });

  usedNodes.forEach((degree, key) => {
    const [colRaw, rowRaw] = key.split(',');
    const col = Number(colRaw);
    const row = Number(rowRaw);
    const node = document.createElement('div');
    node.className = 'table-query-circuit-node';
    node.style.left = `${(xMin + col * xStep).toFixed(2)}%`;
    node.style.top = `${(yMin + row * yStep).toFixed(2)}%`;
    node.style.setProperty('--node-size', degree >= 3 ? '8px' : '6px');
    node.style.setProperty('--node-delay', `${(-Math.random() * 2).toFixed(2)}s`);
    circuit.appendChild(node);
  });

  return circuit;
}

window.startTableQueryAnimation = function() {
  const tableContainer = document.getElementById('table-container');
  if (!tableContainer) return;

  const oldBubble = document.getElementById('table-query-bubble');
  if (oldBubble) oldBubble.remove();

  const bubble = document.createElement('div');
  bubble.id = 'table-query-bubble';
  bubble.className = 'table-query-bubble';

  const textNode = document.createElement('span');
  textNode.className = 'table-query-bubble-text';
  textNode.textContent = 'Querying...';
  textNode.style.position = 'relative';
  textNode.style.zIndex = '2';

  const circuit = createTableQueryCircuitOverlay();

  bubble.appendChild(circuit);
  bubble.appendChild(textNode);

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

  void bubble.offsetWidth;

  document.body.classList.add('scene-fade-transition', 'scene-fade-out');

  bubble.style.width = '350px';
  bubble.style.height = '350px';
  bubble.style.top = '50%';
  bubble.style.left = '50%';
  bubble.style.borderRadius = '50%';

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