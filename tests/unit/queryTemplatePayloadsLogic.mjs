import assert from 'node:assert/strict';
import {
  buildCreateTemplatePayload,
  buildPinTemplatePayload,
  buildUpdateTemplatePayload,
  getTemplatePinOrder
} from '../../templates/queryTemplatePayloads.js';

const categories = [
  { id: 'reports', name: 'Reports', description: 'Saved reports' },
  { id: 'audits', name: 'Audits', description: 'Review work' }
];
const draft = {
  name: 'Branch report',
  description: 'Daily branch report',
  svg: '<svg onclick="alert(1)"><script>alert(1)</script><path d="M0 0"/></svg>',
  categories: [categories[1]],
  pinned: true,
  pinOrder: 3,
  uiConfig: { DesiredColumnOrder: ['Old'] }
};
const currentConfig = { DesiredColumnOrder: ['Title'] };
const fallbackConfig = { DesiredColumnOrder: ['Fallback'] };

assert.equal(getTemplatePinOrder({ pinOrder: 2 }), 2);
assert.equal(getTemplatePinOrder({ pinOrder: '2' }), undefined);
assert.equal(getTemplatePinOrder({ pinOrder: 'bad' }), undefined);

assert.deepEqual(buildCreateTemplatePayload({
  draft,
  categories,
  uiConfig: currentConfig
}), {
  name: 'Branch report',
  description: 'Daily branch report',
  svg: '<svg><path d="M0 0"/></svg>',
  categories: [categories[1]],
  ui_config: currentConfig,
  pinned: true,
  pin_order: 3
});

assert.deepEqual(buildUpdateTemplatePayload({
  draft: { ...draft, pinned: false, pinOrder: null },
  categories,
  currentQueryConfig: null,
  fallbackUiConfig: fallbackConfig
}), {
  name: 'Branch report',
  description: 'Daily branch report',
  svg: '<svg><path d="M0 0"/></svg>',
  categories: [categories[1]],
  ui_config: fallbackConfig,
  pinned: false,
  pin_order: undefined
});

assert.deepEqual(buildPinTemplatePayload({
  template: {
    name: 'Pinned template',
    description: 'Pin me',
    svg: '<svg><circle /></svg>',
    categories,
    uiConfig: currentConfig
  },
  nextPinned: true,
  nextPinOrder: 4
}), {
  name: 'Pinned template',
  description: 'Pin me',
  svg: '<svg><circle /></svg>',
  categories,
  ui_config: currentConfig,
  pinned: true,
  pin_order: 4
});

assert.equal(buildPinTemplatePayload({
  template: { name: 'Unpinned' },
  nextPinned: false,
  nextPinOrder: 4
}).pin_order, undefined);

console.log('Query template payload logic tests passed');
