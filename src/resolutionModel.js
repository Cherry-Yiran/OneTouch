export function primaryDisplay(configuration) {
  const displays = configuration?.displays || [];
  return displays.find((display) => display.main) || displays[0] || null;
}

export function displayResolutionSummary(configuration) {
  const display = primaryDisplay(configuration);
  if (!display?.currentWidth || !display?.currentHeight) return null;
  return `${display.currentWidth} × ${display.currentHeight}`;
}
