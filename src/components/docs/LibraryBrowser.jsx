/**
 * LibraryBrowser — the public synthesis library.
 * --------------------------------------------------------------------------
 * Every document a student chose to publish, searchable across schools:
 * full-text search (accent-insensitive), filters by school, subject, level
 * and language, newest / most liked, and personal favourites. Opening a
 * document uses the regular viewer; from there one can like, save or report
 * it. Admins get a moderation list of hidden (reported) documents.
 *
 * Data: worker `GET /library` (+ `/library/facets` for the filter chips).
 *
 * Props: { user, profile, onPublishOwn }  — onPublishOwn opens "my documents"
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, School, Heart, Bookmark, BookmarkCheck, Eye, Flag, Library, X, TrendingUp, Clock, ShieldAlert, EyeOff, Trash2, Check,
} from 'lucide-react';
import { useTranslation } from '../../i18n';
import { isAdmin } from '../../lib/admin';
import {
  searchLibrary, getLibraryFacets, likeLibraryDoc, saveLibraryDoc, reportLibraryDoc, moderateLibraryDoc,
} from '../../lib/docs';
import { Button, EmptyState } from '../ui';
import DocCover from './DocCover';
import DocViewer from './DocViewer';
import { LIBRARY_LEVELS, LIBRARY_LANGUAGES, subjectTint } from './docVisuals';
import { docErrorKey } from './docErrors';

const SEARCH_DEBOUNCE_MS = 300;
const REPORT_REASONS = ['inappropriate', 'copyright', 'spam', 'wrong', 'other'];

// ── Small pieces ─────────────────────────────────────────────────────────────

function Chip({ active, onClick, children, tint, title }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} title={title}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 99, flexShrink: 0,
        border: 'none', cursor: 'pointer', fontSize: '.74rem', fontWeight: active ? 700 : 500, whiteSpace: 'nowrap',
        background: active ? 'var(--accent-subtle)' : 'var(--bg-card)', color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        transition: 'background .15s, color .15s' }}>
      {tint && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: tint }} />}
      {children}
    </button>
  );
}

function IconToggle({ active, onClick, label, icon: Icon, activeIcon: ActiveIcon, count, color = 'var(--accent)', disabled }) {
  const Shown = active && ActiveIcon ? ActiveIcon : Icon;
  return (
    <motion.button type="button" whileTap={disabled ? {} : { scale: .85 }} onClick={onClick} disabled={disabled}
      aria-pressed={active} aria-label={label} title={label}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', padding: '3px 4px',
        borderRadius: 8, cursor: disabled ? 'default' : 'pointer', fontSize: '.68rem', fontWeight: 700,
        color: active ? color : 'var(--text-muted)', opacity: disabled ? .6 : 1 }}>
      <Shown size={14} fill={active && Icon === Heart ? 'currentColor' : 'none'} aria-hidden="true" />
      {count !== undefined && <span>{count}</span>}
    </motion.button>
  );
}

/** One published document. */
function LibraryCard({ user, doc, index, onOpen, onLike, onSave }) {
  const { t } = useTranslation();
  const lib = doc.library;
  const tint = subjectTint(lib.subject);
  return (
    <motion.article layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .96 }}
      transition={{ duration: .28, delay: Math.min(index, 12) * .03, ease: 'easeOut' }}
      style={{ display: 'flex', flexDirection: 'column', borderRadius: 20, overflow: 'hidden', background: 'var(--bg-card)', boxShadow: 'var(--card-shadow)' }}>
      <button type="button" onClick={() => onOpen(doc)} aria-label={t('docs.openNamed', { name: lib.title })}
        style={{ all: 'unset', cursor: 'pointer', display: 'block', position: 'relative' }}>
        <motion.div whileHover={{ scale: 1.03 }} transition={{ duration: .25 }}>
          <DocCover user={user} doc={doc} height={128} radius={0} />
        </motion.div>
        <span style={{ position: 'absolute', left: 10, bottom: 10, padding: '3px 9px', borderRadius: 99, fontSize: '.64rem', fontWeight: 800,
          background: tint, color: '#fff', maxWidth: 'calc(100% - 20px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,.25)' }}>
          {lib.subject}
        </span>
      </button>

      <div style={{ padding: '10px 12px 10px', display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
        <div title={lib.title} style={{ fontSize: '.84rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>
          {lib.title}
        </div>
        {lib.school && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.68rem', color: 'var(--text-secondary)', minWidth: 0 }}>
            <School size={12} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lib.school}</span>
          </div>
        )}
        <div style={{ fontSize: '.64rem', color: 'var(--text-muted)' }}>
          {[lib.level && t(`library.level_${lib.level}`), t('library.byAuthor', { name: lib.author })].filter(Boolean).join(' · ')}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 'auto', paddingTop: 4 }}>
          <IconToggle icon={Heart} active={doc.liked} count={lib.likes} color="#C4553A" disabled={doc.mine}
            label={doc.mine ? t('library.likesOwn') : t(doc.liked ? 'library.unlike' : 'library.like')} onClick={() => onLike(doc)} />
          <span title={t('library.views')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.68rem', color: 'var(--text-muted)', padding: '3px 4px' }}>
            <Eye size={14} aria-hidden="true" />{lib.views}
          </span>
          <span style={{ marginLeft: 'auto' }} />
          <IconToggle icon={Bookmark} activeIcon={BookmarkCheck} active={doc.saved}
            label={t(doc.saved ? 'library.unsave' : 'library.save')} onClick={() => onSave(doc)} />
        </div>
      </div>
    </motion.article>
  );
}

/** Asks why a document is reported, then sends it. */
function ReportDialog({ user, doc, onClose, onDone }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('inappropriate');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    setBusy(true);
    try { await reportLibraryDoc(user, doc.id, reason); onDone(); }
    catch (e) { setError(docErrorKey(e.code)); setBusy(false); }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      role="dialog" aria-modal="true" aria-label={t('library.reportTitle')}
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <motion.div initial={{ y: 12 }} animate={{ y: 0 }}
        style={{ width: 380, maxWidth: '100%', background: 'var(--bg-modal)', borderRadius: 20, padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Flag size={16} color="var(--danger)" aria-hidden="true" />{t('library.reportTitle')}
        </div>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{t('library.reportHint')}</div>
        <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {REPORT_REASONS.map(r => (
            <label key={r} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 9px', borderRadius: 10, cursor: 'pointer',
              background: reason === r ? 'var(--accent-subtle)' : 'transparent', fontSize: '.78rem', color: 'var(--text-secondary)' }}>
              <input type="radio" name="report-reason" checked={reason === r} onChange={() => setReason(r)} style={{ accentColor: 'var(--accent)' }} />
              {t(`library.reason_${r}`)}
            </label>
          ))}
        </div>
        {error && <div role="alert" style={{ fontSize: '.72rem', color: 'var(--danger)' }}>{t(error)}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" danger icon={Flag} disabled={busy} onClick={send}>{t('library.reportSend')}</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Browser ─────────────────────────────────────────────────────────────────
export default function LibraryBrowser({ user, profile, onPublishOwn }) {
  const { t, formatNumber } = useTranslation();
  const admin = isAdmin(user);

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [school, setSchool] = useState('');        // key
  const [subject, setSubject] = useState('');      // key
  const [level, setLevel] = useState('');
  const [language, setLanguage] = useState('');
  const [sort, setSort] = useState('recent');
  const [savedOnly, setSavedOnly] = useState(false);
  const [moderation, setModeration] = useState(false);

  const [results, setResults] = useState({ docs: [], hasMore: false, nextOffset: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [facets, setFacets] = useState({ schools: [], subjects: [], total: 0 });
  const [viewer, setViewer] = useState(null);
  const [reporting, setReporting] = useState(null);
  const [notice, setNotice] = useState('');
  const requestSeq = useRef(0);

  // Debounce the search box.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const params = useMemo(() => ({
    q: debounced, school, subject, level, language, sort, saved: savedOnly, moderation,
  }), [debounced, school, subject, level, language, sort, savedOnly, moderation]);

  // First page whenever the filters change. Late answers to old queries are ignored.
  useEffect(() => {
    const seq = ++requestSeq.current;
    searchLibrary(user, params)
      .then(data => { if (seq === requestSeq.current) { setResults(data); setError(''); } })
      .catch(e => { if (seq === requestSeq.current) setError(docErrorKey(e.code)); })
      .finally(() => { if (seq === requestSeq.current) setLoading(false); });
  }, [user, params]);

  // Filter chips, each narrowed by the other active filter.
  useEffect(() => {
    let alive = true;
    getLibraryFacets(user, { school, subject }).then(data => { if (alive) setFacets(data); }).catch(() => {});
    return () => { alive = false; };
  }, [user, school, subject]);

  async function loadMore() {
    setLoadingMore(true);
    const seq = requestSeq.current;
    try {
      const data = await searchLibrary(user, { ...params, offset: results.nextOffset });
      if (seq === requestSeq.current) {
        setResults(r => ({ docs: [...r.docs, ...data.docs], hasMore: data.hasMore, nextOffset: data.nextOffset }));
      }
    } catch (e) { setError(docErrorKey(e.code)); }
    setLoadingMore(false);
  }

  const patch = (id, fn) => setResults(r => ({ ...r, docs: r.docs.map(d => (d.id === id ? fn(d) : d)) }));
  const flash = key => { setNotice(key); setTimeout(() => setNotice(''), 2600); };

  async function toggleLike(doc) {
    if (doc.mine) return;
    const liked = !doc.liked;
    patch(doc.id, d => ({ ...d, liked, library: { ...d.library, likes: d.library.likes + (liked ? 1 : -1) } }));
    try {
      const res = await likeLibraryDoc(user, doc.id, liked);
      patch(doc.id, d => ({ ...d, liked: res.liked, library: { ...d.library, likes: res.likes } }));
    } catch {
      patch(doc.id, d => ({ ...d, liked: !liked, library: { ...d.library, likes: d.library.likes + (liked ? -1 : 1) } }));
    }
  }

  async function toggleSave(doc) {
    const saved = !doc.saved;
    patch(doc.id, d => ({ ...d, saved }));
    try { await saveLibraryDoc(user, doc.id, saved); }
    catch { patch(doc.id, d => ({ ...d, saved: !saved })); }
  }

  async function moderate(doc, action) {
    try {
      await moderateLibraryDoc(user, doc.id, action);
      setResults(r => ({ ...r, docs: r.docs.filter(d => d.id !== doc.id) }));
      setViewer(null);
      flash(`library.moderated_${action}`);
    } catch (e) { setError(docErrorKey(e.code)); }
  }

  const mySchool = profile?.school?.trim();
  const mySchoolFacet = mySchool && facets.schools.find(s => s.key === normalize(mySchool));
  const activeFilters = [school, subject, level, language].filter(Boolean).length + (savedOnly ? 1 : 0);
  const clearAll = () => { setSchool(''); setSubject(''); setLevel(''); setLanguage(''); setSavedOnly(false); setQuery(''); };

  // Viewer docs need a display name; the library title is the one people chose.
  const viewerDocs = results.docs.map(d => ({ ...d, name: d.library.title, sharedBy: d.library.author }));
  const select = {
    padding: '7px 10px', borderRadius: 99, border: 'none', background: 'var(--bg-card)', color: 'var(--text-secondary)',
    fontSize: '.74rem', fontFamily: 'var(--font-family)', cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Hero + search */}
      <div style={{ padding: '1.4rem 1.3rem 1.2rem', borderRadius: 24, boxShadow: 'var(--card-shadow)',
        background: 'linear-gradient(145deg, var(--accent-subtle), var(--bg-card) 70%)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-modal)', color: 'var(--accent)' }}>
            <Library size={22} aria-hidden="true" />
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('library.title')}</h2>
            <div style={{ fontSize: '.74rem', color: 'var(--text-muted)' }}>
              {t('library.subtitle', { count: facets.total })}
            </div>
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={17} color="var(--text-muted)" aria-hidden="true" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={query} onChange={e => setQuery(e.target.value)} type="search"
            placeholder={t('library.searchPlaceholder')} aria-label={t('library.searchPlaceholder')}
            style={{ width: '100%', boxSizing: 'border-box', padding: '12px 40px 12px 40px', borderRadius: 99, border: '1px solid var(--border)',
              background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.88rem', fontFamily: 'var(--font-family)' }} />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label={t('library.clearSearch')}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent',
                color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
              <X size={16} />
            </button>
          )}
        </div>
        {!mySchool && (
          <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>{t('library.profileSchoolHint')}</div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <div role="group" aria-label={t('library.sortLabel')} style={{ display: 'inline-flex', padding: 3, borderRadius: 99, background: 'var(--bg-card)' }}>
            {[{ v: 'recent', icon: Clock, l: t('library.sortRecent') }, { v: 'popular', icon: TrendingUp, l: t('library.sortPopular') }].map(o => (
              <button key={o.v} type="button" onClick={() => setSort(o.v)} aria-pressed={sort === o.v}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 99, border: 'none', cursor: 'pointer',
                  fontSize: '.72rem', fontWeight: 700, background: sort === o.v ? 'var(--accent-subtle)' : 'transparent',
                  color: sort === o.v ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                <o.icon size={13} aria-hidden="true" />{o.l}
              </button>
            ))}
          </div>
          <select aria-label={t('library.fieldLevel')} style={select} value={level} onChange={e => setLevel(e.target.value)}>
            <option value="">{t('library.allLevels')}</option>
            {LIBRARY_LEVELS.map(code => <option key={code} value={code}>{t(`library.level_${code}`)}</option>)}
          </select>
          <select aria-label={t('library.fieldLanguage')} style={select} value={language} onChange={e => setLanguage(e.target.value)}>
            <option value="">{t('library.allLanguages')}</option>
            {LIBRARY_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label || t(l.labelKey)}</option>)}
          </select>
          <Chip active={savedOnly} onClick={() => setSavedOnly(s => !s)}>
            <Bookmark size={13} aria-hidden="true" />{t('library.favourites')}
          </Chip>
          {admin && (
            <Chip active={moderation} onClick={() => setModeration(m => !m)}>
              <ShieldAlert size={13} aria-hidden="true" />{t('library.moderation')}
            </Chip>
          )}
          {activeFilters > 0 && (
            <button type="button" onClick={clearAll}
              style={{ border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer' }}>
              {t('library.clearFilters')}
            </button>
          )}
        </div>

        {/* Schools */}
        {(facets.schools.length > 0 || school) && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, alignItems: 'center' }} aria-label={t('library.fieldSchool')}>
            <School size={15} color="var(--text-muted)" aria-hidden="true" style={{ flexShrink: 0 }} />
            {mySchoolFacet && (
              <Chip active={school === mySchoolFacet.key} onClick={() => setSchool(s => (s === mySchoolFacet.key ? '' : mySchoolFacet.key))}>
                {t('library.mySchool')} <span style={{ opacity: .7, fontSize: '.64rem' }}>{mySchoolFacet.count}</span>
              </Chip>
            )}
            {facets.schools.filter(s => s.key !== mySchoolFacet?.key).map(s => (
              <Chip key={s.key} active={school === s.key} onClick={() => setSchool(cur => (cur === s.key ? '' : s.key))}>
                {s.label} <span style={{ opacity: .7, fontSize: '.64rem' }}>{s.count}</span>
              </Chip>
            ))}
          </div>
        )}

        {/* Subjects */}
        {facets.subjects.length > 0 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }} aria-label={t('library.fieldSubject')}>
            {facets.subjects.map(s => (
              <Chip key={s.key} tint={subjectTint(s.label)} active={subject === s.key}
                onClick={() => setSubject(cur => (cur === s.key ? '' : s.key))}>
                {s.label} <span style={{ opacity: .7, fontSize: '.64rem' }}>{s.count}</span>
              </Chip>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      {error && <div role="alert" style={{ fontSize: '.76rem', color: 'var(--danger)' }}>{t(error)}</div>}
      {loading ? (
        <motion.div animate={{ opacity: [.35, 1, .35] }} transition={{ duration: 1.4, repeat: Infinity }}
          style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontSize: '.85rem' }}>{t('common.loading')}</motion.div>
      ) : results.docs.length === 0 ? (
        <EmptyState icon={savedOnly ? Bookmark : Library}
          title={savedOnly ? t('library.emptySaved') : activeFilters || debounced ? t('library.emptyFiltered') : t('library.emptyTitle')}
          description={savedOnly ? t('library.emptySavedText') : t('library.emptyText')}
          action={!savedOnly && onPublishOwn
            ? <Button variant="primary" onClick={onPublishOwn}>{t('library.publishOwn')}</Button> : undefined} />
      ) : (
        <>
          <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>
            {t('library.resultCount', { count: results.docs.length })}{results.hasMore ? '+' : ''}
          </div>
          <motion.div layout style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
            <AnimatePresence>
              {results.docs.map((d, i) => (
                <LibraryCard key={d.id} user={user} doc={d} index={i}
                  onOpen={doc => setViewer(results.docs.findIndex(x => x.id === doc.id))}
                  onLike={toggleLike} onSave={toggleSave} />
              ))}
            </AnimatePresence>
          </motion.div>
          {results.hasMore && (
            <Button variant="secondary" disabled={loadingMore} onClick={loadMore} style={{ alignSelf: 'center' }}>
              {loadingMore ? t('common.loading') : t('library.loadMore')}
            </Button>
          )}
        </>
      )}

      <AnimatePresence>
        {notice && (
          <motion.div role="status" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1400, padding: '10px 16px',
              borderRadius: 99, background: 'var(--bg-modal)', color: 'var(--text-primary)', fontSize: '.78rem', fontWeight: 600,
              boxShadow: '0 10px 30px -10px rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Check size={15} color="var(--success)" aria-hidden="true" />{t(notice)}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewer !== null && viewerDocs[viewer] && (
          <DocViewer user={user} docs={viewerDocs} index={viewer} onIndexChange={setViewer} onClose={() => setViewer(null)}
            actions={doc => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {moderation ? (
                  <>
                    <Button size="sm" variant="secondary" icon={EyeOff} onClick={() => moderate(doc, 'unhide')}>{t('library.modRestore')}</Button>
                    <Button size="sm" variant="ghost" danger icon={Trash2} onClick={() => moderate(doc, 'remove')}>{t('library.modRemove')}</Button>
                  </>
                ) : (
                  <>
                    <IconToggle icon={Heart} active={doc.liked} count={formatNumber(doc.library.likes)} color="#C4553A" disabled={doc.mine}
                      label={doc.mine ? t('library.likesOwn') : t(doc.liked ? 'library.unlike' : 'library.like')} onClick={() => toggleLike(doc)} />
                    <IconToggle icon={Bookmark} activeIcon={BookmarkCheck} active={doc.saved}
                      label={t(doc.saved ? 'library.unsave' : 'library.save')} onClick={() => toggleSave(doc)} />
                    {!doc.mine && (
                      <IconToggle icon={Flag} active={false} label={t('library.report')} onClick={() => setReporting(doc)} />
                    )}
                    {admin && !doc.mine && (
                      <IconToggle icon={ShieldAlert} active={false} label={t('library.modHide')} onClick={() => moderate(doc, 'hide')} />
                    )}
                  </>
                )}
              </div>
            )} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reporting && (
          <ReportDialog user={user} doc={reporting} onClose={() => setReporting(null)}
            onDone={() => { setReporting(null); flash('library.reportThanks'); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Same normalization as the worker's filter keys. */
function normalize(s) {
  return String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
