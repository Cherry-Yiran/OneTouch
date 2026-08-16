export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const NEW_FEATURES_VERSION = '1.1.0';
export const NEW_FEATURE_IDS = Object.freeze([]);

export function shouldShowNewFeatureBadges(version, seenVersion) {
  if (NEW_FEATURE_IDS.length === 0) return false;
  const matchesVersion = typeof version === 'string' && (
    version === NEW_FEATURES_VERSION
    || version.startsWith(`${NEW_FEATURES_VERSION}-`)
  );
  return matchesVersion && seenVersion !== NEW_FEATURES_VERSION;
}

export function updateCheckIsDue(lastCheckedAt, now = Date.now()) {
  const parsed = Number(lastCheckedAt);
  return !Number.isFinite(parsed)
    || parsed <= 0
    || now - parsed >= UPDATE_CHECK_INTERVAL_MS;
}
