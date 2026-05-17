export const UNCATEGORIZED_NAME_STORAGE_KEY = 'post-production-planner:uncategorized-names';

export function readLocalObject(key, fallback = {}) {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key) ?? '{}') };
  } catch {
    return fallback;
  }
}
