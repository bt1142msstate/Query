/**
 * Toast Notification System
 * Handles displaying temporary notification messages to the user.
 * @module Toast
 */

window.showToastMessage = function(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  
  // Support different toast types
  const config = {
    info: { bg: 'bg-blue-100 border-blue-500 text-blue-700', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    error: { bg: 'bg-red-100 border-red-500 text-red-700', icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    warning: { bg: 'bg-orange-100 border-orange-500 text-orange-700', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z' },
    success: { bg: 'bg-green-100 border-green-500 text-green-700', icon: 'M5 13l4 4L19 7' }
  };
  
  const { bg, icon } = config[type] || config.info;
  toast.className = `fixed bottom-4 right-4 ${bg} px-4 py-3 rounded-md shadow-lg z-50 border`;
    
  toast.innerHTML = `
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${icon}"></path>
      </svg>
      <span>${message}</span>
    </div>
  `;
  
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
};

// Local alias for export (if we were using modules, but we're using globals)
// const showToastMessage = window.showToastMessage;
