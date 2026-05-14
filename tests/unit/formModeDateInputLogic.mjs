import assert from 'node:assert/strict';
import {
  createFormModeDateInputState,
  resolveDateValue
} from '../../ui/form-mode/formModeDateInput.js';

class FakeInput extends EventTarget {
  constructor(value = '') {
    super();
    this.value = value;
    this.ownerDocument = { activeElement: this };
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

assert.deepEqual(resolveDateValue('Jan 2, 2026'), {
  canCommit: true,
  normalized: '1/2/2026',
  raw: 'Jan 2, 2026'
});
assert.deepEqual(resolveDateValue('1/'), {
  canCommit: false,
  normalized: '',
  raw: '1/'
});

const partialInput = new FakeInput('1/2/2026');
const partialState = createFormModeDateInputState(partialInput, { idleMs: 20 });
partialInput.value = '1/';
partialInput.dispatchEvent(new Event('input', { bubbles: true }));
assert.deepEqual(partialState.getFormValues(), ['1/2/2026']);
await wait(35);
assert.equal(partialInput.value, '1/');
assert.deepEqual(partialState.getFormValues(), ['1/2/2026']);
partialInput.dispatchEvent(new Event('blur', { bubbles: true }));
assert.deepEqual(partialState.getFormValues(), ['1/']);
partialState.destroy();

const idleInput = new FakeInput('1/2/2026');
const idleState = createFormModeDateInputState(idleInput, { idleMs: 20 });
let idleCommitEvents = 0;
idleInput.addEventListener('change', () => {
  idleCommitEvents += 1;
});
idleInput.value = 'Feb 3, 2026';
idleInput.dispatchEvent(new Event('input', { bubbles: true }));
assert.deepEqual(idleState.getFormValues(), ['1/2/2026']);
await wait(35);
assert.equal(idleInput.value, '2/3/2026');
assert.deepEqual(idleState.getFormValues(), ['2/3/2026']);
assert.equal(idleCommitEvents, 1);
idleState.destroy();

const changeInput = new FakeInput('1/2/2026');
const changeState = createFormModeDateInputState(changeInput, { idleMs: 1000 });
changeInput.value = 'Mar 4, 2026';
changeInput.dispatchEvent(new Event('input', { bubbles: true }));
changeInput.dispatchEvent(new Event('change', { bubbles: true }));
assert.equal(changeInput.value, '3/4/2026');
assert.deepEqual(changeState.getFormValues(), ['3/4/2026']);
changeState.destroy();

console.log('Form mode date input logic tests passed');
