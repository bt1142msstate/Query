/* ---------- Table morph animation ---------- */
function createTableQueryCircuitOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'table-query-circuit';
  overlay.className = 'table-query-library';

  const shelfLayout = [
    { top: '24%', books: 8 },
    { top: '50%', books: 9 },
    { top: '76%', books: 7 }
  ];
  const runnerBooks = [
    { startX: '18%', startY: '24%', delay: '0.1s', duration: '4.9s', hue: '18', width: '20px', height: '68px' },
    { startX: '72%', startY: '24%', delay: '1.3s', duration: '5.4s', hue: '214', width: '18px', height: '64px' },
    { startX: '22%', startY: '50%', delay: '0.8s', duration: '5.1s', hue: '148', width: '22px', height: '72px' },
    { startX: '78%', startY: '50%', delay: '2.2s', duration: '5.6s', hue: '42', width: '19px', height: '66px' },
    { startX: '30%', startY: '76%', delay: '1.7s', duration: '5s', hue: '326', width: '21px', height: '70px' },
    { startX: '68%', startY: '76%', delay: '2.9s', duration: '5.3s', hue: '190', width: '17px', height: '62px' }
  ];

  shelfLayout.forEach((shelfInfo, shelfIndex) => {
    const shelf = document.createElement('div');
    shelf.className = 'table-query-library-shelf';
    shelf.style.top = shelfInfo.top;

    const rail = document.createElement('div');
    rail.className = 'table-query-library-rail';
    shelf.appendChild(rail);

    const books = document.createElement('div');
    books.className = 'table-query-library-books';
    books.style.setProperty('--shelf-count', String(shelfInfo.books));

    for (let index = 0; index < shelfInfo.books; index += 1) {
      const book = document.createElement('span');
      const height = 48 + ((index + shelfIndex * 3) % 4) * 7;
      const width = 14 + ((index + shelfIndex) % 3) * 4;
      const hue = (18 + shelfIndex * 58 + index * 27) % 360;
      book.className = 'table-query-library-book is-static';
      book.style.setProperty('--book-height', `${height}px`);
      book.style.setProperty('--book-width', `${width}px`);
      book.style.setProperty('--book-hue', `${hue}`);
      book.style.setProperty('--book-tilt', `${((index % 3) - 1) * 1.5}deg`);
      books.appendChild(book);
    }

    shelf.appendChild(books);
    overlay.appendChild(shelf);
  });

  const scanner = document.createElement('div');
  scanner.className = 'table-query-library-scanner';
  scanner.innerHTML = `
    <div class="table-query-library-scanner-core"></div>
    <div class="table-query-library-scan-beam"></div>
    <div class="table-query-library-scan-glow"></div>
  `;
  overlay.appendChild(scanner);

  runnerBooks.forEach((bookConfig, index) => {
    const book = document.createElement('span');
    book.className = 'table-query-library-book is-runner';
    book.style.setProperty('--runner-start-x', bookConfig.startX);
    book.style.setProperty('--runner-start-y', bookConfig.startY);
    book.style.setProperty('--runner-delay', bookConfig.delay);
    book.style.setProperty('--runner-duration', bookConfig.duration);
    book.style.setProperty('--book-height', bookConfig.height);
    book.style.setProperty('--book-width', bookConfig.width);
    book.style.setProperty('--book-hue', bookConfig.hue);
    book.style.setProperty('--runner-tilt', `${index % 2 === 0 ? '-6deg' : '6deg'}`);
    overlay.appendChild(book);
  });

  return overlay;
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