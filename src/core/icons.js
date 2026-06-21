function trashSVG(width, height) {
  const sizeAttrs = (width != null && height != null) ? ` width="${width}" height="${height}"` : '';
  return `<svg viewBox="0 0 16 16"${sizeAttrs} class="destructive-flame-icon" aria-hidden="true"><path class="destructive-flame-shape" fill="currentColor" d="M9.32 15.653a.812.812 0 0 1-.086-.855c.176-.342.245-.733.2-1.118a2.106 2.106 0 0 0-.267-.779 2.027 2.027 0 0 0-.541-.606 3.96 3.96 0 0 1-1.481-2.282c-1.708 2.239-1.053 3.51-.235 4.63a.748.748 0 0 1-.014.901.87.87 0 0 1-.394.283.838.838 0 0 1-.478.023c-1.105-.27-2.145-.784-2.85-1.603a4.686 4.686 0 0 1-.906-1.555 4.811 4.811 0 0 1-.263-1.797s-.133-2.463 2.837-4.876c0 0 3.51-2.978 2.292-5.18a.621.621 0 0 1 .112-.653.558.558 0 0 1 .623-.147l.146.058a7.63 7.63 0 0 1 2.96 3.5c.58 1.413.576 3.06.184 4.527.325-.292.596-.641.801-1.033l.029-.064c.198-.477.821-.325 1.055-.013.086.137 2.292 3.343 1.107 6.048a5.516 5.516 0 0 1-1.84 2.027 6.127 6.127 0 0 1-2.138.893.834.834 0 0 1-.472-.038.867.867 0 0 1-.381-.29zM7.554 7.892a.422.422 0 0 1 .55.146c.04.059.066.126.075.198l.045.349c.02.511.014 1.045.213 1.536.206.504.526.95.932 1.298a3.06 3.06 0 0 1 1.16 1.422c.22.564.25 1.19.084 1.773a4.123 4.123 0 0 0 1.39-.757l.103-.084c.336-.277.613-.623.813-1.017.201-.393.322-.825.354-1.269.065-1.025-.284-2.054-.827-2.972-.248.36-.59.639-.985.804-.247.105-.509.17-.776.19a.792.792 0 0 1-.439-.1.832.832 0 0 1-.321-.328.825.825 0 0 1-.035-.729c.412-.972.54-2.05.365-3.097a5.874 5.874 0 0 0-1.642-3.16c-.156 2.205-2.417 4.258-2.881 4.7a3.537 3.537 0 0 1-.224.194c-2.426 1.965-2.26 3.755-2.26 3.834a3.678 3.678 0 0 0 .459 2.043c.365.645.89 1.177 1.52 1.54C4.5 12.808 4.5 10.89 7.183 8.14l.372-.25z"/></svg>`;
}

function templateBlocksSVG(className = 'template-default-icon template-blocks-icon w-4 h-4') {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="${className}" aria-hidden="true">
      <g class="template-block template-block-top">
        <rect x="14" y="8" width="26" height="16" rx="5" fill="#FFFFFF" stroke="#111827" stroke-width="4"/>
        <circle cx="23" cy="8" r="4" fill="#FFFFFF" stroke="#111827" stroke-width="4"/>
        <circle cx="32" cy="8" r="4" fill="#FFFFFF" stroke="#111827" stroke-width="4"/>
      </g>
      <g class="template-block template-block-middle">
        <rect x="24" y="26" width="30" height="16" rx="5" fill="#FFFFFF" stroke="#111827" stroke-width="4"/>
        <circle cx="34" cy="26" r="4" fill="#FFFFFF" stroke="#111827" stroke-width="4"/>
        <circle cx="44" cy="26" r="4" fill="#FFFFFF" stroke="#111827" stroke-width="4"/>
      </g>
      <g class="template-block template-block-bottom">
        <rect x="10" y="44" width="32" height="14" rx="5" fill="#FFFFFF" stroke="#111827" stroke-width="4"/>
        <circle cx="21" cy="44" r="4" fill="#FFFFFF" stroke="#111827" stroke-width="4"/>
        <circle cx="31" cy="44" r="4" fill="#FFFFFF" stroke="#111827" stroke-width="4"/>
      </g>
    </svg>`;
}

function templateDocumentSVG(className = 'template-default-icon template-document-icon w-4 h-4') {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="${className}" aria-hidden="true">
      <path class="template-document-page" d="M16 7h23l9 9v41H16z" fill="#FFFFFF" stroke="#111827" stroke-width="4" stroke-linejoin="round"/>
      <path class="template-document-fold" d="M39 7v11h10" fill="none" stroke="#111827" stroke-width="4" stroke-linejoin="round"/>
      <path class="template-document-line" d="M23 27h18M23 36h18M23 45h12" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round"/>
    </svg>`;
}

const Icons = Object.freeze({ templateBlocksSVG, templateDocumentSVG, trashSVG });

export { Icons, templateBlocksSVG, templateDocumentSVG, trashSVG };
