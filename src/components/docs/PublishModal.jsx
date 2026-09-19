/**
 * PublishModal — put one of my documents in the public synthesis library.
 * --------------------------------------------------------------------------
 * Describes the document so students from other schools can find it:
 * title, subject, school, level, language, short description. Pre-filled
 * from the document (its subject in the Syntheses page) and from my profile
 * (school, study year). Suggestions come from what is already published, so
 * everyone converges on the same spelling of a school or subject.
 *
 * Publishing costs no storage (the file is not copied) and can be undone.
 *
 * Props: { user, doc, subjects, profile, pseudo, onClose, onChange(libraryOrNull) }
 */

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Globe, X, EyeOff } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { getLibraryFacets, publishToLibrary, unpublishFromLibrary } from '../../lib/docs';
import { Button } from '../ui';
import DocCover from './DocCover';
import { LIBRARY_LEVELS, LIBRARY_LANGUAGES, LEVEL_FROM_PROFILE_YEAR } from './docVisuals';
import { docErrorKey } from './docErrors';

const MAX_DESCRIPTION = 400;

export default function PublishModal({ user, doc, subjects, profile, pseudo, onClose, onChange }) {
  const { t, lang } = useTranslation();
  const lib = doc.library;
  const subjectName = subjects.find(s => String(s.id) === String(doc.subjectId))?.name || '';

  const [form, setForm] = useState({
    title: lib?.title || doc.name.replace(/\.[^.]+$/, ''),
    subject: lib?.subject || subjectName,
    school: lib?.school ?? profile?.school ?? '',
    level: lib?.level || LEVEL_FROM_PROFILE_YEAR[profile?.year] || '',
    language: lib?.language || (LIBRARY_LANGUAGES.some(l => l.code === lang) ? lang : ''),
    description: lib?.description || '',
    consent: Boolean(lib),
  });
  const [facets, setFacets] = useState({ schools: [], subjects: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  useEffect(() => {
    let alive = true;
    getLibraryFacets(user).then(data => { if (alive) setFacets(data); }).catch(() => {});
    return () => { alive = false; };
  }, [user]);

  async function submit(e) {
    e.preventDefault();
    if (form.subject.trim().length < 2) { setError('library.errSubject'); return; }
    if (!form.consent) { setError('library.errConsent'); return; }
    setBusy(true);
    setError('');
    try {
      const { doc: updated } = await publishToLibrary(user, doc.id, { ...form, pseudo });
      onChange(updated.library);
      onClose();
    } catch (err) {
      setError(docErrorKey(err.code));
      setBusy(false);
    }
  }

  async function unpublish() {
    setBusy(true);
    try {
      await unpublishFromLibrary(user, doc.id);
      onChange(null);
      onClose();
    } catch (err) {
      setError(docErrorKey(err.code));
      setBusy(false);
    }
  }

  const field = {
    width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 11, border: '1px solid var(--border)',
    background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.82rem', fontFamily: 'var(--font-family)',
  };
  const label = { display: 'block', fontSize: '.7rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      role="dialog" aria-modal="true" aria-label={t('library.publishTitle')}
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <motion.form onSubmit={submit} initial={{ y: 16, scale: .97 }} animate={{ y: 0, scale: 1 }} transition={{ duration: .22, ease: 'easeOut' }}
        style={{ width: 500, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14,
          background: 'var(--bg-modal)', borderRadius: 22, padding: '1.3rem', boxShadow: 'var(--card-shadow)' }}>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 64 }}><DocCover user={user} doc={doc} height={52} radius={10} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.98rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Globe size={16} color="var(--accent)" aria-hidden="true" />
              {lib ? t('library.editTitle') : t('library.publishTitle')}
            </div>
            <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>{t('library.publishHint')}</div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('docs.close')}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignSelf: 'flex-start' }}>
            <X size={18} />
          </button>
        </div>

        {lib?.hidden && (
          <div role="status" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 11px', borderRadius: 12,
            background: 'var(--bg-card)', color: 'var(--warning)', fontSize: '.72rem', lineHeight: 1.45 }}>
            <EyeOff size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />{t('library.hiddenNotice')}
          </div>
        )}

        <div>
          <label style={label} htmlFor="pub-title">{t('library.fieldTitle')}</label>
          <input id="pub-title" style={field} value={form.title} maxLength={120} onChange={e => set('title', e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <div>
            <label style={label} htmlFor="pub-subject">{t('library.fieldSubject')} *</label>
            <input id="pub-subject" style={field} value={form.subject} maxLength={60} list="pub-subjects"
              placeholder={t('library.subjectPlaceholder')} onChange={e => set('subject', e.target.value)} />
            <datalist id="pub-subjects">{facets.subjects.map(s => <option key={s.key} value={s.label} />)}</datalist>
          </div>
          <div>
            <label style={label} htmlFor="pub-school">{t('library.fieldSchool')}</label>
            <input id="pub-school" style={field} value={form.school} maxLength={100} list="pub-schools"
              placeholder={t('library.schoolPlaceholder')} onChange={e => set('school', e.target.value)} />
            <datalist id="pub-schools">{facets.schools.map(s => <option key={s.key} value={s.label} />)}</datalist>
          </div>
          <div>
            <label style={label} htmlFor="pub-level">{t('library.fieldLevel')}</label>
            <select id="pub-level" style={field} value={form.level} onChange={e => set('level', e.target.value)}>
              <option value="">{t('library.unspecified')}</option>
              {LIBRARY_LEVELS.map(code => <option key={code} value={code}>{t(`library.level_${code}`)}</option>)}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="pub-lang">{t('library.fieldLanguage')}</label>
            <select id="pub-lang" style={field} value={form.language} onChange={e => set('language', e.target.value)}>
              <option value="">{t('library.unspecified')}</option>
              {LIBRARY_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label || t(l.labelKey)}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label style={label} htmlFor="pub-desc">{t('library.fieldDescription')}</label>
          <textarea id="pub-desc" style={{ ...field, resize: 'vertical' }} rows={3} maxLength={MAX_DESCRIPTION}
            placeholder={t('library.descriptionPlaceholder')} value={form.description}
            onChange={e => set('description', e.target.value)} />
          <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', textAlign: 'right' }}>{form.description.length} / {MAX_DESCRIPTION}</div>
        </div>

        <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: '.74rem', color: 'var(--text-secondary)', lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.consent} onChange={e => set('consent', e.target.checked)}
            style={{ marginTop: 3, accentColor: 'var(--accent)' }} />
          <span>{t('library.consent', { name: pseudo })}</span>
        </label>

        {error && <div role="alert" style={{ fontSize: '.74rem', color: 'var(--danger)' }}>{t(error)}</div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {lib && (
            <Button type="button" variant="ghost" danger disabled={busy} onClick={unpublish} style={{ marginRight: 'auto' }}>
              {t('library.unpublish')}
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" icon={Globe} disabled={busy}>
            {busy ? '…' : lib ? t('library.update') : t('library.publish')}
          </Button>
        </div>
      </motion.form>
    </motion.div>
  );
}
