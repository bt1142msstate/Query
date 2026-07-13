import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cloneTemplate,
  normalizeTemplate
} from '../../../src/features/templates/data/queryTemplateModels.js';
import {
  DEFAULT_TEMPLATE_SVG,
  getTemplateSvgMarkup
} from '../../../src/features/templates/view/queryTemplateSvg.js';

test('query template models discard custom SVG data', () => {
  const normalized = normalizeTemplate({
    id: 'unsafe-template',
    name: 'Unsafe template',
    svg: '<svg><script>alert(1)</script></svg>',
    bubble_svg: '<svg onload="alert(1)"></svg>',
    ui_config: {}
  }, 0);

  assert.equal('svg' in normalized, false);
  assert.equal('bubble_svg' in normalized, false);

  const cloned = cloneTemplate({
    ...normalized,
    svg: '<svg><foreignObject>unsafe</foreignObject></svg>'
  });
  assert.equal('svg' in cloned, false);
  assert.equal(getTemplateSvgMarkup(normalized), DEFAULT_TEMPLATE_SVG);
  assert.equal(getTemplateSvgMarkup({ svg: '<svg onload="alert(1)"></svg>' }), DEFAULT_TEMPLATE_SVG);
});
