(function(){
  class FilterPill {
    constructor(filter, fieldDef, onRemove) {
      this.filter = filter;
      this.fieldDef = fieldDef;
      this.onRemove = onRemove;
      this.el = document.createElement('span');
      this.el.className = 'cond-pill';
      this.render();
    }

    render() {
      const { filter, fieldDef } = this;
      // Try to get a user-friendly label for the filter value
      let valueLabel = filter.val;
      if (fieldDef && fieldDef.values && typeof fieldDef.values[0] === 'object') {
        // Map literal to display if possible
        const map = new Map(fieldDef.values.map(v => [v.literal, v.display]));
        if (filter.cond.toLowerCase() === 'between') {
          valueLabel = filter.val.split('|').map(v => map.get(v) || v).join(' - ');
        } else {
          valueLabel = filter.val.split(',').map(v => map.get(v) || v).join(', ');
        }
      } else if (filter.cond.toLowerCase() === 'between') {
        valueLabel = filter.val.split('|').join(' - ');
      }
      // Operator label (always show full word)
      let opLabel = filter.cond.charAt(0).toUpperCase() + filter.cond.slice(1);
      // Trash can SVG (exactly as headerTrash)
      const trashSVG = `<button type="button" class="filter-trash" aria-label="Remove filter" tabindex="0" style="background:none;border:none;padding:0;margin-left:0.7em;display:flex;align-items:center;cursor:pointer;color:#888;">
        <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
          <path d="M9 3h6a1 1 0 0 1 1 1v1h4v2H4V5h4V4a1 1 0 0 1 1-1Zm-3 6h12l-.8 11.2A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-1.99-1.8L6 9Z"/>
        </svg>
      </button>`;
      // Render pill content with trash can at the end using flex
      this.el.style.display = 'flex';
      this.el.style.alignItems = 'center';
      this.el.style.justifyContent = 'space-between';
      this.el.innerHTML = `<span>${opLabel} <b>${valueLabel}</b></span>${trashSVG}`;
      // Remove handler
      this.el.querySelector('.filter-trash').onclick = (e) => {
        e.stopPropagation();
        if (this.onRemove) this.onRemove();
      };
    }

    getElement() {
      return this.el;
    }
  }

  window.FilterPill = FilterPill;
})();
