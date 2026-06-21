import assert from 'node:assert/strict';
import test from 'node:test';
import { renderTemplateList } from '../../../src/features/templates/view/queryTemplateListView.js';

function createClassList(owner) {
  function read() {
    return new Set(String(owner.className || '').split(/\s+/u).filter(Boolean));
  }

  function write(values) {
    owner.className = Array.from(values).join(' ');
  }

  return {
    add(value) {
      const values = read();
      values.add(value);
      write(values);
    },
    remove(value) {
      const values = read();
      values.delete(value);
      write(values);
    },
    toggle(value, force) {
      const values = read();
      const shouldAdd = force === undefined ? !values.has(value) : Boolean(force);
      if (shouldAdd) {
        values.add(value);
      } else {
        values.delete(value);
      }
      write(values);
    },
    contains(value) {
      return read().has(value);
    }
  };
}

function createElement(tagName) {
  const element = {
    tagName,
    attributes: {},
    children: [],
    className: '',
    dataset: {},
    innerHTML: '',
    textContent: '',
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener() {},
    replaceChildren(...children) {
      this.children = children.flatMap(child => child?.tagName === '#fragment' ? child.children : child);
      this.innerHTML = '';
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
  };
  element.classList = createClassList(element);
  return element;
}

function collectMarkup(node) {
  if (!node) return '';
  return `${node.innerHTML || ''}${(node.children || []).map(collectMarkup).join('')}`;
}

test('template list rows use neutral SVG previews without legacy overlay styling hooks', () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createDocumentFragment: () => createElement('#fragment'),
    createElement
  };

  try {
    const elements = {
      emptyState: createElement('div'),
      list: createElement('div'),
      listStatus: createElement('div')
    };

    renderTemplateList({
      elements,
      state: {
        draggedPinnedId: '',
        loading: false,
        selectedId: 'template-1'
      },
      visibleTemplates: [{
        id: 'template-1',
        name: 'Recent Queries',
        description: 'Recently saved query',
        pinned: false
      }],
      restricted: false,
      onSelectTemplate: () => {},
      onPinTemplate: () => {},
      onReorderPinnedTemplates: () => {},
      onDraggedPinnedIdChange: () => {},
      getTemplateSvgMarkup: () => '<svg class="neutral-icon" aria-hidden="true"></svg>'
    });

    const markup = collectMarkup(elements.list);

    assert.match(markup, /templates-list-item__template-preview/u);
    assert.match(markup, /neutral-icon/u);
    assert.doesNotMatch(markup, /templates-list-item__brick-face/u);
    assert.doesNotMatch(markup, /templates-list-item__stud-row/u);
    assert.doesNotMatch(markup, /templates-list-item__snap/u);
  } finally {
    globalThis.document = previousDocument;
  }
});
