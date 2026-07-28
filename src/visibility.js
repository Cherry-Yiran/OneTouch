export const MAX_VISIBLE_CONTROLS = 8;

export function clampVisibleControlIds(ids) {
  return [...new Set(ids)].slice(0, MAX_VISIBLE_CONTROLS);
}

export function toggleVisibleControl(ids, id) {
  if (ids.includes(id)) return ids.filter((itemId) => itemId !== id);
  if (ids.length >= MAX_VISIBLE_CONTROLS) return ids;
  return [...ids, id];
}
