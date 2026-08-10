function installHydrationHistoryBridge({ openWorkspace, setMode, getController }) {
  window.addEventListener('query:open-hydration-run', async event => {
    const runId = event.detail?.runId;
    if (!runId || !openWorkspace()) return;
    setMode('bulk');
    await getController()?.loadSavedRun(runId);
  });
}

export { installHydrationHistoryBridge };
