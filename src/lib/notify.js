/**
 * notify — a tiny pub/sub between non-React code and the toast UI.
 * --------------------------------------------------------------------------
 * Pages write to Firestore from plain async functions, far from any component
 * that could render an error. Rather than thread a callback through every one
 * of them, they call `reportSaveError(e)` and the mounted <Toaster /> picks it
 * up through this module.
 *
 * TRANSLATION: this module runs outside React, so it cannot call `useTranslation`.
 * It therefore emits an i18n KEY, never a sentence, and <Toaster /> — which does
 * live inside the provider — resolves it in the user's language.
 *
 * There is exactly one subscriber at a time (the <Toaster /> mounted in App).
 * If none is mounted yet the message is dropped rather than queued — a toast
 * that arrives seconds late is worse than no toast.
 */

let subscriber = null;

/** Called by <Toaster /> on mount. Returns the unsubscribe function. */
export function subscribeToNotifications(fn) {
  subscriber = fn;
  return () => { if (subscriber === fn) subscriber = null; };
}

/**
 * Show a message to the user.
 * @param {string} key   i18n key, e.g. 'system.saveFailed'
 * @param {'error'|'success'|'info'|'offline'} tone
 * @param {object} [extra]  optional `{ action }` for an actionable toast
 */
export function notify(key, tone = 'info', extra) {
  subscriber?.({ key, tone, ...extra });
}

/** Being offline needs different wording: the fix is not "retry", it's "wait". */
function defaultFailureKey() {
  return navigator.onLine === false ? 'system.saveFailedOffline' : 'system.saveFailed';
}

/**
 * A background operation failed and the user should know about it.
 *
 * @param {unknown} error      the caught error
 * @param {string}  [context]  short label to find the call site in the console
 * @param {string}  [messageKey]  i18n key; defaults to the save wording
 */
export function reportError(error, context, messageKey) {
  console.error(context ? `[${context}]` : '[error]', error);
  notify(messageKey || defaultFailureKey(), 'error');
}

/**
 * A Firestore write (or any persistence call) failed.
 *
 * Local state has usually been updated optimistically already, so the user
 * believes the change is saved. Tell them plainly that it is not, and keep the
 * technical detail in the console for debugging.
 *
 * @param {unknown} error      the caught error
 * @param {string}  [context]  short label to find the call site in the console
 */
export function reportSaveError(error, context) {
  reportError(error, context ? `save ${context}` : 'save');
}
