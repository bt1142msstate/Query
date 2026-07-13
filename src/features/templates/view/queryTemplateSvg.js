const DEFAULT_TEMPLATE_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="template-default-icon" aria-hidden="true">
    <rect x="10" y="8" width="44" height="48" rx="12" fill="#FFFFFF" stroke="#111827" stroke-width="4"/>
    <path d="M22 22h20M22 32h20M22 42h12" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round"/>
    <path d="M44 8v10a4 4 0 0 0 4 4h6" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

function getTemplateSvgMarkup() {
  return DEFAULT_TEMPLATE_SVG;
}

export {
  DEFAULT_TEMPLATE_SVG,
  getTemplateSvgMarkup
};
