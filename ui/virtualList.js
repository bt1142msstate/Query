class VirtualList {
  constructor({ container, itemHeight = 48, renderItem }) {
    this.container = container;
    this.itemHeight = itemHeight;
    this.renderItem = renderItem;
    this.items = [];
  }

  setItems(items = [], resetScroll = true) {
    this.items = Array.isArray(items) ? items.slice() : [];
    if (resetScroll && this.container) {
      this.container.scrollTop = 0;
    }
    this.render();
  }

  render() {
    if (!this.container || typeof this.renderItem !== 'function') {
      return;
    }

    this.container.replaceChildren();
    this.items.forEach((item, index) => {
      const element = this.renderItem(item, index);
      if (element) {
        this.container.appendChild(element);
      }
    });
  }

  destroy() {
    if (this.container) {
      this.container.replaceChildren();
    }
    this.items = [];
    this.container = null;
  }
}

export { VirtualList };
