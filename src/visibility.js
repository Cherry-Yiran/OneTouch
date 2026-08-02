export function clampVisibleControlIds(ids) {
  return [...new Set(ids)];
}

export function toggleVisibleControl(ids, id) {
  if (ids.includes(id)) return ids.filter((itemId) => itemId !== id);
  return [...ids, id];
}
