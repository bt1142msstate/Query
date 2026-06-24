import assert from 'node:assert/strict';
import test from 'node:test';

test('workspace layout observer resyncs when an existing form card is revealed by class changes', async () => {
  const moduleUrl = new URL('../../../src/ui/workspaceLayoutObservers.js', import.meta.url);
  moduleUrl.searchParams.set('test', String(Date.now()));
  const { initializeWorkspaceLayoutObservers } = await import(moduleUrl.href);

  const formStage = { id: 'form-mode-stage' };
  const formCard = { id: 'form-mode-card' };
  const observedMutations = [];
  const observedResizeTargets = [];
  const animationFrameCallbacks = [];
  let mutationCallback = null;
  let syncCount = 0;
  let renderCount = 0;

  class FakeMutationObserver {
    constructor(callback) {
      mutationCallback = callback;
    }

    observe(target, options) {
      observedMutations.push({ options, target });
    }
  }

  class FakeResizeObserver {
    constructor(callback) {
      this.callback = callback;
    }

    observe(target) {
      observedResizeTargets.push(target);
    }

    disconnect() {}
  }

  const documentRef = {
    body: { id: 'page-body' },
    getElementById(id) {
      if (id === 'form-mode-stage') return formStage;
      if (id === 'form-mode-card') return formCard;
      return null;
    }
  };

  const windowRef = {
    matchMedia() {
      return { matches: false };
    },
    MutationObserver: FakeMutationObserver,
    ResizeObserver: FakeResizeObserver,
    requestAnimationFrame(callback) {
      animationFrameCallbacks.push(callback);
      return animationFrameCallbacks.length;
    }
  };

  initializeWorkspaceLayoutObservers({
    documentRef,
    renderVirtualTable: () => {
      renderCount += 1;
    },
    syncTableViewportHeight: () => {
      syncCount += 1;
    },
    windowRef
  });

  assert.equal(observedMutations.length, 2);
  assert.equal(observedMutations[0].target, formStage);
  assert.deepEqual(observedMutations[0].options, {
    attributeFilter: ['class', 'hidden', 'style'],
    attributes: true,
    childList: true,
    subtree: true
  });
  assert.equal(observedMutations[1].target, documentRef.body);
  assert.deepEqual(observedMutations[1].options, {
    attributeFilter: ['class', 'style'],
    attributes: true
  });
  assert.deepEqual(observedResizeTargets, [formCard]);

  while (animationFrameCallbacks.length) {
    animationFrameCallbacks.shift()();
  }
  assert.equal(syncCount, 1);
  assert.equal(renderCount, 1);

  mutationCallback([{ target: documentRef.body }]);
  while (animationFrameCallbacks.length) {
    animationFrameCallbacks.shift()();
  }

  assert.equal(syncCount, 2);
  assert.equal(renderCount, 2);
});

test('workspace layout observer ignores body-only mutations in mobile layout', async () => {
  const moduleUrl = new URL('../../../src/ui/workspaceLayoutObservers.js', import.meta.url);
  moduleUrl.searchParams.set('test', `mobile-${Date.now()}`);
  const { initializeWorkspaceLayoutObservers } = await import(moduleUrl.href);

  const formStage = { id: 'form-mode-stage' };
  const formCard = { id: 'form-mode-card' };
  const animationFrameCallbacks = [];
  let mutationCallback = null;
  let syncCount = 0;
  let renderCount = 0;

  class FakeMutationObserver {
    constructor(callback) {
      mutationCallback = callback;
    }

    observe() {}
  }

  class FakeResizeObserver {
    observe() {}
    disconnect() {}
  }

  const documentRef = {
    body: { id: 'page-body' },
    getElementById(id) {
      if (id === 'form-mode-stage') return formStage;
      if (id === 'form-mode-card') return formCard;
      return null;
    }
  };

  const windowRef = {
    matchMedia() {
      return { matches: true };
    },
    MutationObserver: FakeMutationObserver,
    ResizeObserver: FakeResizeObserver,
    requestAnimationFrame(callback) {
      animationFrameCallbacks.push(callback);
      return animationFrameCallbacks.length;
    }
  };

  initializeWorkspaceLayoutObservers({
    documentRef,
    renderVirtualTable: () => {
      renderCount += 1;
    },
    syncTableViewportHeight: () => {
      syncCount += 1;
    },
    windowRef
  });

  while (animationFrameCallbacks.length) {
    animationFrameCallbacks.shift()();
  }
  assert.equal(syncCount, 1);
  assert.equal(renderCount, 1);

  mutationCallback([{ target: documentRef.body }]);
  while (animationFrameCallbacks.length) {
    animationFrameCallbacks.shift()();
  }

  assert.equal(syncCount, 1);
  assert.equal(renderCount, 1);
});
