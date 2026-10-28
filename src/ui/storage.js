/** First-visit memory for the guided tour. Stores one short flag; every failure (storage blocked, quota) is swallowed. */
export function hasCompletedTour(storage, key) {
  try {
    return !!storage && storage.getItem(key) === 'done';
  } catch {
    return false;
  }
}

export function markTourCompleted(storage, key) {
  try {
    if (!storage) return false;
    storage.setItem(key, 'done');
    return true;
  } catch {
    return false;
  }
}

/** `window.localStorage`, or null when the browser denies access (access itself can throw). */
export function safeLocalStorage(win) {
  try {
    return win.localStorage || null;
  } catch {
    return null;
  }
}
