function hasDragType(event, dragType) {
  const types = event?.dataTransfer?.types;
  return Boolean(types && Array.from(types).includes(dragType));
}

const DragUtils = Object.freeze({ hasDragType });

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'DragUtils', {
    configurable: false,
    enumerable: true,
    value: DragUtils,
    writable: false
  });
}

export { DragUtils, hasDragType };
