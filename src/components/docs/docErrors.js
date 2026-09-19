/** Worker / network error code → i18n key, shared by every document screen. */
const KEYS = {
  file_too_large: 'docs.errFileTooLarge',
  unsupported_type: 'docs.errUnsupported',
  quota_exceeded: 'docs.errQuota',
  too_many_files: 'docs.errTooMany',
  storage_full: 'docs.errStorageFull',
  daily_limit: 'docs.errDailyLimit',
  not_a_member: 'docs.errNotMember',
  not_found: 'docs.notAvailable',
  network: 'docs.errNetwork',
  consent_required: 'library.errConsent',
  subject_required: 'library.errSubject',
  own_document: 'library.errOwn',
};

export const docErrorKey = code => KEYS[code] || 'docs.errGeneric';
