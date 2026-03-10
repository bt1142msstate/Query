/**
 * Realistic Fireflies Animation Module
 * Creates animated firefly elements that drift organically across the screen
 * with realistic flash patterns and meandering movement.
 * @module Fireflies
 */
(function createFireflies(){
  // Natural realistic firefly colors
  const glowPalette = [
    { color: '#ccff00', weight: 0.60 },  // yellow-green (common)
    { color: '#aaff00', weight: 0.25 },  // greenish
    { color: '#ffdd55', weight: 0.10 },  // warm amber
    { color: '#ffaa55', weight: 0.04 },  // reddish-orange (rare)
    { color: '#bbffff', weight: 0.01 }   // bluish-white (very rare)
  ];

  function pickGlow(){
    const r = Math.random();
    let sum = 0;
    for(const g of glowPalette){
      sum += g.weight;
      if(r < sum) return g.color;
    }
    return glowPalette[0].color;
  }

  const COUNT = 35;
  const fireflies = [];

  function init() {
    for(let i=0; i<COUNT; i++){
      const f = document.createElement('div');
      f.className = 'firefly';
      
      const size = 1.5 + Math.random() * 2; // 1.5 to 3.5px
      const glow = pickGlow();
      const blur = 3 + size * 2;
      const spread = size * 0.8;
      
      f.style.setProperty('--size', size + 'px');
      f.style.setProperty('--glow', glow);
      f.style.setProperty('--blur', blur + 'px');
      f.style.setProperty('--spread', spread + 'px');
      
      const blinkDur = 4 + Math.random() * 6; // 4 to 10s cycle
      const blinkDelay = Math.random() * 10;
      f.style.setProperty('--blinkDur', blinkDur + 's');
      f.style.setProperty('--blinkDelay', '-' + blinkDelay + 's'); // Start staggered
      
      document.body.appendChild(f);
      
      fireflies.push({
        el: f,
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        angle: Math.random() * Math.PI * 2,
        speed: 0.1 + Math.random() * 0.5,
        wander: 0,
        swayOffset: Math.random() * 100, // For sine wave swaying
        swaySpeed: 0.01 + Math.random() * 0.03
      });
    }
    
    requestAnimationFrame(animate);
  }

  let lastTime = 0;
  function animate(time) {
    if (!lastTime) lastTime = time;
    const dt = Math.min(time - lastTime, 50); // cap dt so it doesn't jump
    lastTime = time;
    
    const w = window.innerWidth;
    const h = window.innerHeight;
    
    for (let i=0; i<fireflies.length; i++) {
        const ff = fireflies[i];
        
        // Meandering bug movement (small gradual turns)
        ff.wander += (Math.random() - 0.5) * 0.1;
        ff.wander = Math.max(-0.05, Math.min(0.05, ff.wander));
        
        ff.angle += ff.wander;
        
        // Add a slight sine wave wobble perpendicular to movement
        const sway = Math.sin(time * ff.swaySpeed + ff.swayOffset) * 0.5;
        
        // Time scale to keep speed consistent regardless of framerate
        const timeScale = dt / 16.6;
        
        const vx = (Math.cos(ff.angle) * ff.speed + Math.cos(ff.angle + Math.PI/2) * sway) * timeScale;
        const vy = (Math.sin(ff.angle) * ff.speed + Math.sin(ff.angle + Math.PI/2) * sway) * timeScale;
        
        ff.x += vx;
        ff.y += vy;
        
        // Screen wrapping with a small margin so they don't pop instantly
        const margin = 50;
        if (ff.x < -margin) ff.x = w + margin;
        else if (ff.x > w + margin) ff.x = -margin;
        
        if (ff.y < -margin) ff.y = h + margin;
        else if (ff.y > h + margin) ff.y = -margin;
        
        // Use the individual CSS `translate` property so it composes with
        // the CSS animation's `transform: scale()` instead of fighting it.
        ff.el.style.translate = `${ff.x.toFixed(1)}px ${ff.y.toFixed(1)}px`;
    }
    
    requestAnimationFrame(animate);
  }

  // Delay init slightly to ensure CSS matches are processed
  setTimeout(init, 100);
})();
