/**
 * PageWhoarewe — "À propos" / About page
 * --------------------------------------------------------------------------
 * Public landing-style page: hero, social proof, creator profile, story,
 * user reviews (with public/private consent), Ko-fi support, socials, a
 * contact form, the feature list, and an admin-only inbox.
 *
 * Firestore:
 *   reviews          : public read (onSnapshot, newest first) + addDoc on submit
 *   contactMessages  : addDoc on submit; admin-only onSnapshot + updateDoc(handled)
 *
 * A review is shown publicly only when `consent === true`; otherwise it is
 * delivered privately to the creator (visible in the admin panel).
 *
 * Props: { user }
 */

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { db } from '../firebase/config';
import {
  collection, addDoc, onSnapshot, query, orderBy,
  doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { useTranslation } from '../i18n';
import { GuidedTour, useGuidedTour, TourButton } from '../components/GuidedTour';
import { reportSaveError } from '../lib/notify';

// Contact categories. `labelKey` resolves to a localized label; `id` is the
// stored value (stable).
const CONTACT_TYPES = [
  { id: 'suggestion', icon: '💡', labelKey: 'whoarewe.ctSuggestion' },
  { id: 'bug',        icon: '🐛', labelKey: 'whoarewe.ctBug' },
  { id: 'avis',       icon: '⭐', labelKey: 'whoarewe.ctReview' },
];

// Feature cards (label + description resolved via i18n).
const FEATURES = [
  { icon: '📅', labelKey: 'whoarewe.featPlanLabel',    descKey: 'whoarewe.featPlanDesc' },
  { icon: '✅', labelKey: 'whoarewe.featTodoLabel',    descKey: 'whoarewe.featTodoDesc' },
  { icon: '📈', labelKey: 'whoarewe.featProgLabel',    descKey: 'whoarewe.featProgDesc' },
  { icon: '⭐', labelKey: 'whoarewe.featConfLabel',    descKey: 'whoarewe.featConfDesc' },
  { icon: '📝', labelKey: 'whoarewe.featSynthLabel',   descKey: 'whoarewe.featSynthDesc' },
  { icon: '🃏', labelKey: 'whoarewe.featCardsLabel',   descKey: 'whoarewe.featCardsDesc' },
  { icon: '🔁', labelKey: 'whoarewe.featSrLabel',      descKey: 'whoarewe.featSrDesc' },
  { icon: '📆', labelKey: 'whoarewe.featExamLabel',    descKey: 'whoarewe.featExamDesc' },
  { icon: '📊', labelKey: 'whoarewe.featStatsLabel',   descKey: 'whoarewe.featStatsDesc' },
  { icon: '👥', labelKey: 'whoarewe.featGroupsLabel',  descKey: 'whoarewe.featGroupsDesc' },
  { icon: '📓', labelKey: 'whoarewe.featJournalLabel', descKey: 'whoarewe.featJournalDesc' },
  { icon: '⏱',  labelKey: 'whoarewe.featTimerLabel',   descKey: 'whoarewe.featTimerDesc' },
];

function StarRating({ value, onChange, size = 28 }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(s => (
        <motion.button key={s}
          whileHover={{ scale: 1.2 }} whileTap={{ scale: .9 }}
          onMouseEnter={() => setHovered(s)} onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(s)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: size + 'px', lineHeight: 1, padding: 0,
            filter: (hovered || value) >= s ? 'none' : 'grayscale(1) opacity(.3)',
            transition: 'filter .15s' }}>
          ⭐
        </motion.button>
      ))}
    </div>
  );
}

function ReviewCard({ review }) {
  const { t, formatDate } = useTranslation();
  const stars = review.rating || 0;
  const timeAgo = (() => {
    if (!review.createdAt) return '';
    const d = review.createdAt.toDate ? review.createdAt.toDate() : new Date(review.createdAt);
    const diff = (Date.now() - d) / 1000;
    if (diff < 60)    return t('whoarewe.timeNow');
    if (diff < 3600)  return t('whoarewe.timeMin', { count: Math.floor(diff / 60) });
    if (diff < 86400) return t('whoarewe.timeHour', { count: Math.floor(diff / 3600) });
    return formatDate(d, { day: 'numeric', month: 'short' });
  })();
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '1rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%',
            background: `hsl(${(review.name || 'A').charCodeAt(0) * 47 % 360},60%,50%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '.82rem', fontWeight: 700, color: '#fff' }}>
            {(review.name || '?')[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{review.name}</div>
            {review.school && <div style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>{review.school}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', gap: 1 }}>
            {[1, 2, 3, 4, 5].map(s => (
              <span key={s} style={{ fontSize: '.75rem', filter: stars >= s ? 'none' : 'grayscale(1) opacity(.25)' }}>⭐</span>
            ))}
          </div>
          <span style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>{timeAgo}</span>
        </div>
      </div>
      <div style={{ fontSize: '.8rem', color: 'var(--text-secondary)', lineHeight: 1.6, fontStyle: 'italic' }}>
        "{review.comment}"
      </div>
    </motion.div>
  );
}

const ADMIN_UID = 'VgHygV4pt5Qq7hL6yYQfXA0yql02';

export default function PageWhoarewe({ user }) {
  const { t, formatDate } = useTranslation();
  const tour = useGuidedTour('whoarewe');
  const isAdmin = user?.uid === ADMIN_UID;
  const [adminMessages, setAdminMessages] = useState([]);
  const [adminFilter, setAdminFilter] = useState('all'); // all | pending | handled
  const [contactType, setContactType] = useState('suggestion');
  const [name, setName]   = useState(user?.displayName?.split(' ')[0] || '');
  const [email, setEmail] = useState(user?.email || '');
  const [msg, setMsg]     = useState('');
  const [sent, setSent]   = useState(false);

  const [rating, setRating]               = useState(0);
  const [reviewName, setReviewName]       = useState(user?.displayName?.split(' ')[0] || '');
  const [reviewSchool, setReviewSchool]   = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewConsent, setReviewConsent] = useState(true);
  const [reviewSent, setReviewSent]       = useState(false);
  const [reviews, setReviews]             = useState([]);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [avgRating, setAvgRating]         = useState(0);
  const [sending, setSending]             = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setReviews(data);
      if (data.length > 0) {
        const avg = data.reduce((a, r) => a + (r.rating || 0), 0) / data.length;
        setAvgRating(Math.round(avg * 10) / 10);
      }
    });
    return unsub;
  }, []);

  // Contact messages — admin only.
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'contactMessages'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setAdminMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, e => console.error('Whoarewe — admin messages:', e));
    return unsub;
  }, [isAdmin]);

  async function toggleHandled(msgId, current) {
    try { await updateDoc(doc(db, 'contactMessages', msgId), { handled: !current }); }
    catch (e) { reportSaveError(e, 'Whoarewe — toggle handled'); }
  }

  async function handleSendReview() {
    if (!reviewComment.trim() || rating === 0) return;
    try {
      await addDoc(collection(db, 'reviews'), {
        name: reviewName.trim() || 'Anonyme',
        school: reviewSchool.trim(),
        comment: reviewComment.trim(),
        rating,
        consent: reviewConsent,
        uid: user?.uid || null,
        createdAt: serverTimestamp(),
      });
      setReviewSent(true);
      setReviewComment(''); setRating(0); setReviewConsent(true);
      setTimeout(() => setReviewSent(false), 4000);
    } catch (e) { reportSaveError(e, 'Whoarewe — send review'); }
  }

  async function handleSend() {
    if (!name.trim() || !msg.trim() || sending) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'contactMessages'), {
        type: contactType,
        name: name.trim(),
        email: email.trim() || null,
        message: msg.trim(),
        uid: user?.uid || null,
        createdAt: serverTimestamp(),
        handled: false,
      });
      setSent(true);
      setMsg('');
      setTimeout(() => setSent(false), 4000);
    } catch (e) {
      reportSaveError(e, 'Whoarewe — send message');
      alert(t('whoarewe.sendError'));
    }
    setSending(false);
  }

  const publicReviews = reviews.filter(r => r.consent === true);
  const displayedReviews = showAllReviews ? publicReviews : publicReviews.slice(0, 3);

  const inp = {
    width: '100%', padding: '8px', borderRadius: 8,
    border: '1px solid var(--border-strong)', background: 'var(--bg-input)',
    color: 'var(--text-primary)', fontSize: '.82rem',
    fontFamily: 'var(--font-family)', boxSizing: 'border-box',
  };
  const lbl = { fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 };

  const msgPlaceholder = contactType === 'bug' ? t('whoarewe.msgPlaceholderBug')
    : contactType === 'avis' ? t('whoarewe.msgPlaceholderReview')
    : t('whoarewe.msgPlaceholderSuggestion');

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20, fontFamily: 'var(--font-family)' }}>

      <TourButton onClick={tour.start} label={t('common.guidedTour')} />

      {/* ── Hero ── */}
      <motion.div data-tour="tour-about-intro" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        style={{ textAlign: 'center', padding: '3rem 2rem',
          background: 'linear-gradient(135deg,var(--accent-subtle),rgba(155,89,182,.08))',
          border: '1px solid var(--border)', borderRadius: 24, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)',
          width: 280, height: 280, background: 'var(--accent)', opacity: .06, filter: 'blur(70px)',
          borderRadius: '50%', pointerEvents: 'none' }} />

        <div style={{ fontSize: 'clamp(2rem,5vw,3.2rem)', fontWeight: 900, color: 'var(--text-primary)',
          letterSpacing: '-.03em', marginBottom: 12, lineHeight: 1.1, position: 'relative' }}>
          {t('whoarewe.heroTitle1')}<br />{t('whoarewe.heroTitle2')}
        </div>
        <div style={{ fontSize: '1.02rem', color: 'var(--text-secondary)', maxWidth: 480,
          margin: '0 auto 18px', lineHeight: 1.6, position: 'relative' }}>
          {t('whoarewe.heroSubtitle')}
        </div>

        {/* Social proof */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap', position: 'relative' }}>
          {reviews.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '7px 14px' }}>
              <div style={{ display: 'flex', gap: 2 }}>
                {[1, 2, 3, 4, 5].map(s => (
                  <span key={s} style={{ fontSize: '.95rem', filter: avgRating >= s ? 'none' : 'grayscale(1) opacity(.3)' }}>⭐</span>
                ))}
              </div>
              <span style={{ fontSize: '.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>{avgRating}</span>
              <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>· {t('whoarewe.reviewCount', { count: reviews.length })}</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 20, padding: '7px 14px', fontSize: '.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            🎓 {t('whoarewe.freeForever')}
          </div>
        </div>

        <div style={{ fontSize: '.82rem', color: 'var(--accent)', fontStyle: 'italic', fontWeight: 600, marginTop: 18, position: 'relative' }}>
          {t('whoarewe.quote')}
        </div>
      </motion.div>

      {/* ── Admin panel (admin only) ── */}
      {isAdmin && (() => {
        const pending = adminMessages.filter(m => !m.handled);
        const filtered = adminFilter === 'all' ? adminMessages
          : adminFilter === 'pending' ? adminMessages.filter(m => !m.handled)
          : adminMessages.filter(m => m.handled);
        const typeInfo = { suggestion: { i: '💡', c: '#F1C40F' }, bug: { i: '🐛', c: '#E74C3C' }, avis: { i: '⭐', c: '#9B59B6' } };
        return (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--accent)', borderRadius: 16, padding: '1.4rem',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ fontSize: '.9rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                🛠️ {t('whoarewe.adminTitle')}
                {pending.length > 0 && (
                  <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 10,
                    background: 'rgba(231,76,60,.15)', color: '#E74C3C', fontSize: '.7rem', fontWeight: 700 }}>
                    {t('whoarewe.toHandle', { count: pending.length })}
                  </span>
                )}
              </h2>
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card-hover)', padding: 3, borderRadius: 9 }}>
                {[{ v: 'all', l: t('whoarewe.filterAll') }, { v: 'pending', l: t('whoarewe.filterPending') }, { v: 'handled', l: t('whoarewe.filterHandled') }].map(f => (
                  <button key={f.v} onClick={() => setAdminFilter(f.v)}
                    style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '.72rem',
                      background: adminFilter === f.v ? 'var(--accent-subtle)' : 'transparent',
                      color: adminFilter === f.v ? 'var(--accent)' : 'var(--text-muted)', fontWeight: adminFilter === f.v ? 700 : 400 }}>
                    {f.l}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '.82rem' }}>
                {adminFilter === 'pending' ? t('whoarewe.noMsgPending') : adminFilter === 'handled' ? t('whoarewe.noMsgHandled') : t('whoarewe.noMsgAll')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                {filtered.map(m => {
                  const ti = typeInfo[m.type] || { i: '📩', c: 'var(--accent)' };
                  const date = m.createdAt?.toDate ? m.createdAt.toDate() : null;
                  return (
                    <div key={m.id} style={{ padding: '10px 12px', borderRadius: 10,
                      background: m.handled ? 'var(--bg-card-hover)' : 'var(--bg-base)',
                      border: `1px solid ${m.handled ? 'var(--border)' : ti.c + '40'}`,
                      opacity: m.handled ? .6 : 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '.95rem' }}>{ti.i}</span>
                        <span style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{m.name}</span>
                        {m.email && (
                          <a href={`mailto:${m.email}`} style={{ fontSize: '.68rem', color: 'var(--accent)', textDecoration: 'none' }}>
                            {m.email}
                          </a>
                        )}
                        {date && (
                          <span style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                            {formatDate(date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {m.message}
                      </div>
                      <button onClick={() => toggleHandled(m.id, m.handled)}
                        style={{ alignSelf: 'flex-start', padding: '4px 12px', borderRadius: 7, cursor: 'pointer',
                          border: `1px solid ${m.handled ? 'var(--border)' : 'rgba(39,174,96,.3)'}`,
                          background: m.handled ? 'transparent' : 'rgba(39,174,96,.1)',
                          color: m.handled ? 'var(--text-muted)' : '#27AE60', fontSize: '.7rem', fontWeight: 600 }}>
                        {m.handled ? `↩ ${t('whoarewe.reopen')}` : `✓ ${t('whoarewe.markHandled')}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Reviews received */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
              <h3 style={{ fontSize: '.85rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                ⭐ {t('whoarewe.reviewsReceived')} ({reviews.length})
                <span style={{ marginLeft: 8, fontSize: '.68rem', fontWeight: 500, color: 'var(--text-muted)' }}>
                  · {t('whoarewe.publicCount', { count: reviews.filter(r => r.consent === true).length })}
                </span>
              </h3>
              {reviews.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '.8rem' }}>
                  {t('whoarewe.noReviewsAdmin')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                  {reviews.map(r => {
                    const date = r.createdAt?.toDate ? r.createdAt.toDate() : null;
                    const isPublic = r.consent === true;
                    return (
                      <div key={r.id} style={{ padding: '10px 12px', borderRadius: 10,
                        background: 'var(--bg-base)', border: '1px solid var(--border)',
                        display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{r.name}</span>
                          {r.school && <span style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>· {r.school}</span>}
                          <span style={{ fontSize: '.72rem', color: '#F1C40F' }}>
                            {'★'.repeat(r.rating || 0)}{'☆'.repeat(5 - (r.rating || 0))}
                          </span>
                          <span style={{ marginLeft: 'auto', fontSize: '.6rem', fontWeight: 700, padding: '2px 7px', borderRadius: 8,
                            background: isPublic ? 'rgba(39,174,96,.15)' : 'rgba(231,76,60,.12)',
                            color: isPublic ? '#27AE60' : '#E74C3C' }}>
                            {isPublic ? `🌐 ${t('whoarewe.pub')}` : `🔒 ${t('whoarewe.priv')}`}
                          </span>
                        </div>
                        <div style={{ fontSize: '.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, fontStyle: 'italic' }}>
                          "{r.comment}"
                        </div>
                        {date && (
                          <span style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>
                            {formatDate(date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        );
      })()}

      {/* ── Creator profile ── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 }}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.6rem',
          display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -50, left: -30, width: 160, height: 160,
          background: 'var(--accent)', opacity: .05, filter: 'blur(50px)', borderRadius: '50%', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%',
            background: 'linear-gradient(135deg,var(--accent),#9B59B6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.6rem', fontWeight: 900, color: '#fff',
            boxShadow: '0 0 24px var(--accent-glow), 0 4px 16px rgba(0,0,0,.2)',
            border: '2px solid rgba(255,255,255,.1)' }}>
            BL
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 3 }}>Bastien Leprince</div>
          <div style={{ fontSize: '.78rem', color: 'var(--text-secondary)', marginBottom: 4 }}>{t('whoarewe.creatorDesc')}</div>
          <div style={{ fontSize: '.74rem', color: 'var(--text-muted)', marginBottom: 12 }}>{t('whoarewe.engineerLine')}</div>

          {/* Social links */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a href="https://www.tiktok.com/@blokly.study" target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9,
                background: 'var(--bg-card-hover)', border: '1px solid var(--border)', textDecoration: 'none',
                color: 'var(--text-secondary)', fontSize: '.74rem', fontWeight: 600 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z" />
              </svg>
              TikTok
            </a>
            <a href="https://www.instagram.com/bastien._lp" target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9,
                background: 'var(--bg-card-hover)', border: '1px solid var(--border)', textDecoration: 'none',
                color: 'var(--text-secondary)', fontSize: '.74rem', fontWeight: 600 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
              </svg>
              Instagram
            </a>
          </div>
        </div>
      </motion.div>

      {/* ── Story cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
        {[
          { icon: '💡', title: t('whoarewe.storyOriginTitle'),   text: t('whoarewe.storyOriginText') },
          { icon: '🛠️', title: t('whoarewe.storyCreationTitle'), text: t('whoarewe.storyCreationText') },
        ].map((c, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15 + i * .08 }}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.4rem' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>{c.icon}</div>
            <div style={{ fontSize: '.88rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{c.title}</div>
            <div style={{ fontSize: '.78rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>{c.text}</div>
          </motion.div>
        ))}
      </div>

      {/* ── User reviews ── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .25 }}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            💬 {t('whoarewe.reviewsTitle')}
          </h2>
          {reviews.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '1rem', fontWeight: 900, color: '#F1C40F' }}>{avgRating}</span>
              <span style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>/ 5 · {t('whoarewe.reviewCount', { count: reviews.length })}</span>
            </div>
          )}
        </div>

        {/* Review form — first */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>✍️ {t('whoarewe.leaveReview')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={lbl}>{t('whoarewe.yourRating')} *</label>
            <StarRating value={rating} onChange={setRating} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>{t('whoarewe.yourName')}</label>
              <input value={reviewName} onChange={e => setReviewName(e.target.value)} placeholder={t('whoarewe.namePlaceholder')} style={inp} />
            </div>
            <div>
              <label style={lbl}>{t('whoarewe.schoolLabel')}</label>
              <input value={reviewSchool} onChange={e => setReviewSchool(e.target.value)} placeholder={t('whoarewe.schoolPlaceholder')} style={inp} />
            </div>
          </div>
          <div>
            <label style={lbl}>{t('whoarewe.yourComment')} *</label>
            <textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)} rows={3}
              placeholder={t('whoarewe.commentPlaceholder')} style={{ ...inp, resize: 'vertical' }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
            padding: '8px 10px', borderRadius: 8, background: 'var(--bg-card-hover)', border: '1px solid var(--border)' }}>
            <input type="checkbox" checked={reviewConsent} onChange={e => setReviewConsent(e.target.checked)}
              style={{ marginTop: 2, accentColor: 'var(--accent)', cursor: 'pointer' }} />
            <span style={{ fontSize: '.72rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {t('whoarewe.consentText')}
              {!reviewConsent && <span style={{ display: 'block', color: 'var(--text-muted)', marginTop: 2 }}>
                {t('whoarewe.consentPrivate')}
              </span>}
            </span>
          </label>
          {reviewSent ? (
            <motion.div initial={{ scale: .9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              style={{ padding: '10px', borderRadius: 10, background: 'rgba(39,174,96,.15)',
                border: '1px solid rgba(39,174,96,.3)', color: '#27AE60', fontSize: '.82rem', textAlign: 'center', fontWeight: 600 }}>
              {t('whoarewe.reviewThanks')}
            </motion.div>
          ) : (
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: .98 }}
              onClick={handleSendReview} disabled={!reviewComment.trim() || rating === 0}
              style={{ padding: '10px', borderRadius: 10, border: 'none',
                background: reviewComment.trim() && rating > 0 ? 'linear-gradient(135deg,#F1C40F,#E67E22)' : 'var(--bg-card-hover)',
                color: reviewComment.trim() && rating > 0 ? '#fff' : 'var(--text-muted)',
                fontSize: '.82rem', fontWeight: 700, cursor: reviewComment.trim() && rating > 0 ? 'pointer' : 'default' }}>
              ⭐ {t('whoarewe.publishReview')}
            </motion.button>
          )}
        </div>

        {/* Public reviews list — after the form */}
        {publicReviews.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '.82rem',
            borderTop: '1px solid var(--border)', marginTop: 4 }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>💬</div>
            {t('whoarewe.beFirst')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16,
            borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            {displayedReviews.map(r => <ReviewCard key={r.id} review={r} />)}
            {publicReviews.length > 3 && (
              <button onClick={() => setShowAllReviews(s => !s)}
                style={{ width: '100%', padding: '8px', borderRadius: 10, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text-muted)', fontSize: '.78rem', cursor: 'pointer' }}>
                {showAllReviews ? `▲ ${t('whoarewe.collapse')}` : `▼ ${t('whoarewe.seeAllReviews', { count: publicReviews.length })}`}
              </button>
            )}
          </div>
        )}
      </motion.div>

      {/* ── Ko-fi ── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .3 }}
        style={{ background: 'linear-gradient(135deg,rgba(255,193,7,.08),rgba(255,94,91,.08))',
          border: '1px solid rgba(255,193,7,.2)', borderRadius: 18, padding: '2rem', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
          width: 180, height: 180, background: 'rgba(255,193,7,.08)', borderRadius: '50%', filter: 'blur(40px)', pointerEvents: 'none' }} />
        <div style={{ fontSize: '2rem', marginBottom: 10 }}>☕</div>
        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>{t('whoarewe.supportTitle')}</div>
        <p style={{ fontSize: '.83rem', color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 520, margin: '0 auto 16px' }}>
          {t('whoarewe.supportText')}
          <br /><br />
          {t('whoarewe.supportText2')}
        </p>
        <a href="https://ko-fi.com/bloklystudy" target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 28px',
            background: '#FF5E5B', borderRadius: 12, color: '#fff', fontSize: '.9rem', fontWeight: 700,
            textDecoration: 'none', boxShadow: '0 4px 20px rgba(255,94,91,.35)' }}>
          ☕ {t('whoarewe.donateKofi')}
        </a>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 10 }}>
          {t('whoarewe.everyDonation')}
        </div>
      </motion.div>

      {/* ── Socials ── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .35 }}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.4rem',
          display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>🔗 {t('whoarewe.findBlokly')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }}>
          <motion.a whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: .97 }}
            href="https://www.tiktok.com/@blokly.study" target="_blank" rel="noopener noreferrer"
            style={{ padding: '12px', borderRadius: 12, background: '#000',
              border: '1px solid rgba(255,255,255,.15)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 8, textDecoration: 'none', color: '#fff', fontSize: '.82rem', fontWeight: 700 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z" />
            </svg>
            TikTok
          </motion.a>

          <motion.a whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: .97 }}
            href="https://www.instagram.com/bastien._lp" target="_blank" rel="noopener noreferrer"
            style={{ padding: '12px', borderRadius: 12,
              background: 'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)',
              border: '1px solid transparent', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 8, textDecoration: 'none', color: '#fff', fontSize: '.82rem', fontWeight: 700 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
            </svg>
            Instagram
          </motion.a>

          <motion.a whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: .97 }}
            href="#" onClick={e => {
              e.preventDefault();
              if (navigator.share) navigator.share({ title: 'Blokly Study', text: t('whoarewe.shareText'), url: 'https://bastien-lp.github.io/BloklyStudy/' });
              else navigator.clipboard.writeText('https://bastien-lp.github.io/BloklyStudy/');
            }}
            style={{ padding: '12px', borderRadius: 12, background: 'var(--accent-subtle)',
              border: '1px solid var(--accent)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 8, textDecoration: 'none', color: 'var(--accent)', fontSize: '.82rem', fontWeight: 700 }}>
            🔗 {t('whoarewe.shareBtn')}
          </motion.a>
        </div>
      </motion.div>

      {/* ── Contact ── */}
      <motion.div data-tour="tour-about-contact" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .4 }}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.4rem' }}>
        <h2 style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>📬 {t('whoarewe.contactTitle')}</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {CONTACT_TYPES.map(ct => (
            <button key={ct.id} onClick={() => setContactType(ct.id)}
              style={{ flex: 1, padding: '7px', borderRadius: 10,
                border: `1px solid ${contactType === ct.id ? 'var(--accent)' : 'var(--border)'}`,
                background: contactType === ct.id ? 'var(--accent-subtle)' : 'transparent',
                color: contactType === ct.id ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: '.75rem', fontWeight: contactType === ct.id ? 600 : 400, cursor: 'pointer' }}>
              {ct.icon} {t(ct.labelKey)}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>{t('whoarewe.yourName')} *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder={t('whoarewe.namePlaceholder2')} style={inp} />
            </div>
            <div>
              <label style={lbl}>{t('whoarewe.emailOptional')}</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" style={inp} />
            </div>
          </div>
          <div>
            <label style={lbl}>{t('whoarewe.yourMessage')} *</label>
            <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={4}
              placeholder={msgPlaceholder} style={{ ...inp, resize: 'vertical' }} />
          </div>
          {sent ? (
            <motion.div initial={{ scale: .9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              style={{ padding: '10px', borderRadius: 10, background: 'rgba(39,174,96,.15)',
                border: '1px solid rgba(39,174,96,.3)', color: '#27AE60', fontSize: '.82rem', textAlign: 'center', fontWeight: 600 }}>
              {t('whoarewe.msgSent', { name })}
            </motion.div>
          ) : (
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: .98 }}
              onClick={handleSend} disabled={!name.trim() || !msg.trim() || sending}
              style={{ padding: '10px', borderRadius: 10, border: 'none',
                background: name.trim() && msg.trim() ? 'linear-gradient(135deg,var(--accent),#6366f1)' : 'var(--bg-card-hover)',
                color: name.trim() && msg.trim() ? '#fff' : 'var(--text-muted)',
                fontSize: '.82rem', fontWeight: 700, cursor: name.trim() && msg.trim() && !sending ? 'pointer' : 'default' }}>
              {sending ? t('whoarewe.sending') : t('whoarewe.send')}
            </motion.button>
          )}
          <div style={{ textAlign: 'center', fontSize: '.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
            {t('whoarewe.orWriteTo')}{' '}
            <a href="mailto:bloklystudy@gmail.com" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
              bloklystudy@gmail.com
            </a>
          </div>
        </div>
      </motion.div>

      {/* ── Features (reference list, at the bottom) ── */}
      <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: .5 }}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.4rem' }}>
        <h2 style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>✨ {t('whoarewe.featuresTitle')}</h2>
        <p style={{ fontSize: '.74rem', color: 'var(--text-muted)', margin: '0 0 14px' }}>{t('whoarewe.featuresSubtitle')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8 }}>
          {FEATURES.map((f, i) => (
            <motion.div key={i} whileHover={{ scale: 1.03, y: -2 }}
              style={{ padding: '10px 12px', borderRadius: 10,
                background: 'var(--bg-card-hover)', border: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: '1.1rem' }}>{f.icon}</span>
              <span style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t(f.labelKey)}</span>
              <span style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>{t(f.descKey)}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ── Footer ── */}
      <div style={{ textAlign: 'center', fontSize: '.68rem', color: 'var(--text-muted)', padding: '8px' }}>
        {t('whoarewe.footerLine')}<br />
        <span style={{ color: 'var(--text-muted)', opacity: .6 }}>{t('whoarewe.footerMade')}</span>
      </div>

      <GuidedTour active={tour.active} step={tour.step} steps={tour.steps}
        onNext={tour.next} onPrev={tour.prev} onStop={tour.stop} />
    </div>
  );
}