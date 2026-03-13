/* ---------- Table morph animation — 3-D Bookshelf ---------- */
function createTableQueryCircuitOverlay() {
  const container = document.createElement('div');
  container.id   = 'table-query-circuit';
  container.className = 'table-query-bookshelf';

  /* Canvas that Three.js will render into */
  const canvas = document.createElement('canvas');
  canvas.width  = 350;
  canvas.height = 350;
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border-radius:inherit;display:block;';
  container.appendChild(canvas);

  /* ── start / stop hooks called by the lifecycle functions below ── */
  container._startAnimation = function () {
    if (container._threeRunning || typeof THREE === 'undefined') return;
    container._threeRunning = true;

    const W = 350, H = 350;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container._renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x110905);
    scene.fog = new THREE.FogExp2(0x110905, 0.15);

    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 30);
    camera.position.set(0, 0.35, 4.4);
    camera.lookAt(0, 0.1, 0);

    /* ── Lights ── */
    scene.add(new THREE.AmbientLight(0xfff0d8, 0.5));

    const mainLight = new THREE.DirectionalLight(0xffebc8, 0.85);
    mainLight.position.set(2, 5, 4);
    mainLight.castShadow = true;
    scene.add(mainLight);

    const fillLight = new THREE.PointLight(0xff9940, 0.45, 14);
    fillLight.position.set(-2, -0.5, 3);
    scene.add(fillLight);

    const scanLight = new THREE.PointLight(0x00e8ff, 0, 5);
    scene.add(scanLight);

    /* ── Shelf materials ── */
    const shelfMat     = new THREE.MeshStandardMaterial({ color: 0x7a4f28, roughness: 0.85, metalness: 0.05 });
    const shelfDarkMat = new THREE.MeshStandardMaterial({ color: 0x4e2f0f, roughness: 0.90, metalness: 0.00 });

    /* Bookcase dimensions */
    const SW = 3.8, SD = 0.32, ST = 0.07, SBH = 2.5, yBase = -1.05;

    /* Back panel */
    const back = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.14, SBH + 0.1, 0.04), shelfDarkMat);
    back.position.set(0, yBase + SBH / 2, -SD / 2 - 0.02);
    back.receiveShadow = true;
    scene.add(back);

    /* Top & bottom rails */
    [yBase, yBase + SBH].forEach(y => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.14, ST, SD + 0.08), shelfMat);
      b.position.set(0, y, 0);
      b.castShadow = true; b.receiveShadow = true;
      scene.add(b);
    });

    /* Side panels */
    [-SW / 2 - 0.05, SW / 2 + 0.05].forEach(x => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, SBH + 0.1, SD + 0.08), shelfMat);
      s.position.set(x, yBase + SBH / 2, 0);
      s.castShadow = true; s.receiveShadow = true;
      scene.add(s);
    });

    /* Two inner shelf boards */
    const shelfYs = [yBase + 0.28, yBase + 0.28 + (SBH - 0.28) / 2];
    shelfYs.forEach(y => {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(SW, ST, SD), shelfMat);
      sh.position.set(0, y, 0);
      sh.castShadow = true; sh.receiveShadow = true;
      scene.add(sh);
    });

    /* ── Books ── */
    const palette = [
      0xc0392b, 0x2980b9, 0x27ae60, 0xe67e22, 0x8e44ad,
      0x16a085, 0xdc143c, 0x2c3e50, 0xd35400, 0x1abc9c,
      0x6c5ce7, 0xe84393, 0x0984e3, 0xf9ca24, 0x00b894,
      0xa29bfe, 0xfd79a8, 0x55efc4, 0xe55039, 0x74b9ff,
    ];

    const allBooks = [];

    shelfYs.forEach(shelfY => {
      const floorY = shelfY + ST / 2;
      let x = -SW / 2 + 0.07;
      while (x < SW / 2 - 0.1) {
        const bW = 0.11  + Math.random() * 0.09;
        const bH = 0.36  + Math.random() * 0.32;
        const bD = SD * 0.78;
        if (x + bW > SW / 2 - 0.07) break;

        const color = palette[Math.floor(Math.random() * palette.length)];
        const mat = new THREE.MeshStandardMaterial({
          color, roughness: 0.72, metalness: 0.05,
          emissive: new THREE.Color(color), emissiveIntensity: 0,
        });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, bD), mat);
        const bX = x + bW / 2;
        const bY = floorY + bH / 2;
        mesh.position.set(bX, bY, 0);
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);

        /* Spine highlight strips */
        const sMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14 });
        [bH * 0.28, -bH * 0.05].forEach(sy => {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(bW * 0.85, 0.018, 0.001), sMat);
          strip.position.set(0, sy, bD / 2 + 0.001);
          mesh.add(strip);
        });

        allBooks.push({ mesh, mat, color, origX: bX, origY: bY, origZ: 0, width: bW, height: bH });
        x += bW + 0.006 + Math.random() * 0.016;
      }
    });

    /* ── Scan beam — thin horizontal stripe that sweeps vertically ── */
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x00ffea, transparent: true, opacity: 0.85,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const scanBeam = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.032), beamMat);
    scanBeam.visible = false;
    scene.add(scanBeam);

    /* Soft glow halo behind the beam */
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x00ffea, transparent: true, opacity: 0.2,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const scanHalo = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.22), haloMat);
    scanHalo.visible = false;
    scene.add(scanHalo);

    /* ── Animation state machine ── */
    const T_IDLE = 0.45, T_PULL = 0.7, T_SCAN = 1.4, T_PUSH = 0.6;
    const PULL_Z = 1.15, LIFT_Y = 0.1;
    let state = 'idle', timer = 0, camBobT = 0, scanAngle = 0;
    let currentBook = null, lastBook = null;

    function ease(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
    function pickBook() {
      const pool = allBooks.filter(b => b !== lastBook);
      return pool[Math.floor(Math.random() * pool.length)];
    }

    let prevT = performance.now();

    function tick() {
      if (!container._threeRunning) return;
      container._raf = requestAnimationFrame(tick);

      const now = performance.now();
      const dt  = Math.min((now - prevT) / 1000, 0.05);
      prevT = now;
      timer    += dt;
      camBobT  += dt;

      /* Gentle camera sway */
      camera.position.y = 0.35 + Math.sin(camBobT * 0.38) * 0.045;
      camera.position.x = Math.sin(camBobT * 0.22) * 0.09;
      camera.lookAt(0, 0.1, 0);

      /* ── states ── */
      if (state === 'idle') {
        if (timer >= T_IDLE) { currentBook = pickBook(); timer = 0; state = 'pulling'; }

      } else if (state === 'pulling') {
        const e = ease(Math.min(timer / T_PULL, 1));
        currentBook.mesh.position.z = e * PULL_Z;
        currentBook.mesh.position.y = currentBook.origY + e * LIFT_Y;
        scanLight.position.copy(currentBook.mesh.position);
        scanLight.intensity = e * 1.2;
        if (timer >= T_PULL) { state = 'scanning'; timer = 0; scanAngle = 0; }

      } else if (state === 'scanning') {
        const tFrac = Math.min(timer / T_SCAN, 1);

        /* Slight tilt — like turning the book to inspect the barcode */
        currentBook.mesh.rotation.y = Math.sin(tFrac * Math.PI * 2) * 0.18;

        /* Emissive colour pulse */
        currentBook.mat.emissiveIntensity = 0.14 + Math.abs(Math.sin(timer * 7.5)) * 0.18;

        /* Sweep the scan beam top → bottom */
        const bookTop = currentBook.origY + LIFT_Y + currentBook.height / 2;
        const bookBot = currentBook.origY + LIFT_Y - currentBook.height / 2;
        const beamY   = bookTop + (bookBot - bookTop) * tFrac;

        scanBeam.scale.x = currentBook.width * 1.18;
        scanBeam.position.set(currentBook.mesh.position.x, beamY, currentBook.mesh.position.z + 0.09);
        scanBeam.visible = true;
        beamMat.opacity  = 0.72 + Math.sin(tFrac * Math.PI) * 0.2;

        scanHalo.scale.x = currentBook.width * 1.45;
        scanHalo.position.copy(scanBeam.position);
        scanHalo.position.z -= 0.01;
        scanHalo.visible = true;

        /* Orbiting point light for coloured spill on nearby books */
        scanAngle += dt * 4.5;
        scanLight.position.set(
          currentBook.mesh.position.x + Math.cos(scanAngle) * 0.3,
          currentBook.mesh.position.y + Math.sin(scanAngle * 0.7) * 0.18,
          currentBook.mesh.position.z + 0.2
        );
        scanLight.intensity = 1.4 + Math.sin(scanAngle) * 0.35;

        if (tFrac >= 1) {
          currentBook.mesh.rotation.set(0, 0, 0);
          currentBook.mat.emissiveIntensity = 0;
          scanBeam.visible = false;
          scanHalo.visible = false;
          scanLight.intensity = 0;
          state = 'pushing'; timer = 0;
        }

      } else if (state === 'pushing') {
        const e = ease(Math.min(timer / T_PUSH, 1));
        currentBook.mesh.position.z = (1 - e) * PULL_Z;
        currentBook.mesh.position.y = currentBook.origY + (1 - e) * LIFT_Y;
        scanLight.intensity = (1 - e) * 0.5;
        if (timer >= T_PUSH) {
          currentBook.mesh.position.set(currentBook.origX, currentBook.origY, currentBook.origZ);
          scanLight.intensity = 0;
          lastBook = currentBook; currentBook = null;
          state = 'idle'; timer = 0;
        }
      }

      renderer.render(scene, camera);
    }

    tick();
  };

  container._stopAnimation = function () {
    container._threeRunning = false;
    if (container._raf)      { cancelAnimationFrame(container._raf); container._raf = null; }
    if (container._renderer) { container._renderer.dispose();        container._renderer = null; }
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
  if (circuit._startAnimation) circuit._startAnimation();
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