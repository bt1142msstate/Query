import { getClientErrorMessage } from '../../core/clientErrorMessages.js';
import { OclcBibCompare } from '../../ui/bib-compare/oclcBibCompare.js';
import { showToastMessage } from './tableToast.js';
import { fetchCompleteRecordDetails } from './recordDetailsApi.js';
import { closeActiveRecordDetails, openRecordDetails, openRecordDetailsLoading } from './recordDetailsDialog.js';
import { buildRecordDetailsModelFromResponse } from './recordDetailsModel.js';

function createRecordDetailsAction({ bodyCell, fields, recordDetails, recordLookup, bibCompareLookup, preview }) {
  if (!recordDetails?.fields?.length) return null;
  return {
    icon: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 1.5h7l3 3V14a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 3 14V1.5z"/><path d="M10 1.5V5h3"/><path d="M5.5 8h5M5.5 10.5h5M5.5 13h3"/></svg>',
    label: 'View Record Details',
    hint: recordDetails.kind.label,
    preview,
    async run() {
      if (!recordLookup) {
        showToastMessage('This row does not include an item, call number, or catalog identifier needed to load complete details.', 'warning');
        return;
      }
      openRecordDetailsLoading({ trigger: bodyCell });
      try {
        const payload = await fetchCompleteRecordDetails(recordLookup);
        openRecordDetails({
          record: buildRecordDetailsModelFromResponse(payload, fields),
          trigger: bodyCell,
          bibLookup: bibCompareLookup,
          onOpenBib: lookup => OclcBibCompare.openForLookup(lookup)
        });
      } catch (error) {
        closeActiveRecordDetails();
        showToastMessage(getClientErrorMessage(error, { fallback: 'The complete record details could not be loaded. Try again.' }), 'error');
      }
    }
  };
}

export { createRecordDetailsAction };
