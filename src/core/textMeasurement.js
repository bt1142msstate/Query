const DEFAULT_FONT = '14px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';

const TextMeasurement = {
  canvas: document.createElement('canvas'),

  get ctx() {
    return this.canvas.getContext('2d');
  },

  measureText(text, font = DEFAULT_FONT) {
    this.ctx.font = font;
    return this.ctx.measureText(text).width;
  },

  findMaxFittingChars(text, maxWidth, font = DEFAULT_FONT) {
    this.ctx.font = font;

    let left = 0;
    let right = text.length;
    let maxFitChars = 0;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const testText = `${text.substring(0, mid)}...`;
      const testWidth = this.ctx.measureText(testText).width;

      if (testWidth <= maxWidth) {
        maxFitChars = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return maxFitChars;
  }
};

export { TextMeasurement };
