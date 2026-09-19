/**
 * Visual vocabulary for documents: one icon, tint and label per file kind.
 * Kept in a plain module (no components) so React Fast Refresh stays happy.
 * Tints follow the nature palette: russet, forest, lake blue, bark.
 */

import { FileText, Image as ImageIcon, FileSpreadsheet, NotebookText } from 'lucide-react';

export const KIND_VISUALS = {
  pdf:    { icon: FileText,        tint: '#C4553A', labelKey: 'docs.kindPdf' },
  image:  { icon: ImageIcon,       tint: '#2E8B57', labelKey: 'docs.kindImage' },
  office: { icon: FileSpreadsheet, tint: '#3A6EA5', labelKey: 'docs.kindOffice' },
  text:   { icon: NotebookText,    tint: '#8C6D46', labelKey: 'docs.kindText' },
};

export const visualFor = kind => KIND_VISUALS[kind] || KIND_VISUALS.text;

/** "PDF", "DOCX", "JPG"… from the stored file name. */
export function extensionLabel(name = '') {
  const ext = name.includes('.') ? name.split('.').pop() : '';
  return ext.slice(0, 4).toUpperCase();
}

/** Localized byte units for formatBytes(). */
export const byteUnits = t => [t('docs.unitB'), t('docs.unitKB'), t('docs.unitMB')];

// ── Public library ──

/** Study levels (codes stored by the worker; labels in i18n `library.level_<code>`). */
export const LIBRARY_LEVELS = ['secondary', 'y1', 'y2', 'y3', 'master', 'phd', 'other'];

/** Document languages. Native names, so they read the same in every UI language. */
export const LIBRARY_LANGUAGES = [
  { code: 'fr', label: 'Français' }, { code: 'en', label: 'English' }, { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' }, { code: 'nl', label: 'Nederlands' }, { code: 'it', label: 'Italiano' },
  { code: 'other', labelKey: 'library.languageOther' },
];

/** Profile "year" values (see PageProfile YEARS) → library level, to pre-fill the form. */
export const LEVEL_FROM_PROFILE_YEAR = {
  '1ère': 'y1', '2ème': 'y2', '3ème': 'y3', 'Master 1': 'master', 'Master 2': 'master', Doctorat: 'phd', Autre: 'other',
};

/** A stable, warm tint per subject name, so "Chimie" always looks the same. */
const SUBJECT_TINTS = ['#C4553A', '#2E8B57', '#3A6EA5', '#8C6D46', '#B8860B', '#6B7F3A', '#9C4F7A', '#3F8E8C'];
export function subjectTint(name = '') {
  const key = name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SUBJECT_TINTS[h % SUBJECT_TINTS.length];
}
