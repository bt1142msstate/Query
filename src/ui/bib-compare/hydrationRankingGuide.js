function hydrationRankingGuideMarkup() {
  return `
    <section class="bib-compare-ranking-guide hidden" data-bib-ranking-guide role="dialog" aria-modal="true" aria-labelledby="bib-ranking-title">
      <div class="bib-compare-ranking-panel">
        <header class="bib-compare-ranking-header">
          <div>
            <span class="bib-compare-eyebrow">Selection policy</span>
            <h2 id="bib-ranking-title">How hydration ranking works</h2>
            <p>Requested fields help choose between safe matches. They never make a different edition safe.</p>
          </div>
          <button class="bib-compare-icon-button" type="button" data-bib-ranking-close aria-label="Close ranking explanation" title="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </header>
        <ol class="bib-compare-ranking-steps">
          <li>
            <span>1</span>
            <div><h3>Try OCLC first</h3><p>Hydration checks a trusted local OCLC number, then OCLC's best-match service and a bounded WorldCat search. OCLC remains the primary source.</p></div>
          </li>
          <li>
            <span>2</span>
            <div><h3>Use LC only as fallback</h3><p>If OCLC has no acceptable edition match, Hydration may retrieve the exact Library of Congress record identified by the local MARC 010 LCCN. It never guesses by title over an insecure connection.</p></div>
          </li>
          <li>
            <span>3</span>
            <div><h3>Confirm that it is the same item</h3><p>Title, identifiers, format, creator, edition, publication details, language, pagination, and dimensions are compared. A meaningful conflict stops automatic hydration.</p></div>
          </li>
          <li>
            <span>4</span>
            <div><h3>Check the fields you want</h3><p>Only after identity passes does the system evaluate requested fields and report a recommendation. Scores are decision aids, not statistical probabilities or vendor confidence values.</p></div>
          </li>
        </ol>
        <div class="bib-compare-ranking-decisions" aria-label="Hydration recommendation meanings">
          <div data-advice="recommended"><strong>Recommended</strong><p>The identity threshold passes, all requested fields are available and eligible, and overall confidence is at least 80.</p></div>
          <div data-advice="review"><strong>Review</strong><p>The match is plausible, but partial field coverage or stricter edition-sensitive evidence needs staff judgment.</p></div>
          <div data-advice="do_not_hydrate"><strong>Do not hydrate</strong><p>Identity or overall confidence is below 80, records conflict, fields are protected, or none of the requested fields is available.</p></div>
        </div>
        <p class="bib-compare-ranking-threshold">All-field and edition-sensitive plans require identity 90. Standard selected-field plans require identity 80.</p>
      </div>
    </section>
  `;
}

function createHydrationRankingGuide(workspace) {
  let returnFocus = null;
  const guide = workspace.querySelector('[data-bib-ranking-guide]');
  const header = workspace.querySelector('.bib-compare-header');
  const layout = workspace.querySelector('.bib-compare-layout');

  function open() {
    if (!guide || !guide.classList.contains('hidden')) return false;
    returnFocus = document.activeElement;
    if (header) header.inert = true;
    if (layout) layout.inert = true;
    guide.classList.remove('hidden');
    guide.querySelector('[data-bib-ranking-close]')?.focus();
    return true;
  }

  function close() {
    if (!guide || guide.classList.contains('hidden')) return false;
    guide.classList.add('hidden');
    if (header) header.inert = false;
    if (layout) layout.inert = false;
    returnFocus?.focus?.();
    returnFocus = null;
    return true;
  }

  workspace.querySelector('[data-bib-ranking-open]')?.addEventListener('click', open);
  workspace.querySelector('[data-bib-ranking-close]')?.addEventListener('click', close);
  guide?.addEventListener('click', event => {
    if (event.target === guide) close();
  });

  return Object.freeze({ close, open });
}

export { createHydrationRankingGuide, hydrationRankingGuideMarkup };
