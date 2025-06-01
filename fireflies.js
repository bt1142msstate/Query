(function createFireflies(){
  /* Weighted color palette: common → rare */
  const glowPalette = [
    { color: '#fff9ae', weight: 0.55 },  // yellow-green (common)
    { color: '#b8ffab', weight: 0.25 },  // greenish
    { color: '#ffd36e', weight: 0.15 },  // warm amber
    { color: '#ff946e', weight: 0.04 },  // reddish-orange (rare)
    { color: '#8afcff', weight: 0.01 }   // bluish-green (very rare)
  ];
  function pickGlow(){
    const r = Math.random();
    let sum = 0;
    for(const g of glowPalette){
      sum += g.weight;
      if(r < sum) return g.color;
    }
    return glowPalette[0].color; // fallback
  }

  const COUNT = 30;

  function createOneFirefly(){
    const f = document.createElement('div');
    f.className = 'firefly';
    // start transparent, let CSS fadeIn handle the appearance
    f.classList.add('new');
    // --- position & movement vector ---
    const dx = (Math.random()*120 - 60).toFixed(0) + 'px';
    const dy = (Math.random()*120 - 60).toFixed(0) + 'px';
    f.style.setProperty('--dx', dx);
    f.style.setProperty('--dy', dy);
    // --- size & glow ---
    const size = 2 + Math.random()*2;
    f.style.width  = f.style.height = size + 'px';
    const glow = pickGlow();
    const blur = 4 + size*3;
    f.style.background = glow;
    f.style.boxShadow  = `0 0 ${blur}px ${size}px ${glow}`;
    // --- timing vars ---
    // drift duration inversely related to size (closer = faster)
    const dur = 30 - size * 5;                 // 20-25 s approx
    const blinkDur   = 2 + Math.random()*3;    // 2-5 s
    const blinkDelay = Math.random()*3;        // 0-3 s
    const flashDelay = 4 + Math.random()*8;    // 4-12 s
    // --- fadeIn duration (randomized) ---
    const fadeInDur  = 1.5 + Math.random()*1.5;   // 1.5 – 3 s
    f.style.setProperty('--fadeInDur', fadeInDur + 's');

    f.style.animationDuration = `${fadeInDur}s, ${dur}s, ${blinkDur}s, .25s`;
    f.style.animationDelay    = `0s, 0s, ${blinkDelay}s, ${flashDelay}s`;
    f.style.setProperty('--dur',  dur + 's');
    f.style.setProperty('--blinkDur',  blinkDur + 's');
    f.style.setProperty('--blinkDelay', blinkDelay + 's');
    f.style.setProperty('--flashDelay', flashDelay + 's');

    // recycle after a few drift cycles
    let cycles = 0;
    f.addEventListener('animationiteration', (evt)=>{
      if(evt.animationName === 'drift'){
        cycles++;
        if(cycles > 4){
          // Let the firefly keep drifting; once it is fully out of view, recycle it
          const exitCheck = setInterval(()=>{
            const r = f.getBoundingClientRect();
            if(r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth){
              clearInterval(exitCheck);
              f.remove();
              setTimeout(createOneFirefly, 500);   // 0.5 s gap before new spawn
            }
          }, 800);          // check roughly each second
        }
      }
      if(evt.animationName === 'blink'){
        /* 40 % chance of a subtle size pulse */
        if(Math.random() < 0.4){
          f.classList.add('flash-scale');
          setTimeout(() => f.classList.remove('flash-scale'), 250);
        }
        /* On every blink, vary halo intensity slightly (±5 % blur) */
        const intensity = 4 + size*3;
        const blurVariation = intensity * (0.95 + Math.random()*0.1); // 95-105 %
        f.style.boxShadow = `0 0 ${blurVariation}px ${size}px ${glow}`;
      }
    });
    // initial random viewport position
    f.style.top  = Math.random()*100 + 'vh';
    f.style.left = Math.random()*100 + 'vw';
    document.body.appendChild(f);
    // allow fadeIn animation to run on the next frame
    requestAnimationFrame(()=> f.classList.remove('new'));
  }

  for(let i=0;i<COUNT;i++){
    createOneFirefly();
  }
})(); 