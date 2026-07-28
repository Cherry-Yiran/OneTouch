export function reorderControlIds(ids, movedId, targetId, insertAfter = false) {
  if (movedId === targetId) return ids;

  const sourceIndex = ids.indexOf(movedId);
  const targetIndex = ids.indexOf(targetId);
  if (sourceIndex === -1 || targetIndex === -1) return ids;

  const next = ids.filter((id) => id !== movedId);
  const insertionIndex = next.indexOf(targetId) + (insertAfter ? 1 : 0);
  next.splice(insertionIndex, 0, movedId);

  return next.every((id, index) => id === ids[index]) ? ids : next;
}

export function reorderControlByOffset(ids, movedId, offset) {
  const sourceIndex = ids.indexOf(movedId);
  const targetIndex = Math.max(0, Math.min(ids.length - 1, sourceIndex + offset));
  if (sourceIndex === -1 || sourceIndex === targetIndex) return ids;

  const targetId = ids[targetIndex];
  return reorderControlIds(ids, movedId, targetId, offset > 0);
}
