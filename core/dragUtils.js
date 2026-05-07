function hasDragType(event, dragType) {
  const types = event?.dataTransfer?.types;
  return Boolean(types && Array.from(types).includes(dragType));
}

const DragUtils = Object.freeze({ hasDragType });

export { DragUtils, hasDragType };
