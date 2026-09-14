/**
 * PageGroups — Messaging hub: study groups + private DMs in one list.
 * --------------------------------------------------------------------------
 * Groups live in `groups/{id}` (with a `messages` subcollection); DMs live in
 * `privateMessages/{convId}/messages` where convId = sorted "uidA_uidB".
 * Presence is in RTDB (`presence`, `groupPresence`, `privateTyping`). The main
 * screen merges groups and DM conversations into one activity-sorted list with
 * tabs (all / groups / private), search, join-by-code and group creation.
 *
 * Props: { user, unreadByGroup, onMarkRead, pendingConv, onConvOpened }
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db, rtdb } from '../firebase/config';
import { ref as dbRef, onValue, set, remove, onDisconnect } from 'firebase/database';
import { Square } from 'lucide-react';
import UserProfileModal from '../components/UserProfileModal';
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, addDoc,
  onSnapshot, query, orderBy, limit, limitToLast, where, updateDoc, arrayUnion, arrayRemove, deleteField,
} from 'firebase/firestore';
import { useTranslation } from '../i18n';
import { GuidedTour, useGuidedTour, TourButton } from '../components/GuidedTour';
import { reportSaveError, notify } from '../lib/notify';
import {
  createSession, joinSession, pauseSession, resumeSession, skipPhase,
  endSession, clearSession, subscribeSession, subscribeParticipants, phaseAt, sessionEndMs, startSession,
} from '../lib/groupSession';
import { startServerClock, serverNow } from '../lib/serverClock';
import { setMembership } from '../focus/groupFocus';
import { useGroupSession, useLiveGroupSessions } from '../focus/useGroupSession';
import { bankMyGroupSession } from '../lib/groupSessionBank';
import { GroupSessionBar, SessionFullscreen, NewSessionModal } from '../components/GroupSessionPanel';
import { ShareDeckModal, DeckBubble, ImportDeckModal } from '../components/FlashcardShare';
import { cardKey, MAX_DECK_CARDS } from '../lib/flashcardDeck';

function generateCode() {
  return 'BLK-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

// Deterministic convId: always the same for a pair of users.
// Firestore rules expect the format uidA_uidB.
function convIdFor(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

function Avatar({ name, size = 32, color, online = false, photoURL = null }) {
  const bg = color || '#4A90D9';
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {photoURL ? (
        <img src={photoURL} alt={name}
          style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${bg}40` }} />
      ) : (
        <div style={{ width: size, height: size, borderRadius: '50%', background: bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * .38 + 'px', fontWeight: 700, color: '#fff' }}>
          {(name || '?')[0].toUpperCase()}
        </div>
      )}
      {online && (
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: size * .28, height: size * .28,
          borderRadius: '50%', background: '#27AE60', border: `${size * .06}px solid var(--bg-base)` }} />
      )}
    </div>
  );
}

// Relative time for conversation previews. `t`/`formatDate` come from the caller.
function formatTime(iso, t, formatDate) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (new Date() - d) / 1000;
  if (diff < 60)    return t('groups.justNow');
  if (diff < 3600)  return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return formatDate(d, { hour: '2-digit', minute: '2-digit' });
  return formatDate(d, { day: 'numeric', month: 'short' });
}

function formatFullTime(iso, formatDate) {
  if (!iso) return '';
  return formatDate(iso, { hour: '2-digit', minute: '2-digit' });
}

const REACTIONS = ['👍', '❤️', '😂', '🔥', '💪', '✅'];

// One-line label for a message, used in reply/pin previews where the full rich
// card would be too big. Falls back to a type label for non-text messages.
function messagePreview(msg, t) {
  if (!msg) return '';
  if (msg.type === 'poll')      return `📊 ${msg.question || t('groups.poll')}`;
  if (msg.type === 'focus')     return `⏱ ${t('groups.focusShared')}`;
  if (msg.type === 'sessionEnd') return t('groups.sessionEndedPreview');
  if (msg.type === 'deck')      return t('groups.deckPreview');
  if (msg.type === 'flashcard') return `🃏 ${msg.question || t('groups.flashcard')}`;
  if (msg.type === 'link')      return `🔗 ${msg.title || msg.url || t('groups.link')}`;
  return msg.text || '';
}

// Split text on @mentions of known member pseudos and render them highlighted.
// `memberNames` is the set of pseudos present in the group (case-insensitive).
function renderMessageText(text, memberNames) {
  if (!text) return null;
  if (!memberNames || memberNames.size === 0) return text;
  // Match "@" followed by a run of word chars (mentions are single-token pseudos).
  const parts = text.split(/(@[\wÀ-ÿ'-]+)/g);
  return parts.map((part, i) => {
    if (part[0] === '@' && memberNames.has(part.slice(1).toLowerCase())) {
      return <span key={i} style={{ color: 'var(--accent)', fontWeight: 700 }}>{part}</span>;
    }
    return part;
  });
}

function MessageBubble({ msg, isMe, showAvatar, showTime, onReact, onDelete, onViewUser, onVote, onSaveCard, onJoinFocus, myUid,
                        onReply, onEdit, onPin, onJumpTo, memberNames, mentionsMe }) {
  const { t, formatDate } = useTranslation();
  const [showReactions, setShowReactions] = useState(false);
  const longPressRef = useRef(null);
  const closeRef = useRef(null);
  const memberColor = `hsl(${((msg.uid || '').charCodeAt(0) * 47 || 0) % 360},60%,50%)`;

  // Long press (mobile) to open the reaction menu.
  function startLongPress() {
    clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(() => setShowReactions(true), 450);
  }
  function cancelLongPress() {
    clearTimeout(longPressRef.current);
  }

  // Open immediately, but close on a short delay so the mouse can travel across
  // the small gap into the reaction popover without it disappearing first.
  function openReactions() { clearTimeout(closeRef.current); setShowReactions(true); }
  function closeReactionsSoon() { clearTimeout(closeRef.current); closeRef.current = setTimeout(() => setShowReactions(false), 180); }

  // Handles both reaction formats:
  // - new: { uid: emoji }
  // - old: { emoji: [uid, uid, ...] }
  const reactionCounts = {};
  if (msg.reactions) {
    for (const [key, val] of Object.entries(msg.reactions)) {
      if (Array.isArray(val)) {
        reactionCounts[key] = (reactionCounts[key] || 0) + val.length;
      } else if (typeof val === 'string') {
        reactionCounts[val] = (reactionCounts[val] || 0) + 1;
      }
    }
  }

  return (
    <div id={`msg-${msg.id}`} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', gap: 2, marginBottom: 2, scrollMarginTop: 70 }}>
      {showAvatar && !isMe && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 36 }}>
          <span onClick={() => onViewUser && onViewUser({ uid: msg.uid, pseudo: msg.pseudo })}
            style={{ fontSize: '.62rem', color: 'var(--text-muted)', fontWeight: 500, cursor: onViewUser ? 'pointer' : 'default' }}>
            {msg.pseudo}
          </span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexDirection: isMe ? 'row-reverse' : 'row' }}>
        {showAvatar && !isMe ? (
          <div onClick={() => onViewUser && onViewUser({ uid: msg.uid, pseudo: msg.pseudo })}
            style={{ cursor: onViewUser ? 'pointer' : 'default' }}>
            <Avatar name={msg.pseudo} size={28} color={memberColor} />
          </div>
        ) : !isMe && <div style={{ width: 28 }} />}

        <div style={{ position: 'relative', maxWidth: 'min(680px, 82%)', minWidth: 0, wordBreak: 'break-word', overflowWrap: 'anywhere' }}
          onMouseEnter={openReactions}
          onMouseLeave={closeReactionsSoon}
          onTouchStart={startLongPress}
          onTouchEnd={cancelLongPress}
          onTouchMove={cancelLongPress}>

          <AnimatePresence>
            {showReactions && (
              <>
                {/* Touch-close zone (mobile) */}
                <div onClick={() => setShowReactions(false)} onTouchStart={() => setShowReactions(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
                <motion.div initial={{ opacity: 0, scale: .8, y: 4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .8 }}
                  onMouseEnter={openReactions} onMouseLeave={closeReactionsSoon}
                  style={{ position: 'absolute', bottom: '100%', [isMe ? 'right' : 'left']: 0,
                    display: 'flex', gap: 3, background: 'var(--bg-modal)', backdropFilter: 'blur(10px)',
                    border: '1px solid var(--border)', borderRadius: 20, padding: '4px 6px', marginBottom: 6, zIndex: 10,
                    boxShadow: 'var(--card-shadow)', whiteSpace: 'nowrap' }}>
                  {REACTIONS.map(r => (
                    <button key={r} onClick={() => { onReact(msg.id, r); setShowReactions(false); }}
                      style={{ background: 'transparent', border: 'none', fontSize: '1.15rem', cursor: 'pointer', padding: '4px 5px', borderRadius: 6, transition: 'transform .1s' }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.3)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                      {r}
                    </button>
                  ))}
                  {(onReply || onPin || (isMe && (onEdit || onDelete))) && (
                    <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', margin: '2px 2px' }} />
                  )}
                  {onReply && (
                    <button onClick={() => { onReply(msg); setShowReactions(false); }}
                      style={{ background: 'transparent', border: 'none', fontSize: '1.02rem', cursor: 'pointer', padding: '4px 5px', borderRadius: 6 }}
                      title={t('groups.reply')}>↩</button>
                  )}
                  {onPin && (
                    <button onClick={() => { onPin(msg); setShowReactions(false); }}
                      style={{ background: 'transparent', border: 'none', fontSize: '1.02rem', cursor: 'pointer', padding: '4px 5px', borderRadius: 6 }}
                      title={t('groups.pin')}>📌</button>
                  )}
                  {isMe && onEdit && (msg.type === undefined || msg.type === 'text') && (
                    <button onClick={() => { onEdit(msg); setShowReactions(false); }}
                      style={{ background: 'transparent', border: 'none', fontSize: '1.02rem', cursor: 'pointer', padding: '4px 5px', borderRadius: 6 }}
                      title={t('common.edit')}>✏️</button>
                  )}
                  {isMe && onDelete && (
                    <button onClick={() => { onDelete(msg.id); setShowReactions(false); }}
                      style={{ background: 'transparent', border: 'none', fontSize: '1.02rem', cursor: 'pointer', padding: '4px 5px', borderRadius: 6 }}
                      title={t('groups.delete')}>🗑</button>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {(() => {
            // Rich cards (poll/focus/flashcard) keep a neutral surface so their
            // inner content stays legible; only plain text uses the accent tint.
            const isRich = msg.type === 'poll' || msg.type === 'focus' || msg.type === 'flashcard'
              || msg.type === 'deck' || msg.type === 'link';
            const bubbleBg = isRich ? 'var(--bg-card)' : isMe ? 'var(--accent)' : 'var(--bg-card-hover)';
            const bubbleColor = isRich ? 'var(--text-primary)' : isMe ? 'var(--on-accent, #fff)' : 'var(--text-primary)';
            return (
              <div style={{ padding: '9px 13px', lineHeight: 1.5, wordBreak: 'break-word',
                borderRadius: isMe ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                background: bubbleBg, color: bubbleColor, fontSize: '.86rem', minWidth: 0,
                border: mentionsMe ? '1px solid var(--accent)' : isRich ? '1px solid var(--border)' : 'none',
                boxShadow: mentionsMe ? '0 0 0 1px var(--accent) inset' : 'none',
                WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}>
                {/* Reply quote */}
                {msg.replyTo && (
                  <div onClick={() => onJumpTo && onJumpTo(msg.replyTo.id)}
                    style={{ marginBottom: 5, padding: '4px 8px', borderLeft: '3px solid var(--accent)', borderRadius: 4,
                      background: 'var(--bg-card)', cursor: onJumpTo ? 'pointer' : 'default' }}>
                    <div style={{ fontSize: '.64rem', fontWeight: 700, color: 'var(--accent)' }}>{msg.replyTo.pseudo}</div>
                    <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{msg.replyTo.preview}</div>
                  </div>
                )}
                {msg.type === 'poll' ? (
                  <PollBubble poll={msg} myUid={myUid} onVote={onVote} />
                ) : msg.type === 'focus' ? (
                  <FocusBubble msg={msg} myUid={myUid} onJoin={onJoinFocus} />
                ) : msg.type === 'deck' ? (
                  <DeckBubble msg={msg} onImport={onSaveCard} />
                ) : msg.type === 'flashcard' ? (
                  <FlashcardBubble msg={msg} onSave={onSaveCard} />
                ) : msg.type === 'link' ? (
                  <LinkBubble msg={msg} />
                ) : (
                  <span>{renderMessageText(msg.text, memberNames)}{msg.editedAt && <span style={{ fontSize: '.6rem', opacity: .6, marginLeft: 5 }}>({t('groups.edited')})</span>}</span>
                )}
              </div>
            );
          })()}

          {Object.keys(reactionCounts).length > 0 && (
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 3, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              {Object.entries(reactionCounts).map(([emoji, count]) => (
                <span key={emoji} onClick={() => onReact(msg.id, emoji)}
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '1px 6px', fontSize: '.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                  {emoji} {count > 1 && <span style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>{count}</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {showTime && (
        <div style={{ fontSize: '.58rem', color: 'var(--text-muted)', [isMe ? 'marginRight' : 'marginLeft']: 36, marginTop: 1 }}>
          {formatFullTime(msg.sentAt, formatDate)}
        </div>
      )}
    </div>
  );
}

function PollBubble({ poll, myUid, onVote }) {
  const { t } = useTranslation();
  const votes = poll.votes || {};
  const myVote = votes[myUid];
  const totalVoters = Object.keys(votes).length;
  return (
    <div>
      <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>📊 {t('groups.poll')}</div>
      <div style={{ fontSize: '.85rem', fontWeight: 600, marginBottom: 8 }}>{poll.question}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {(poll.options || []).map((opt, i) => {
          const count = Object.values(votes).filter(v => v === i).length;
          const pct = totalVoters ? Math.round(count / totalVoters * 100) : 0;
          const mine = myVote === i;
          return (
            <button key={i} onClick={() => onVote && onVote(poll, i)}
              style={{ textAlign: 'left', padding: '6px 9px', borderRadius: 8, position: 'relative', overflow: 'hidden', cursor: 'pointer',
                background: 'var(--bg-card)', border: `1px solid ${mine ? 'var(--accent)' : 'transparent'}`, color: 'var(--text-primary)' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: mine ? 'var(--accent-glow)' : 'var(--accent-subtle)', transition: 'width .5s' }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: '.78rem' }}>
                <span style={{ fontWeight: mine ? 700 : 400 }}>{mine ? '✓ ' : ''}{opt}</span>
                <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>{pct}% · {count}</span>
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 6 }}>{t('groups.pollVoters', { count: totalVoters })}</div>
    </div>
  );
}

function FocusBubble({ msg, myUid, onJoin }) {
  const { t } = useTranslation();
  const participants = msg.participants || {};
  const names = Object.values(participants);
  const joined = !!participants[myUid];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '1.2rem' }}>⏱</span>
        <div>
          <div style={{ fontSize: '.75rem', fontWeight: 700 }}>{t('groups.focusShared')}</div>
          <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{msg.duration} min · {msg.text}</div>
        </div>
      </div>
      {names.length > 0 && (
        <div style={{ fontSize: '.66rem', color: '#27AE60' }}>🟢 {t('groups.focusJoined', { count: names.length })} · {names.slice(0, 4).join(', ')}{names.length > 4 ? '…' : ''}</div>
      )}
      <button onClick={() => onJoin && onJoin(msg)} disabled={joined}
        style={{ alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 9, border: 'none', cursor: joined ? 'default' : 'pointer',
          background: joined ? 'var(--bg-card)' : '#27AE60', color: joined ? 'var(--text-muted)' : '#fff', fontSize: '.74rem', fontWeight: 700 }}>
        {joined ? `✓ ${t('groups.focusJoinedYou')}` : `▶ ${t('groups.focusJoin')}`}
      </button>
    </div>
  );
}

function FlashcardBubble({ msg, onSave }) {
  const { t } = useTranslation();
  const [flipped, setFlipped] = useState(false);
  return (
    <div>
      <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>🃏 {t('groups.flashcardShared')}</div>
      <div onClick={() => setFlipped(f => !f)} style={{ cursor: 'pointer', perspective: 600 }}>
        <div style={{ padding: '8px 10px', borderRadius: 10, background: flipped ? 'rgba(39,174,96,.2)' : 'var(--bg-card)', transition: 'background .3s' }}>
          <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', marginBottom: 3 }}>{flipped ? `💡 ${t('groups.answer')}` : `❓ ${t('groups.question')}`}</div>
          <div style={{ fontSize: '.82rem', fontWeight: 500 }}>{flipped ? msg.answer : msg.question}</div>
          <div style={{ fontSize: '.58rem', color: 'var(--text-muted)', marginTop: 4 }}>{flipped ? t('groups.tapForQuestion') : t('groups.tapForAnswer')}</div>
        </div>
      </div>
      <button onClick={() => onSave && onSave(msg)}
        style={{ marginTop: 6, padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer',
          background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '.7rem', fontWeight: 700 }}>
        💾 {t('groups.saveCard')}
      </button>
    </div>
  );
}

// A shared resource link, rendered as a clickable rich card.
function LinkBubble({ msg }) {
  const { t } = useTranslation();
  let host;
  try { host = new URL(msg.url).hostname.replace(/^www\./, ''); } catch { host = msg.url; }
  const href = /^https?:\/\//i.test(msg.url) ? msg.url : `https://${msg.url}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: 'var(--accent-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>🔗</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.title || host}</div>
        <div style={{ fontSize: '.66rem', color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{host} · {t('groups.openLink')}</div>
      </div>
    </a>
  );
}

function TypingIndicator({ typingUsers = [] }) {
  const { t } = useTranslation();
  if (!typingUsers.length) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {[0, 1, 2].map(i => (
          <motion.div key={i} animate={{ y: [0, -4, 0] }} transition={{ duration: .6, repeat: Infinity, delay: i * .15 }}
            style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text-muted)' }} />
        ))}
      </div>
      <span style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>
        {typingUsers.join(', ')} {t('groups.typing', { count: typingUsers.length })}
      </span>
    </div>
  );
}

function PollModal({ onSend, onClose }) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState('');
  const [options, setOptions]   = useState(['', '']);
  const inp = { width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.82rem', fontFamily: 'var(--font-family)', boxSizing: 'border-box' };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(12px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: .92, y: 16 }} animate={{ scale: 1, y: 0 }}
        style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 18, padding: '1.5rem', width: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ color: 'var(--text-primary)', fontWeight: 800, margin: 0 }}>📊 {t('groups.createPoll')}</h3>
        <div>
          <label style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('groups.question')} *</label>
          <input value={question} onChange={e => setQuestion(e.target.value)} placeholder={t('groups.pollPlaceholder')} style={inp} autoFocus />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{t('groups.options')}</label>
          {options.map((o, i) => (
            <div key={i} style={{ display: 'flex', gap: 6 }}>
              <input value={o} onChange={e => { const n = [...options]; n[i] = e.target.value; setOptions(n); }}
                placeholder={t('groups.optionN', { n: i + 1 })} style={{ ...inp, flex: 1 }} />
              {options.length > 2 && <button onClick={() => setOptions(options.filter((_, j) => j !== i))}
                style={{ padding: '4px 8px', borderRadius: 7, border: 'none', background: 'rgba(231,76,60,.15)', color: '#E74C3C', cursor: 'pointer' }}>✕</button>}
            </div>
          ))}
          {options.length < 5 && <button onClick={() => setOptions([...options, ''])}
            style={{ alignSelf: 'flex-start', padding: '4px 12px', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '.75rem', cursor: 'pointer' }}>
            {t('groups.addOption')}
          </button>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '.82rem' }}>{t('common.cancel')}</button>
          <button onClick={() => { if (question.trim() && options.filter(o => o.trim()).length >= 2) { onSend(question, options.filter(o => o.trim())); onClose(); } }}
            style={{ flex: 2, padding: '9px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '.82rem' }}>
            📊 {t('groups.send')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}


// Compose a resource link to share into the group chat.
function LinkShareModal({ onSend, onClose }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [url, setUrl]     = useState('');
  const inp = { width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.82rem', fontFamily: 'var(--font-family)', boxSizing: 'border-box' };
  const valid = url.trim().length > 3;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(12px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: .92, y: 16 }} animate={{ scale: 1, y: 0 }}
        style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 18, padding: '1.5rem', width: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ color: 'var(--text-primary)', fontWeight: 800, margin: 0 }}>🔗 {t('groups.shareLink')}</h3>
        <div>
          <label style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('groups.linkUrl')} *</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" style={inp} autoFocus />
        </div>
        <div>
          <label style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('groups.linkTitle')}</label>
          <input value={title} onChange={e => setTitle(e.target.value)} style={inp} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '.82rem' }}>{t('common.cancel')}</button>
          <button onClick={() => { if (valid) { onSend(title.trim(), url.trim()); onClose(); } }}
            style={{ flex: 2, padding: '9px', borderRadius: 10, border: 'none', background: valid ? 'var(--accent)' : 'var(--bg-card)', color: valid ? '#fff' : 'var(--text-muted)', fontWeight: 700, cursor: valid ? 'pointer' : 'default', fontSize: '.82rem' }}>
            🔗 {t('groups.send')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ConfirmModal({ title, message, confirmLabel, danger = false, onConfirm, onClose }) {
  const { t } = useTranslation();
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(12px)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: .92, y: 16 }} animate={{ scale: 1, y: 0 }}
        style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 18, padding: '1.5rem', width: 340, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '1rem', margin: 0 }}>{title}</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '.84rem', margin: 0, lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '.82rem' }}>
            {t('common.cancel')}
          </button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: .98 }} onClick={() => { onConfirm(); onClose(); }}
            style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none',
              background: danger ? 'linear-gradient(135deg,#E74C3C,#c0392b)' : 'linear-gradient(135deg,var(--accent),#6366f1)',
              color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '.82rem' }}>
            {confirmLabel || t('groups.confirm')}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Local YYYY-MM-DD key for streak day-bucketing.
function dayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
}

// Group activity derived entirely from the messages already in memory — no
// extra reads or schema. Focus minutes are credited to every participant of a
// shared focus session; the streak counts consecutive days with ≥1 session.
function GroupStats({ messages, members }) {
  const { t } = useTranslation();
  // Capture "now" once per mount so the render stays pure (no live clock reads).
  const [now] = useState(() => Date.now());
  const focusMsgs = messages.filter(m => m.type === 'focus');
  const weekAgo = now - 7 * 86400e3;

  const minutesByUid = {};
  let weeklyMinutes = 0;
  for (const m of focusMsgs) {
    const parts = m.participants && Object.keys(m.participants).length
      ? Object.keys(m.participants)
      : (m.uid ? [m.uid] : []);
    const dur = Number(m.duration) || 0;
    const recent = new Date(m.sentAt).getTime() >= weekAgo;
    for (const uid of parts) {
      minutesByUid[uid] = (minutesByUid[uid] || 0) + dur;
      if (recent) weeklyMinutes += dur;
    }
  }

  // Consecutive days (ending today or yesterday) that had a focus session.
  const days = new Set(focusMsgs.map(m => dayKey(m.sentAt)));
  let streak = 0;
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1); // allow "yesterday" to keep it alive
  while (days.has(dayKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }

  const pseudoByUid = Object.fromEntries(members.map(([uid, m]) => [uid, m.pseudo]));
  const leaderboard = Object.entries(minutesByUid)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([uid, min]) => ({ uid, min, pseudo: pseudoByUid[uid] || '?' }));

  const cardsShared = messages.filter(m => m.type === 'flashcard').length;
  const pollsCount  = messages.filter(m => m.type === 'poll').length;

  const fmtMin = min => min >= 60
    ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
    : `${min} ${t('groups.minutesUnit')}`;

  const medals = ['🥇', '🥈', '🥉'];
  const hasData = focusMsgs.length > 0 || cardsShared > 0 || pollsCount > 0;

  return (
    <div>
      <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
        {t('groups.statsTitle')}
      </div>

      {!hasData ? (
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', padding: '8px 10px', background: 'var(--bg-card)', borderRadius: 10 }}>
          {t('groups.noStatsYet')}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: leaderboard.length ? 10 : 0 }}>
            <StatTile icon="⏱" value={fmtMin(weeklyMinutes)} label={t('groups.statFocusWeek')} />
            <StatTile icon="🔥" value={t('groups.statStreakDays', { count: streak })} label={t('groups.statStreak')} />
            <StatTile icon="🃏" value={cardsShared} label={t('groups.statCards')} />
            <StatTile icon="📊" value={pollsCount} label={t('groups.statPolls')} />
          </div>

          {leaderboard.length > 0 && (
            <div>
              <div style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>🏆 {t('groups.leaderboard')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {leaderboard.map((e, i) => (
                  <div key={e.uid} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 9, background: 'var(--bg-card)' }}>
                    <span style={{ width: 18, textAlign: 'center', fontSize: '.78rem' }}>{medals[i] || i + 1}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: '.76rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.pseudo}</span>
                    <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--accent)' }}>{fmtMin(e.min)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatTile({ icon, value, label }) {
  return (
    <div style={{ padding: '10px', borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: '1.05rem', lineHeight: 1 }}>{icon}</div>
      <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

function MembersPanel({ group, user, members, onlineMembers, onClose, onLeave, onDelete, closeChat, onViewUser, messages = [] }) {
  const { t } = useTranslation();
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('groups.groupInfo')}</h3>
        <button aria-label="Fermer" onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
      </div>

      {/* Group header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, flexShrink: 0,
          background: 'linear-gradient(135deg,var(--accent),#9B59B6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
          {group.emoji || '👥'}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>{group.name}</div>
          {group.desc && <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>{group.desc}</div>}
        </div>
      </div>

      {/* Invite code */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--accent-subtle)', border: '1px solid var(--accent)', borderRadius: 10 }}>
        <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{t('groups.inviteCode')}</span>
        <span style={{ fontSize: '.82rem', fontWeight: 800, color: 'var(--accent)', letterSpacing: '.04em', marginLeft: 'auto' }}>{group.code}</span>
        <button onClick={() => navigator.clipboard?.writeText(group.code)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '.9rem' }} title={t('groups.copy')}>📋</button>
      </div>

      {/* Group activity / goals */}
      <GroupStats messages={messages} members={members} />

      {/* Members list */}
      <div>
        <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
          {t('groups.membersCount', { count: members.length })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {members.map(([uid, m]) => {
            const isMe = uid === user.uid;
            return (
              <div key={uid}
                onClick={() => !isMe && onViewUser && onViewUser({ uid, pseudo: m.pseudo })}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 10, background: 'var(--bg-card)', cursor: isMe ? 'default' : 'pointer' }}>
                <Avatar name={m.pseudo} size={32} color={`hsl(${(uid.charCodeAt(0) * 47) % 360},60%,50%)`}
                  online={!!onlineMembers[uid]} photoURL={m.photoURL || null} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {m.pseudo}{isMe ? t('groups.youParen') : ''}
                  </div>
                  <div style={{ fontSize: '.6rem', color: onlineMembers[uid] ? '#27AE60' : 'var(--text-muted)' }}>
                    {onlineMembers[uid] ? t('groups.online') : t('groups.offline')}
                  </div>
                </div>
                {uid === group.createdBy && <span style={{ fontSize: '.62rem', color: '#F1C40F' }}>{t('groups.creator')}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={() => { onClose(); closeChat(); onLeave(group.id, group.name); }}
          style={{ padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '.82rem', cursor: 'pointer' }}>
          {t('groups.leaveGroup')}
        </button>
        {group.createdBy === user.uid && (
          <button onClick={() => { onClose(); closeChat(); onDelete(group.id); }}
            style={{ padding: '10px', borderRadius: 10, border: '1px solid rgba(231,76,60,.3)', background: 'rgba(231,76,60,.08)', color: '#E74C3C', fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>
            🗑 {t('groups.deleteGroup')}
          </button>
        )}
      </div>
    </>
  );
}

function GroupChat({ group, user, prefs, onClose, onLeave, onDelete, onOpenConv }) {
  const { t, formatDate } = useTranslation();
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState('');
  const [sending, setSending]     = useState(false);
  const [typing, setTyping]       = useState({});
  const [onlineMembers, setOnline] = useState({});
  const [showPoll, setShowPoll]   = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [viewUser, setViewUser]   = useState(null); // { uid, pseudo }
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' && window.innerWidth > 768);
  const [unread, setUnread]       = useState(0);
  const [saveCard, setSaveCard]   = useState(null); // shared card awaiting a save destination
  const [subjects, setSubjects]   = useState([]);   // user's subjects, for the import picker
  const [myFlashcards, setMyFlashcards] = useState({}); // my cards, for duplicate detection
  const [showCardShare, setShowCardShare] = useState(false); // share-a-flashcard composer
  const [showLinkShare, setShowLinkShare] = useState(false); // share-a-link composer
  const [msgLimit, setMsgLimit]   = useState(40);   // pagination window (latest N)
  const [hasMore, setHasMore]     = useState(false);// whether older messages exist
  const [replyTo, setReplyTo]     = useState(null); // { id, pseudo, preview }
  const [editing, setEditing]     = useState(null); // message being edited
  const [pinned, setPinned]       = useState(group.pinned || null); // pinned message
  const [mention, setMention]     = useState(null); // { query } for @-autocomplete
  // Live focus session of THIS group (everyone sees it, joined or not).
  const [liveSession, setLiveSession] = useState(null);
  const [sessionParts, setSessionParts] = useState({});
  const [showNewSession, setShowNewSession] = useState(false);
  const [sessionFullscreen, setSessionFullscreen] = useState(false);
  // My own membership + accrued focus time (kept app-wide by GroupSessionEngine).
  // The hook also re-renders twice a second, which is what drives the countdown.
  const { membership, myFocusMs } = useGroupSession(user.uid);

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth > 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const bottomRef  = useRef(null);
  const typingRef  = useRef(null);
  const inputRef   = useRef(null);
  const scrollRef  = useRef(null);
  const prevHeight = useRef(0);       // scrollHeight snapshot for "load older"
  const loadingOlder = useRef(false); // suppress auto-scroll while paginating up
  const pseudo     = user.displayName || user.email?.split('@')[0] || 'Anonyme';
  const isAtBottom = useRef(true);

  // Latest `msgLimit` messages (paginated). Bumping the limit loads older ones
  // while preserving the scroll position so the view doesn't jump.
  useEffect(() => {
    const q = query(collection(db, 'groups', group.id, 'messages'), orderBy('sentAt', 'asc'), limitToLast(msgLimit));
    const unsub = onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setHasMore(snap.size >= msgLimit);
      setMessages(msgs);
      if (loadingOlder.current) {
        // Keep the same message under the viewport after prepending older ones.
        loadingOlder.current = false;
        requestAnimationFrame(() => {
          const el = scrollRef.current;
          if (el) el.scrollTop = el.scrollHeight - prevHeight.current;
        });
      } else if (isAtBottom.current) {
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      } else {
        setUnread(u => u + 1);
      }
    });
    return unsub;
  }, [group.id, msgLimit]);

  function loadOlder() {
    const el = scrollRef.current;
    prevHeight.current = el ? el.scrollHeight : 0;
    loadingOlder.current = true;
    setMsgLimit(l => l + 40);
  }

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'groups', group.id), snap => {
      if (snap.exists()) {
        setTyping(snap.data().typing || {});
        setPinned(snap.data().pinned || null);
      }
    });
    return unsub;
  }, [group.id]);

  useEffect(() => {
    const presRef = dbRef(rtdb, `groupPresence/${group.id}/${user.uid}`);
    set(presRef, { pseudo, online: true });
    onDisconnect(presRef).remove();
    const unsub = onValue(dbRef(rtdb, `groupPresence/${group.id}`), snap => {
      setOnline(snap.val() || {});
    });
    return () => { remove(presRef); unsub(); };
  }, [group.id]);

  // Watch this group's live session. Everyone in the room subscribes, joined or
  // not, so a session someone else started shows up immediately.
  useEffect(() => {
    startServerClock();
    const offSession = subscribeSession(group.id, setLiveSession);
    const offParts = subscribeParticipants(group.id, setSessionParts);
    return () => { offSession(); offParts(); };
  }, [group.id]);

  // Lazily load my subjects AND my cards the first time an import opens: the
  // cards are what lets the importer tell you how many are already there.
  useEffect(() => {
    if (!saveCard || subjects.length) return;
    getDoc(doc(db, 'users', user.uid, 'data', 'main'))
      .then(snap => {
        if (!snap.exists()) return;
        setSubjects(snap.data().subjects || []);
        setMyFlashcards(snap.data().flashcards || {});
      })
      .catch(e => reportSaveError(e, 'Groups — load my cards'));
  }, [saveCard, subjects.length, user.uid]);

  function handleTyping() {
    updateDoc(doc(db, 'groups', group.id), { [`typing.${user.uid}`]: pseudo }).catch(() => {});
    clearTimeout(typingRef.current);
    typingRef.current = setTimeout(() => {
      updateDoc(doc(db, 'groups', group.id), { [`typing.${user.uid}`]: null }).catch(() => {});
    }, 2000);
  }

  // Detect which members are @mentioned in a piece of text (returns their uids).
  function detectMentions(text) {
    if (!text) return [];
    const lower = text.toLowerCase();
    return Object.entries(group.members || {})
      .filter(([, m]) => m.pseudo && lower.includes(`@${m.pseudo.toLowerCase()}`))
      .map(([uid]) => uid);
  }

  async function send(extra = {}) {
    if ((!input.trim() && !extra.type) || sending) return;
    setSending(true);
    const sentAt = new Date().toISOString();
    const text = input.trim();
    const mentions = detectMentions(text);
    const replyMeta = replyTo && !extra.type
      ? { id: replyTo.id, pseudo: replyTo.pseudo, preview: replyTo.preview }
      : null;
    try {
      await addDoc(collection(db, 'groups', group.id, 'messages'), {
        uid: user.uid, pseudo, text, sentAt, reactions: {},
        ...(mentions.length ? { mentions } : {}),
        ...(replyMeta ? { replyTo: replyMeta } : {}),
        ...extra
      });
      // Update the group's last-message preview (for the list).
      updateDoc(doc(db, 'groups', group.id), {
        lastMessage: { uid: user.uid, pseudo, text, type: extra.type || 'text', sentAt },
        [`typing.${user.uid}`]: null
      }).catch(() => {});
      setInput('');
      setReplyTo(null);
      setMention(null);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (e) { reportSaveError(e, 'Groups — send'); }
    setSending(false);
  }

  // Persist an edit to one of my own text messages.
  async function saveEdit() {
    const text = input.trim();
    if (!editing || !text) { setEditing(null); setInput(''); return; }
    try {
      await updateDoc(doc(db, 'groups', group.id, 'messages', editing.id), {
        text, editedAt: new Date().toISOString(), mentions: detectMentions(text),
      });
    } catch (e) { reportSaveError(e, 'Groups — edit'); }
    setEditing(null);
    setInput('');
  }

  // Begin editing a message: prefill the composer, drop any reply draft.
  function startEdit(msg) {
    setReplyTo(null);
    setEditing(msg);
    setInput(msg.text || '');
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  function startReply(msg) {
    setEditing(null);
    setReplyTo({ id: msg.id, pseudo: msg.pseudo, preview: messagePreview(msg, t) });
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  // Pin (replaces any existing pin) or unpin a message on the group doc.
  async function pinMessage(msg) {
    try {
      await updateDoc(doc(db, 'groups', group.id), {
        pinned: { id: msg.id, pseudo: msg.pseudo, preview: messagePreview(msg, t), byPseudo: pseudo }
      });
    } catch (e) { reportSaveError(e, 'Groups — pin'); }
  }
  async function unpinMessage() {
    try { await updateDoc(doc(db, 'groups', group.id), { pinned: deleteField() }); }
    catch (e) { reportSaveError(e, 'Groups — unpin'); }
  }

  // Scroll to a referenced message and flash it (reply/pin jump).
  function jumpTo(id) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return; // may be outside the loaded window
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.animate([{ background: 'var(--accent-subtle)' }, { background: 'transparent' }], { duration: 1400 });
  }

  // Insert a member mention at the current @-token in the composer.
  function pickMention(m) {
    setInput(prev => prev.replace(/@[\wÀ-ÿ'-]*$/, `@${m.pseudo} `));
    setMention(null);
    setTimeout(() => inputRef.current?.focus(), 20);
  }

  async function sendPoll(question, options) {
    await send({ type: 'poll', text: '', question, options, votes: {} });
  }

  /**
   * Start a live session for the group and announce it in the conversation.
   * The chat card is only an invitation: the session itself lives in the
   * Realtime Database, which is what makes the countdown shared.
   */
  async function handleCreateSession(cfg) {
    try {
      const res = await createSession(group.id, { uid: user.uid, pseudo, ...cfg });
      if (!res.ok) {
        notify('groups.sessionAlreadyLive', 'info');
        setShowNewSession(false);
        return;
      }
      await enterSession(res.session);
      setShowNewSession(false);
      // `duration` (total work minutes) and `participants` keep the card
      // readable by the existing group-stats computation.
      await send({
        type: 'focus',
        text: cfg.title
          ? t('groups.sessionInvite', { pseudo, title: cfg.title })
          : t('groups.sessionInviteNoTitle', { pseudo }),
        sessionId: res.session.id,
        title: cfg.title || '',
        workMin: cfg.workMin, breakMin: cfg.breakMin, rounds: cfg.rounds,
        duration: cfg.workMin * cfg.rounds,
        participants: { [user.uid]: pseudo },
      });
    } catch (e) { reportSaveError(e, 'Groups — create session'); }
  }

  /** Register as a live participant and start accruing focus time. */
  async function enterSession(session) {
    if (!session) return;
    await joinSession(group.id, user.uid, pseudo);
    // Re-joining the session I am already in must not reset my focus time.
    if (membership?.sessionId !== session.id) {
      setMembership({ groupId: group.id, groupName: group.name, sessionId: session.id });
    }
  }

  /** Leave early — the focus time already earned is still banked. */
  async function handleLeaveSession() {
    setSessionFullscreen(false);
    try { await bankMyGroupSession(user.uid, membership); }
    catch (e) { reportSaveError(e, 'Groups — leave session'); }
  }

  // Host controls. Each is a single write; the countdown itself never moves
  // over the wire — every client recomputes it from the new programme.
  async function runHostAction(fn) {
    try { await fn(); } catch (e) { reportSaveError(e, 'Groups — session control'); }
  }
  async function handleStartSession()  { await runHostAction(() => startSession(group.id)); }
  async function handlePauseSession()  { await runHostAction(() => pauseSession(group.id)); }
  async function handleResumeSession() { await runHostAction(() => resumeSession(group.id, liveSession)); }
  async function handleSkipPhase()     { await runHostAction(() => skipPhase(group.id, liveSession)); }
  async function handleCloseSession()  { await runHostAction(() => clearSession(group.id)); }

  async function handleEndSession() {
    await runHostAction(async () => {
      if (!window.confirm(t('groups.sessionEndConfirm'))) return;
      await endSession(group.id);
      // Leave a trace in the conversation, so members who were not looking at
      // the bar still see that the session was closed.
      await send({
        type: 'sessionEnd',
        text: t('groups.sessionEndedNotice', { pseudo }),
        title: liveSession?.title || '',
      });
    });
  }

  /**
   * Share one or more cards as a single deck message. A hand-written card goes
   * through the same path with a deck of one, so there is only one shape to
   * render and import.
   */
  async function sendDeck(cards, title) {
    const clean = (cards || [])
      .map(c => ({ q: String(c.q || '').trim(), a: String(c.a || '').trim() }))
      .filter(c => c.q && c.a)
      .slice(0, MAX_DECK_CARDS);
    if (!clean.length) return;
    await send({
      type: 'deck',
      text: t('groups.deckShared', { count: clean.length }),
      title: title || '',
      cards: clean,
      count: clean.length,
    });
  }

  async function sendLink(title, url) {
    await send({ type: 'link', text: '', title, url });
  }

  async function handleReact(msgId, emoji) {
    const msgRef = doc(db, 'groups', group.id, 'messages', msgId);
    const snap = await getDoc(msgRef);
    if (!snap.exists()) return;
    const reactions = { ...(snap.data().reactions || {}) };
    if (reactions[user.uid] === emoji) delete reactions[user.uid];
    else reactions[user.uid] = emoji;
    await updateDoc(msgRef, { reactions });
  }

  async function handleDeleteMsg(msgId) {
    try { await deleteDoc(doc(db, 'groups', group.id, 'messages', msgId)); }
    catch (e) { reportSaveError(e); }
  }

  // Cast (or change) my vote on a poll message.
  async function handleVote(poll, optionIndex) {
    try {
      await updateDoc(doc(db, 'groups', group.id, 'messages', poll.id), {
        [`votes.${user.uid}`]: optionIndex
      });
    } catch (e) { reportSaveError(e, 'Groups — vote'); }
  }

  // Join a shared focus session; my pseudo is added to its live participants.
  async function handleJoinFocus(msg) {
    try {
      // Cards posted before live sessions existed have no `sessionId`: they
      // stay what they always were, a list of names.
      if (msg.sessionId && liveSession?.id === msg.sessionId) await enterSession(liveSession);
      await updateDoc(doc(db, 'groups', group.id, 'messages', msg.id), {
        [`participants.${user.uid}`]: pseudo
      });
    } catch (e) { reportSaveError(e, 'Groups — join focus'); }
  }

  // Open the destination picker for a shared flashcard.
  /**
   * Open the importer for a shared deck, or for a single legacy 'flashcard'
   * message — both end up as a list of { q, a }.
   */
  function handleSaveCard(msg) {
    const cards = msg.type === 'deck'
      ? (Array.isArray(msg.cards) ? msg.cards : [])
      : [{ q: msg.question, a: msg.answer }];
    setSaveCard({ cards: cards.filter(c => c?.q && c?.a), title: msg.title || '' });
  }

  // Copy a shared flashcard into the chosen subject/chapter bucket, matching
  // the storage shape `${subjectId}_${chapterIndex}` → [{ q, a, ok }].
  /**
   * Append a shared deck to one of my chapters, skipping cards already there.
   * Re-reads the document first so the merge is against the current contents,
   * not the copy the picker was opened with.
   *
   * @returns {{ added: number, skipped: number }}
   */
  async function confirmImportDeck(cards, subjId, chapIdx) {
    try {
      const ref = doc(db, 'users', user.uid, 'data', 'main');
      const snap = await getDoc(ref);
      const all = { ...((snap.exists() && snap.data().flashcards) || {}) };
      const k = `${subjId}_${chapIdx}`;
      const bucket = all[k] || [];
      const seen = new Set(bucket.map(cardKey));

      const fresh = [];
      for (const c of cards) {
        const key = cardKey(c);
        if (seen.has(key)) continue;
        seen.add(key); // also guards against duplicates inside the deck itself
        fresh.push({ q: c.q, a: c.a, ok: null });
      }

      if (fresh.length) {
        all[k] = [...bucket, ...fresh];
        await updateDoc(ref, { flashcards: all });
        setMyFlashcards(all);
      }
      return { added: fresh.length, skipped: cards.length - fresh.length };
    } catch (e) {
      reportSaveError(e, 'Groups — import deck');
      return { added: 0, skipped: 0 };
    }
  }

  const members     = Object.entries(group.members || {});
  const memberNames = new Set(members.map(([, m]) => (m.pseudo || '').toLowerCase()));
  const typingUsers = Object.entries(typing).filter(([uid, v]) => uid !== user.uid && v).map(([, v]) => v);
  const onlineCount = Object.keys(onlineMembers).length;

  // Session state, recomputed on every render (the hook above ticks twice a
  // second): the remaining time is always derived from the shared clock, never
  // decremented, so it is identical on every participant's screen.
  const sessionPhase = phaseAt(liveSession, serverNow());
  const sessionRemainingPct = sessionPhase.phaseMs > 0 ? sessionPhase.leftMs / sessionPhase.phaseMs : 0;
  const joinedLiveSession = !!liveSession && membership?.sessionId === liveSession.id;
  // A finished session stays on screen for a few minutes (so the room sees it
  // ended), then gets out of the way even if the host never closed it.
  const sessionVisible = !!liveSession &&
    (sessionPhase.phase !== 'done' || serverNow() - sessionEndMs(liveSession) < 5 * 60000);

  // Members matching the current @-token (for the mention autocomplete).
  const mentionMatches = mention == null ? [] : members
    .filter(([, m]) => (m.pseudo || '').toLowerCase().startsWith(mention.query.toLowerCase()))
    .slice(0, 5);

  // Update composer text and detect an in-progress "@token" at the caret end.
  function onInputChange(value) {
    setInput(value);
    if (!editing) handleTyping();
    const m = value.match(/@([\wÀ-ÿ'-]*)$/);
    setMention(m ? { query: m[1] } : null);
  }

  return (
    <div style={{ display: 'flex', gap: 12, height: '76vh' }} className="group-chat-row">
    <motion.div className="group-chat-inner" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-modal)',
        border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--card-shadow)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', backdropFilter: 'blur(10px)' }}>
        <button aria-label="Retour" onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.1rem', cursor: 'pointer', padding: '4px 6px', borderRadius: 8 }}>←</button>
        <div onClick={() => setShowMembers(true)} style={{ flex: 1, cursor: 'pointer' }}>
          <div style={{ fontSize: '.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>{group.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#27AE60', display: 'inline-block' }} />
            <span style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>{t('groups.nOnline', { count: onlineCount })} · {t('groups.membersCount', { count: members.length })}</span>
          </div>
        </div>
        <button onClick={() => setShowMembers(true)}
          style={{ display: 'flex', alignItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
          {members.slice(0, 4).map(([uid, m], i) => (
            <div key={uid} style={{ marginLeft: i > 0 ? -6 : 0, zIndex: 5 - i }}>
              <Avatar name={m.pseudo} size={26} color={`hsl(${(uid.charCodeAt(0) * 47) % 360},60%,50%)`}
                online={!!onlineMembers[uid]} photoURL={m.photoURL || null} />
            </div>
          ))}
          {members.length > 4 && (
            <div style={{ marginLeft: -6, width: 26, height: 26, borderRadius: '50%', background: 'var(--bg-card-hover)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.58rem', color: 'var(--text-muted)', fontWeight: 700, zIndex: 0 }}>
              +{members.length - 4}
            </div>
          )}
        </button>
      </div>

      {/* Pinned message bar */}
      {pinned && (
        <div onClick={() => jumpTo(pinned.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderBottom: '1px solid var(--border)', background: 'var(--accent-subtle)', cursor: 'pointer' }}>
          <span style={{ fontSize: '.85rem' }}>📌</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{t('groups.pinned')}</div>
            <div style={{ fontSize: '.74rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pinned.preview}</div>
          </div>
          <button onClick={e => { e.stopPropagation(); unpinMessage(); }}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', flexShrink: 0 }} title={t('groups.unpin')}>×</button>
        </div>
      )}

      {/* Live session — sticky above the conversation while one is running */}
      <AnimatePresence>
        {sessionVisible && (
          <GroupSessionBar
            session={liveSession}
            participants={sessionParts}
            phase={sessionPhase.phase}
            round={sessionPhase.round}
            leftMs={sessionPhase.leftMs}
            remainingPct={sessionRemainingPct}
            paused={!!liveSession.pausedAt}
            joined={joinedLiveSession}
            isHost={liveSession.hostUid === user.uid}
            ringStyle={prefs?.ringStyle || 'default'}
            onJoin={() => enterSession(liveSession)}
            onLeave={handleLeaveSession}
            onPause={handlePauseSession}
            onResume={handleResumeSession}
            onSkip={handleSkipPhase}
            onEnd={handleEndSession}
            onClose={handleCloseSession}
            onStart={handleStartSession}
            onFullscreen={() => setSessionFullscreen(true)}
          />
        )}
      </AnimatePresence>

      {/* Messages */}
      <div ref={scrollRef} onScroll={e => {
        const el = e.currentTarget;
        isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        if (isAtBottom.current) setUnread(0);
      }}
        style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 1, scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
        {hasMore && messages.length > 0 && (
          <button onClick={loadOlder}
            style={{ alignSelf: 'center', margin: '2px 0 10px', padding: '5px 14px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: '.72rem', cursor: 'pointer' }}>
            {t('groups.loadOlder')}
          </button>
        )}
        {messages.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '2.5rem' }}>💬</span>
            <span style={{ fontSize: '.85rem' }}>{t('groups.beFirst')}</span>
          </div>
        ) : messages.map((m, i) => {
          const isMe = m.uid === user.uid;
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const showAv = prev?.uid !== m.uid;
          const showTm = next?.uid !== m.uid || !next;
          const showDate = !prev || new Date(m.sentAt).toDateString() !== new Date(prev.sentAt).toDateString();
          return (
            <div key={m.id}>
              {showDate && (
                <div style={{ textAlign: 'center', margin: '12px 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: '.62rem', color: 'var(--text-muted)', padding: '2px 10px', background: 'var(--bg-card)', borderRadius: 10 }}>
                    {formatDate(m.sentAt, { weekday: 'long', day: 'numeric', month: 'long' })}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
              )}
              {m.type === 'sessionEnd' ? (
                // A session closing is an event, not someone talking: render it
                // as a centred notice rather than a chat bubble.
                <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px',
                    borderRadius: 20, background: 'var(--bg-card)', border: '1px solid var(--border)',
                    fontSize: '.68rem', color: 'var(--text-muted)' }}>
                    <Square size={11} strokeWidth={2.4} />
                    {m.title ? `${m.text} · ${m.title}` : m.text}
                  </span>
                </div>
              ) : (
              <MessageBubble msg={m} isMe={isMe} showAvatar={showAv} showTime={showTm}
                onReact={handleReact} onDelete={handleDeleteMsg} onViewUser={setViewUser}
                myUid={user.uid} onVote={handleVote} onJoinFocus={handleJoinFocus} onSaveCard={handleSaveCard}
                onReply={startReply} onEdit={startEdit} onPin={pinMessage} onJumpTo={jumpTo}
                memberNames={memberNames} mentionsMe={Array.isArray(m.mentions) && m.mentions.includes(user.uid)} />
              )}
            </div>
          );
        })}
        <TypingIndicator typingUsers={typingUsers} />
        <div ref={bottomRef} />
      </div>

      <AnimatePresence>
        {unread > 0 && !isAtBottom.current && (
          <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            onClick={() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); setUnread(0); }}
            style={{ position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)', padding: '6px 16px', borderRadius: 20, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer', zIndex: 10 }}>
            {t('groups.newMessages', { count: unread })}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Tools bar */}
      <AnimatePresence>
        {showTools && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden', borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
            <div style={{ padding: '10px 14px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { icon: '📊', label: t('groups.poll'), action: () => { setShowPoll(true); setShowTools(false); } },
                { icon: '🃏', label: t('groups.flashcard'), action: () => { setShowCardShare(true); setShowTools(false); } },
                { icon: '🔗', label: t('groups.link'), action: () => { setShowLinkShare(true); setShowTools(false); } },
                { icon: '⏱', label: t('groups.sessionStart'), action: () => { setShowNewSession(true); setShowTools(false); } },
              ].map((tool, i) => (
                <motion.button key={i} whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }} onClick={tool.action}
                  style={{ padding: '7px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card-hover)', color: 'var(--text-secondary)', fontSize: '.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {tool.icon} {tool.label}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reply / edit banner */}
      {(replyTo || editing) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <span style={{ fontSize: '.9rem' }}>{editing ? '✏️' : '↩'}</span>
          <div style={{ flex: 1, minWidth: 0, borderLeft: '3px solid var(--accent)', paddingLeft: 8 }}>
            <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--accent)' }}>
              {editing ? t('groups.editingMessage') : t('groups.replyingTo', { pseudo: replyTo.pseudo })}
            </div>
            <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {editing ? editing.text : replyTo.preview}
            </div>
          </div>
          <button onClick={() => { setReplyTo(null); setEditing(null); setInput(''); }}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', flexShrink: 0 }}>×</button>
        </div>
      )}

      {/* Input */}
      <div style={{ position: 'relative', padding: '10px 14px', borderTop: (replyTo || editing) ? 'none' : '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        {/* @mention autocomplete */}
        <AnimatePresence>
          {mentionMatches.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
              style={{ position: 'absolute', bottom: 'calc(100% + 4px)', left: 14, right: 14, background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 12, boxShadow: 'var(--card-shadow)', overflow: 'hidden', zIndex: 20 }}>
              {mentionMatches.map(([uid, m]) => (
                <button key={uid} onClick={() => pickMention(m)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <Avatar name={m.pseudo} size={24} color={`hsl(${(uid.charCodeAt(0) * 47) % 360},60%,50%)`} photoURL={m.photoURL || null} />
                  <span style={{ fontSize: '.8rem', fontWeight: 600 }}>{m.pseudo}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <button onClick={() => setShowTools(tl => !tl)}
          style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${showTools ? 'var(--accent)' : 'var(--border)'}`,
            background: showTools ? 'var(--accent-subtle)' : 'transparent', color: showTools ? 'var(--accent)' : 'var(--text-muted)', fontSize: '1rem', cursor: 'pointer', flexShrink: 0 }}>
          +
        </button>
        <div style={{ flex: 1, position: 'relative' }}>
          <textarea ref={inputRef} value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setReplyTo(null); setEditing(null); setInput(''); setMention(null); return; }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); editing ? saveEdit() : send(); }
            }}
            placeholder={t('groups.messagePlaceholder')}
            rows={1}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 12, border: '1px solid var(--border-strong)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.83rem', fontFamily: 'var(--font-family)', resize: 'none', lineHeight: 1.5, boxSizing: 'border-box', maxHeight: 100, overflowY: 'auto', scrollbarWidth: 'none' }} />
        </div>
        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }} onClick={() => editing ? saveEdit() : send()}
          disabled={!input.trim() || sending}
          style={{ width: 36, height: 36, borderRadius: 10, border: 'none', flexShrink: 0,
            background: input.trim() ? 'var(--accent)' : 'var(--bg-card)',
            color: input.trim() ? '#fff' : 'var(--text-muted)', fontSize: '1rem', cursor: input.trim() ? 'pointer' : 'default' }}>
          {editing ? '✓' : '➤'}
        </motion.button>
      </div>

      <AnimatePresence>
        {showPoll && <PollModal onSend={sendPoll} onClose={() => setShowPoll(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {saveCard && <ImportDeckModal cards={saveCard.cards} title={saveCard.title}
          subjects={subjects} flashcards={myFlashcards}
          onConfirm={confirmImportDeck} onClose={() => setSaveCard(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showCardShare && <ShareDeckModal user={user} onSend={sendDeck} onClose={() => setShowCardShare(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showLinkShare && <LinkShareModal onSend={sendLink} onClose={() => setShowLinkShare(false)} />}
      </AnimatePresence>

      {/* Members panel — MOBILE: sliding overlay */}
      <AnimatePresence>
        {showMembers && !isDesktop && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={e => e.target === e.currentTarget && setShowMembers(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)', zIndex: 950, display: 'flex', justifyContent: 'flex-end' }}>
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              style={{ width: 300, maxWidth: '85%', height: '100%', background: 'var(--bg-modal)', borderLeft: '1px solid var(--border-strong)', display: 'flex', flexDirection: 'column', padding: '1.2rem', gap: 14, overflowY: 'auto' }}>
              <MembersPanel group={group} user={user} members={members} onlineMembers={onlineMembers}
                onClose={() => setShowMembers(false)} onLeave={onLeave} onDelete={onDelete} closeChat={onClose}
                onViewUser={setViewUser} messages={messages} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>

    {/* Members panel — DESKTOP: right column */}
    <AnimatePresence>
      {showMembers && isDesktop && (
        <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 300, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
          style={{ flexShrink: 0, height: '100%', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: 300, background: 'var(--bg-modal)', border: '1px solid var(--border)', borderRadius: 18, display: 'flex', flexDirection: 'column', padding: '1.2rem', gap: 14, overflowY: 'auto', boxSizing: 'border-box' }}>
            <MembersPanel group={group} user={user} members={members} onlineMembers={onlineMembers}
              onClose={() => setShowMembers(false)} onLeave={onLeave} onDelete={onDelete} closeChat={onClose}
              onViewUser={setViewUser} messages={messages} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    <AnimatePresence>
      {viewUser && (
        <UserProfileModal targetUid={viewUser.uid} targetPseudo={viewUser.pseudo}
          user={user} online={!!onlineMembers[viewUser.uid]}
          onOpenConv={onOpenConv}
          onClose={() => setViewUser(null)} />
      )}
    </AnimatePresence>

    {/* Session creation + immersive countdown */}
    <AnimatePresence>
      {showNewSession && (
        <NewSessionModal onClose={() => setShowNewSession(false)} onCreate={handleCreateSession} />
      )}
    </AnimatePresence>
    <AnimatePresence>
      {sessionFullscreen && liveSession && joinedLiveSession && (
        <SessionFullscreen
          session={liveSession}
          participants={sessionParts}
          phase={sessionPhase.phase}
          round={sessionPhase.round}
          leftMs={sessionPhase.leftMs}
          remainingPct={sessionRemainingPct}
          paused={!!liveSession.pausedAt}
          isHost={liveSession.hostUid === user.uid}
          ringStyle={prefs?.ringStyle || 'default'}
          myFocusMs={myFocusMs}
          onExit={() => setSessionFullscreen(false)}
          onStart={handleStartSession}
          onPause={handlePauseSession}
          onResume={handleResumeSession}
          onSkip={handleSkipPhase}
          onEnd={handleEndSession}
        />
      )}
    </AnimatePresence>
    </div>
  );
}

function FriendRow({ friend, user, online, preview, unread = 0, onOpen }) {
  const { t, formatDate } = useTranslation();
  const fColor = `hsl(${(friend.uid?.charCodeAt(0) * 47 || 0) % 360},60%,50%)`;
  let text = t('groups.startConv');
  if (preview) {
    const who = preview.uid === user.uid ? t('groups.you') : friend.pseudo;
    text = `${who} : ${preview.text}`;
  }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      whileHover={{ background: 'var(--bg-card-hover)' }}
      onClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 12, cursor: 'pointer', background: 'transparent', transition: 'background .12s' }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Avatar name={friend.pseudo} size={48} color={fColor} online={online} photoURL={friend.photoURL || null} />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%', background: '#E74C3C', border: '2px solid var(--bg-base)' }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: '.9rem', fontWeight: unread > 0 ? 800 : 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {friend.pseudo}
          </span>
          {preview?.sentAt && (
            <span style={{ fontSize: '.62rem', color: unread > 0 ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0, fontWeight: unread > 0 ? 700 : 400 }}>
              {formatTime(preview.sentAt, t, formatDate)}
            </span>
          )}
        </div>
        <div style={{ fontSize: '.74rem', color: unread > 0 ? 'var(--text-secondary)' : 'var(--text-muted)', fontWeight: unread > 0 ? 600 : 400, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {text}
        </div>
      </div>
    </motion.div>
  );
}

function PrivateChat({ friend, user, onClose }) {
  const { t, formatDate } = useTranslation();
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const [friendOnline, setFriendOnline] = useState(false);
  const [friendTyping, setFriendTyping] = useState(false);
  const [viewProfile, setViewProfile]   = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const typingRef = useRef(null);
  const isAtBottom = useRef(true);
  const pseudo = user.displayName || user.email?.split('@')[0] || 'Anonyme';
  const convId = convIdFor(user.uid, friend.uid);
  const fColor = `hsl(${(friend.uid?.charCodeAt(0) * 47 || 0) % 360},60%,50%)`;

  // Listen to conversation messages.
  useEffect(() => {
    const q = query(collection(db, 'privateMessages', convId, 'messages'), orderBy('sentAt', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      if (isAtBottom.current) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
    return unsub;
  }, [convId]);

  // Friend presence.
  useEffect(() => {
    const unsub = onValue(dbRef(rtdb, `presence/${friend.uid}`), snap => {
      setFriendOnline(!!snap.val());
    });
    return unsub;
  }, [friend.uid]);

  // Whether the friend is typing.
  useEffect(() => {
    const unsub = onValue(dbRef(rtdb, `privateTyping/${convId}/${friend.uid}`), snap => {
      setFriendTyping(!!snap.val());
    });
    return unsub;
  }, [convId, friend.uid]);

  // Signal that we're typing (cleared after 2s of inactivity).
  function handleTyping() {
    const myRef = dbRef(rtdb, `privateTyping/${convId}/${user.uid}`);
    set(myRef, true);
    onDisconnect(myRef).remove();
    clearTimeout(typingRef.current);
    typingRef.current = setTimeout(() => set(myRef, false), 2000);
  }

  async function send() {
    if (!input.trim() || sending) return;
    setSending(true);
    const sentAt = new Date().toISOString();
    const text = input.trim();
    try {
      await addDoc(collection(db, 'privateMessages', convId, 'messages'), {
        uid: user.uid, pseudo, text, sentAt, reactions: {}
      });
      set(dbRef(rtdb, `privateTyping/${convId}/${user.uid}`), false);
      setInput('');
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (e) { reportSaveError(e); }
    setSending(false);
  }

  async function handleReact(msgId, emoji) {
    const msgRef = doc(db, 'privateMessages', convId, 'messages', msgId);
    const snap = await getDoc(msgRef);
    if (!snap.exists()) return;
    const reactions = { ...(snap.data().reactions || {}) };
    if (reactions[user.uid] === emoji) delete reactions[user.uid];
    else reactions[user.uid] = emoji;
    await updateDoc(msgRef, { reactions });
  }

  async function handleDeleteMsg(msgId) {
    try { await deleteDoc(doc(db, 'privateMessages', convId, 'messages', msgId)); }
    catch (e) { reportSaveError(e); }
  }

  return (
    <div style={{ display: 'flex', gap: 12, height: '76vh' }} className="group-chat-row">
    <motion.div className="group-chat-inner" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-modal)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--card-shadow)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <button aria-label="Retour" onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.1rem', cursor: 'pointer', padding: '4px 6px', borderRadius: 8 }}>←</button>
        <div onClick={() => setViewProfile(true)} style={{ cursor: 'pointer' }}>
          <Avatar name={friend.pseudo} size={36} color={fColor} online={friendOnline} photoURL={friend.photoURL || null} />
        </div>
        <div onClick={() => setViewProfile(true)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
          <div style={{ fontSize: '.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>{friend.pseudo}</div>
          <div style={{ fontSize: '.62rem', color: friendOnline ? '#27AE60' : 'var(--text-muted)' }}>
            {friendOnline ? t('groups.online') : t('groups.offline')}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div onScroll={e => {
        const el = e.currentTarget;
        isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      }}
        style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 1, scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
        {messages.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '2.5rem' }}>💬</span>
            <span style={{ fontSize: '.85rem' }}>{t('groups.startConvWith', { pseudo: friend.pseudo })}</span>
          </div>
        ) : messages.map((m, i) => {
          const isMe = m.uid === user.uid;
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const showAv = prev?.uid !== m.uid;
          const showTm = next?.uid !== m.uid || !next;
          const showDate = !prev || new Date(m.sentAt).toDateString() !== new Date(prev.sentAt).toDateString();
          return (
            <div key={m.id}>
              {showDate && (
                <div style={{ textAlign: 'center', margin: '12px 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: '.62rem', color: 'var(--text-muted)', padding: '2px 10px', background: 'var(--bg-card)', borderRadius: 10 }}>
                    {formatDate(m.sentAt, { weekday: 'long', day: 'numeric', month: 'long' })}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
              )}
              <MessageBubble msg={m} isMe={isMe} showAvatar={showAv} showTime={showTm} onReact={handleReact} onDelete={handleDeleteMsg} />
            </div>
          );
        })}
        <TypingIndicator typingUsers={friendTyping ? [friend.pseudo] : []} />
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <textarea ref={inputRef} value={input}
            onChange={e => { setInput(e.target.value); handleTyping(); }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={t('groups.messagePlaceholder')}
            rows={1}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 12, border: '1px solid var(--border-strong)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.83rem', fontFamily: 'var(--font-family)', resize: 'none', lineHeight: 1.5, boxSizing: 'border-box', maxHeight: 100, overflowY: 'auto', scrollbarWidth: 'none' }} />
        </div>
        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }} onClick={send}
          disabled={!input.trim() || sending}
          style={{ width: 36, height: 36, borderRadius: 10, border: 'none', flexShrink: 0,
            background: input.trim() ? 'linear-gradient(135deg,var(--accent),#6366f1)' : 'var(--bg-card)',
            color: input.trim() ? '#fff' : 'var(--text-muted)', fontSize: '1rem', cursor: input.trim() ? 'pointer' : 'default' }}>
          ➤
        </motion.button>
      </div>
    </motion.div>

    <AnimatePresence>
      {viewProfile && (
        <UserProfileModal targetUid={friend.uid} targetPseudo={friend.pseudo}
          user={user} online={friendOnline}
          onClose={() => setViewProfile(false)} />
      )}
    </AnimatePresence>
    </div>
  );
}

function GroupRow({ group, user, onOpen, unread = 0, session = null }) {
  const { t, formatDate } = useTranslation();
  const memberCount = (group.memberIds || Object.keys(group.members || {})).length;
  const last = group.lastMessage;
  // A session that is gathering or running earns a badge; a finished one does not.
  const sessionPhase = session ? phaseAt(session).phase : 'done';
  const hasLiveSession = sessionPhase !== 'done';

  // Preview text depending on the last message type.
  let preview = t('groups.noMessage');
  if (last) {
    const who = last.uid === user.uid ? t('groups.you') : (last.pseudo || '');
    let body = last.text || '';
    if (last.type === 'poll') body = t('groups.pollPreview');
    else if (last.type === 'focus') body = t('groups.focusPreview');
    else if (last.type === 'sessionEnd') body = t('groups.sessionEndedPreview');
    else if (last.type === 'deck') body = t('groups.deckPreview');
    else if (last.type === 'flashcard') body = t('groups.flashcardPreview');
    preview = who ? `${who} : ${body}` : body;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      whileHover={{ background: 'var(--bg-card-hover)' }}
      onClick={() => onOpen(group)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 12, cursor: 'pointer', background: 'transparent', transition: 'background .12s' }}>

      {/* Group emoji */}
      <div style={{ width: 48, height: 48, borderRadius: 14, flexShrink: 0, position: 'relative',
        background: 'linear-gradient(135deg,var(--accent),#9B59B6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
        {group.emoji || '👥'}
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: '#E74C3C', color: '#fff', fontSize: '.62rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg-base)' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </div>

      {/* Name + preview */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {group.name}
            </span>
            {hasLiveSession && (
              <span title={t('groups.sessionRunningBadge')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
                  padding: '1px 7px 1px 5px', borderRadius: 20, background: 'var(--accent-subtle)' }}>
                <motion.span
                  animate={sessionPhase === 'lobby' ? { opacity: .5 } : { opacity: [1, .25, 1] }}
                  transition={sessionPhase === 'lobby' ? {} : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                    background: sessionPhase === 'break' ? '#27AE60' : 'var(--accent)' }} />
                <span style={{ fontSize: '.58rem', fontWeight: 800, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                  {sessionPhase === 'lobby' ? t('groups.sessionLobbyBadge') : t('groups.sessionRunningBadge')}
                </span>
              </span>
            )}
          </span>
          {last?.sentAt && (
            <span style={{ fontSize: '.62rem', color: 'var(--text-muted)', flexShrink: 0 }}>
              {formatTime(last.sentAt, t, formatDate)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
          <span style={{ fontSize: '.74rem', color: unread > 0 ? 'var(--text-secondary)' : 'var(--text-muted)', fontWeight: unread > 0 ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {preview}
          </span>
          <span style={{ fontSize: '.6rem', color: 'var(--text-muted)', flexShrink: 0 }}>
            {memberCount} 👥
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function CreateGroupModal({ user, onCreated, onClose }) {
  const { t } = useTranslation();
  const [name, setName]   = useState('');
  const [desc, setDesc]   = useState('');
  const [emoji, setEmoji] = useState('👥');
  const [loading, setLoading] = useState(false);
  const emojis = ['👥', '📚', '🎯', '🔬', '💻', '🎨', '🏆', '⚡', '🌟', '🧠'];
  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.83rem', fontFamily: 'var(--font-family)' };

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true);
    const code = generateCode();
    const pseudo = user.displayName || user.email?.split('@')[0] || 'Anonyme';
    const groupId = `${user.uid}_${Date.now()}`;
    try {
      await setDoc(doc(db, 'groups', groupId), {
        id: groupId, name: name.trim(), desc: desc.trim(), emoji, code,
        createdBy: user.uid, createdByPseudo: pseudo,
        createdAt: new Date().toISOString(), typing: {},
        members: { [user.uid]: { pseudo, joinedAt: new Date().toISOString(), photoURL: user.photoURL || null } },
        memberIds: [user.uid]
      });
      onCreated(); onClose();
    } catch (e) { reportSaveError(e); }
    setLoading(false);
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(12px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: .92, y: 20 }} animate={{ scale: 1, y: 0 }}
        style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 20, padding: '1.5rem', width: 400, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '1rem', margin: 0 }}>✨ {t('groups.createGroup')}</h3>
        <div>
          <label style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('groups.icon')}</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {emojis.map(e => (
              <button key={e} onClick={() => setEmoji(e)}
                style={{ width: 36, height: 36, borderRadius: 9, border: `1px solid ${emoji === e ? 'var(--accent)' : 'var(--border)'}`, background: emoji === e ? 'var(--accent-subtle)' : 'transparent', fontSize: '1.1rem', cursor: 'pointer' }}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('groups.name')} *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('groups.namePlaceholder')} style={inp} autoFocus />
        </div>
        <div>
          <label style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('groups.description')}</label>
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder={t('groups.descPlaceholder')} style={inp} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '.82rem' }}>{t('common.cancel')}</button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: .98 }} onClick={handleCreate} disabled={!name.trim() || loading}
            style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none',
              background: name.trim() ? 'linear-gradient(135deg,var(--accent),#6366f1)' : 'var(--bg-card)',
              color: name.trim() ? '#fff' : 'var(--text-muted)', fontWeight: 700, cursor: name.trim() ? 'pointer' : 'default', fontSize: '.82rem' }}>
            {loading ? t('groups.creating') : `✨ ${t('groups.create')}`}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function PageGroups({ user, prefs, unreadByGroup = {}, onMarkRead, pendingConv = null, onConvOpened }) {
  const { t } = useTranslation();
  const tour = useGuidedTour('groups');
  const [groups, setGroups]       = useState([]);
  // Which of my groups currently have a focus session running (for the badges).
  const liveGroupSessions = useLiveGroupSessions(groups.map(g => g.id));
  const [loading, setLoading]     = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [joinCode, setJoinCode]   = useState('');
  const [openGroup, setOpenGroup] = useState(null);
  const [joinError, setJoinError] = useState('');
  const [confirmModal, setConfirmModal] = useState(null); // { title, message, confirmLabel, danger, onConfirm }
  const [tab, setTab] = useState('all'); // 'all' | 'groups' | 'private'
  const [search, setSearch] = useState('');
  const [friends, setFriends] = useState([]);
  const [friendsOnline, setFriendsOnline] = useState({});
  const [openPrivate, setOpenPrivate] = useState(null); // friend we're chatting with
  const [privatePreviews, setPrivatePreviews] = useState({}); // { convId: lastMessage }
  const [lastReadPrivate, setLastReadPrivate] = useState({}); // { convId: ISO last-read date }
  const pseudo = user.displayName || user.email?.split('@')[0] || 'Anonyme';

  // Real-time: only the groups the user is a member of.
  useEffect(() => {
    const q = query(collection(db, 'groups'), where('memberIds', 'array-contains', user.uid));
    const unsub = onSnapshot(q, snap => {
      setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => {
      console.error(err);
      setLoading(false);
    });
    return unsub;
  }, [user.uid]);

  // Kept for compat: manual reload (now a no-op, real-time handles everything).
  function loadGroups() {}

  // Listen to the friend list.
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'friends', user.uid, 'list'), snap => {
      setFriends(snap.docs.map(d => d.data()));
    });
    return unsub;
  }, [user.uid]);

  // Friends presence.
  useEffect(() => {
    const unsub = onValue(dbRef(rtdb, 'presence'), snap => {
      setFriendsOnline(snap.val() || {});
    });
    return unsub;
  }, []);

  // Last message preview of each private conversation.
  useEffect(() => {
    if (!friends.length) { setPrivatePreviews({}); return; }
    const unsubs = friends.map(f => {
      const cid = convIdFor(user.uid, f.uid);
      const qq = query(collection(db, 'privateMessages', cid, 'messages'), orderBy('sentAt', 'desc'), limit(1));
      return onSnapshot(qq, snap => {
        const last = snap.docs[0]?.data() || null;
        setPrivatePreviews(prev => ({ ...prev, [cid]: last }));
      }, () => {});
    });
    return () => unsubs.forEach(u => u());
  }, [friends, user.uid]);

  // Listen to private-conversation last-reads (stored on your user doc).
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'data', 'main'), snap => {
      if (snap.exists()) setLastReadPrivate(snap.data().lastReadPrivate || {});
    });
    return unsub;
  }, [user.uid]);

  // Mark a private conversation as read (when opening it).
  async function markPrivateRead(friendUid) {
    const cid = convIdFor(user.uid, friendUid);
    try {
      await updateDoc(doc(db, 'users', user.uid, 'data', 'main'), {
        [`lastReadPrivate.${cid}`]: new Date().toISOString()
      });
    } catch (e) { reportSaveError(e); }
  }

  // Auto-open a private conversation requested from a profile.
  useEffect(() => {
    if (pendingConv) {
      setOpenPrivate(pendingConv);
      setTab('private');
      if (onConvOpened) onConvOpened();
    }
  }, [pendingConv]);

  // Open a private conversation from a member's profile (inside a group).
  function openConvFromGroup(friend) {
    setOpenGroup(null);
    setOpenPrivate(friend);
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoinError('');
    try {
      const snap = await getDocs(collection(db, 'groups'));
      let found = null;
      snap.forEach(d => { if (d.data().code === code) found = { id: d.id, ...d.data() }; });
      if (!found) { setJoinError(t('groups.invalidCode')); return; }
      if (found.members?.[user.uid]) { setJoinError(t('groups.alreadyMember')); return; }
      await updateDoc(doc(db, 'groups', found.id), {
        [`members.${user.uid}`]: { pseudo, joinedAt: new Date().toISOString(), photoURL: user.photoURL || null },
        memberIds: arrayUnion(user.uid)
      });
      setJoinCode('');
    } catch { setJoinError(t('groups.joinError')); }
  }

  function handleLeave(groupId, groupName) {
    setConfirmModal({
      title: t('groups.leaveGroup'),
      message: t('groups.leaveConfirm', { name: groupName }),
      confirmLabel: t('groups.leave'),
      danger: false,
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, 'groups', groupId), {
            [`members.${user.uid}`]: deleteField(),
            memberIds: arrayRemove(user.uid)
          });
          if (openGroup?.id === groupId) setOpenGroup(null);
        } catch (e) { reportSaveError(e); }
      }
    });
  }

  function handleDelete(groupId) {
    setConfirmModal({
      title: t('groups.deleteGroup'),
      message: t('groups.deleteConfirm'),
      confirmLabel: t('groups.delete'),
      danger: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'groups', groupId));
          if (openGroup?.id === groupId) setOpenGroup(null);
        } catch (e) { reportSaveError(e); }
      }
    });
  }

  if (openPrivate) return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .group-chat-wrapper {
            position: fixed !important;
            inset: 0 !important;
            max-width: none !important;
            margin: 0 !important;
            z-index: 900;
          }
          .group-chat-row { height: 100% !important; }
          .group-chat-inner {
            height: 100% !important;
            border-radius: 0 !important;
            border: none !important;
          }
        }
      `}</style>
      <div className="group-chat-wrapper" style={{ maxWidth: 720, margin: '0 auto', position: 'relative' }}>
        <PrivateChat friend={openPrivate} user={user} onClose={() => setOpenPrivate(null)} />
      </div>
    </>
  );

  if (openGroup) return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .group-chat-wrapper {
            position: fixed !important;
            inset: 0 !important;
            max-width: none !important;
            margin: 0 !important;
            z-index: 900;
          }
          .group-chat-row {
            height: 100% !important;
          }
          .group-chat-inner {
            height: 100% !important;
            border-radius: 0 !important;
            border: none !important;
          }
        }
      `}</style>
      <div className="group-chat-wrapper" style={{ maxWidth: openGroup ? 1040 : 720, margin: '0 auto', position: 'relative', transition: 'max-width .2s' }}>
        <GroupChat group={openGroup} user={user} prefs={prefs} onClose={() => setOpenGroup(null)}
          onLeave={handleLeave} onDelete={handleDelete} onOpenConv={openConvFromGroup} />
      </div>
    </>
  );

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>💬 {t('groups.title')}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <TourButton onClick={tour.start} label={t('common.guidedTour')} />
          {tab === 'groups' && (
            <motion.button data-tour="tour-groups-create" whileHover={{ scale: 1.03 }} whileTap={{ scale: .97 }} onClick={() => setShowCreate(true)}
              style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,var(--accent),#6366f1)', color: '#fff', fontSize: '.82rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px var(--accent-glow)' }}>
              {t('groups.createGroupBtn')}
            </motion.button>
          )}
        </div>
      </div>

      {/* Filter: all / groups / private */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', padding: 4, borderRadius: 12 }}>
        {[
          { v: 'all',     l: t('groups.tabAll') },
          { v: 'groups',  l: t('groups.tabGroups') },
          { v: 'private', l: t('groups.tabPrivate') },
        ].map(tb => (
          <button key={tb.v} onClick={() => setTab(tb.v)}
            style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '.78rem', fontWeight: 500,
              background: tab === tb.v ? 'var(--accent-subtle)' : 'transparent',
              color: tab === tb.v ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {tb.l}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '.85rem', color: 'var(--text-muted)', pointerEvents: 'none' }}>🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t('groups.searchPlaceholder')}
          style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 10, boxSizing: 'border-box', border: '1px solid var(--border-strong)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.83rem', fontFamily: 'var(--font-family)' }} />
        {search && (
          <button onClick={() => setSearch('')}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem' }}>
            ×
          </button>
        )}
      </div>


      {/* Join by code (only in All or Groups) */}
      {(tab === 'all' || tab === 'groups') && (
        <div data-tour="tour-groups-join" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={joinCode} onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder={t('groups.joinPlaceholder')}
              style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: `1px solid ${joinError ? 'rgba(231,76,60,.4)' : 'var(--border-strong)'}`, background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.83rem', letterSpacing: '.05em' }} />
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: .97 }} onClick={handleJoin} disabled={!joinCode.trim()}
              style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--accent-subtle)', color: 'var(--accent)', fontSize: '.82rem', fontWeight: 600, cursor: joinCode.trim() ? 'pointer' : 'default' }}>
              {t('groups.join')}
            </motion.button>
          </div>
          {joinError && <span style={{ fontSize: '.72rem', color: '#E74C3C' }}>{joinError}</span>}
        </div>
      )}

      {/* Unified list sorted by activity */}
      <div data-tour="tour-groups-list">
      {(() => {
        // 1. Normalize groups and private conversations into comparable items.
        const groupItems = groups.map(g => ({
          kind: 'group',
          key: 'g_' + g.id,
          ts: g.lastMessage?.sentAt || g.createdAt || '',
          unread: unreadByGroup[g.id] || 0,
          data: g,
        }));
        const privateItems = friends.map(f => {
          const cid = convIdFor(user.uid, f.uid);
          const prev = privatePreviews[cid];
          const lastRead = lastReadPrivate[cid];
          // Unread if: there's a last message, not from me, sent after my last read (or never read).
          const isUnread = !!prev && prev.uid !== user.uid && (!lastRead || prev.sentAt > lastRead);
          return {
            kind: 'private',
            key: 'p_' + f.uid,
            ts: prev?.sentAt || '',
            unread: isUnread ? 1 : 0,
            data: f,
            preview: prev,
          };
        });

        // 2. Filter by tab.
        let items;
        if (tab === 'all') items = [...groupItems, ...privateItems];
        else if (tab === 'groups') items = groupItems;
        else items = privateItems;

        // 2b. Filter by search (by name).
        const q = search.trim().toLowerCase();
        if (q) {
          items = items.filter(it => {
            const name = it.kind === 'group' ? (it.data.name || '') : (it.data.pseudo || '');
            return name.toLowerCase().includes(q);
          });
        }

        // 3. Sort: unread first, then by last-message date descending.
        items.sort((a, b) => {
          if ((b.unread > 0) !== (a.unread > 0)) return (b.unread > 0) - (a.unread > 0);
          return (b.ts || '').localeCompare(a.ts || '');
        });

        // 4. Loading / empty state.
        if (loading) {
          return <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>{t('common.loading')}</div>;
        }
        if (items.length === 0) {
          return (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 14 }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>{q ? '🔍' : tab === 'private' ? '✉️' : '💬'}</div>
              <div style={{ fontSize: '.88rem' }}>
                {q
                  ? t('groups.noMatch', { search: search.trim() })
                  : tab === 'private'
                  ? t('groups.emptyPrivate')
                  : t('groups.emptyAll')}
              </div>
            </div>
          );
        }

        // 5. Render the list.
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 6 }}>
            {items.map(item => item.kind === 'group' ? (
              <GroupRow key={item.key} group={item.data} user={user} session={liveGroupSessions[item.data.id]}
                unread={item.unread}
                onOpen={(g) => { if (onMarkRead) onMarkRead(g.id); setOpenGroup(g); }} />
            ) : (
              <FriendRow key={item.key} friend={item.data} user={user}
                online={!!friendsOnline[item.data.uid]}
                preview={item.preview}
                unread={item.unread}
                onOpen={() => { markPrivateRead(item.data.uid); setOpenPrivate(item.data); }} />
            ))}
          </div>
        );
      })()}

      <AnimatePresence>
        {showCreate && <CreateGroupModal user={user} onCreated={loadGroups} onClose={() => setShowCreate(false)} />}
      </AnimatePresence>

      </div>

      <AnimatePresence>
        {confirmModal && (
          <ConfirmModal {...confirmModal} onClose={() => setConfirmModal(null)} />
        )}
      </AnimatePresence>

      <GuidedTour active={tour.active} step={tour.step} steps={tour.steps}
        onNext={tour.next} onPrev={tour.prev} onStop={tour.stop} />
    </div>
  );
}