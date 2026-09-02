const RESTORE_LAST_REPORT_PREFERENCE_STORAGE_KEY = 'query:restoreLastReportOnStartup';
const SMART_FILTER_ORDERING_PREFERENCE_STORAGE_KEY = 'query:smartFilterOrderingEnabled';

function getPreferenceStorage(storage) {
  const isUsableStorage = candidate => Boolean(
    candidate
    && typeof candidate.getItem === 'function'
    && typeof candidate.setItem === 'function'
    && typeof candidate.removeItem === 'function'
  );

  if (isUsableStorage(storage)) {
    return storage;
  }

  try {
    const candidate = globalThis.window?.localStorage || globalThis.localStorage || null;
    return isUsableStorage(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function shouldRestoreLastReport(storage) {
  return getPreferenceStorage(storage)?.getItem(RESTORE_LAST_REPORT_PREFERENCE_STORAGE_KEY) === 'true';
}

function setRestoreLastReportPreference(enabled, storage) {
  const target = getPreferenceStorage(storage);
  if (!target) {
    return false;
  }

  if (enabled) {
    target.setItem(RESTORE_LAST_REPORT_PREFERENCE_STORAGE_KEY, 'true');
  } else {
    target.removeItem(RESTORE_LAST_REPORT_PREFERENCE_STORAGE_KEY);
  }
  return true;
}

function shouldUseSmartFilterOrdering(storage) {
  return getPreferenceStorage(storage)?.getItem(SMART_FILTER_ORDERING_PREFERENCE_STORAGE_KEY) !== 'false';
}

function setSmartFilterOrderingPreference(enabled, storage) {
  const target = getPreferenceStorage(storage);
  if (!target) {
    return false;
  }

  if (enabled) {
    target.removeItem(SMART_FILTER_ORDERING_PREFERENCE_STORAGE_KEY);
  } else {
    target.setItem(SMART_FILTER_ORDERING_PREFERENCE_STORAGE_KEY, 'false');
  }
  return true;
}

export {
  RESTORE_LAST_REPORT_PREFERENCE_STORAGE_KEY,
  SMART_FILTER_ORDERING_PREFERENCE_STORAGE_KEY,
  setRestoreLastReportPreference,
  setSmartFilterOrderingPreference,
  shouldRestoreLastReport,
  shouldUseSmartFilterOrdering
};
