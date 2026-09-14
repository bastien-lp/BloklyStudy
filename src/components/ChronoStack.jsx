/**
 * ChronoStack — the running-timer pills in the top bar.
 * --------------------------------------------------------------------------
 * Two timers can run at once: the solo study timer and a joined group session.
 * Side by side they push the language switcher and the XP pill off narrow
 * screens, so when BOTH are running they stack vertically and shrink instead.
 * With only one running, it looks exactly like the single pill always did.
 *
 * Both pills live here rather than in AppPage so that ticking once a second
 * re-renders this small component only, not the whole authenticated shell.
 */

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Users } from 'lucide-react';
import { useTranslation } from '../i18n';
import { getDraft, subscribeDraft, liveElapsed } from '../focus/focusSession';
import { useGroupSession, fmtLeft } from '../focus/useGroupSession';

/** "MM:SS" (or "H:MM:SS") from seconds. */
function fmtChrono(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Shared shell so both pills shrink together in compact mode. */
function pillStyle(compact, borderColor) {
  return {
    display: 'flex', alignItems: 'center', gap: compact ? 4 : 5,
    padding: compact ? '2px 7px' : '4px 8px',
    borderRadius: 20, border: `1px solid ${borderColor}`,
    background: 'var(--accent-subtle)', cursor: 'pointer',
    color: 'var(--text-primary)', flexShrink: 0,
  };
}

function timeStyle(compact) {
  return {
    fontSize: compact ? '.62rem' : '.7rem', fontWeight: 800,
    fontFamily: 'monospace', letterSpacing: '.02em', whiteSpace: 'nowrap',
  };
}

/** Solo study timer — reads the shared focus-session store. */
function SoloChronoPill({ draft, subjects, compact, onOpen }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const subj = subjects.find(s => String(s.id) === String(draft.subjId));
  // Remaining time — counts DOWN to match the main study timer.
  const remaining = Math.max(0, (draft.totalTime || 0) - liveElapsed(draft, now));
  const dot = compact ? 6 : 7;

  return (
    <motion.button
      initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .9 }}
      whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }}
      onClick={onOpen} title={t('app.studyMode')}
      style={pillStyle(compact, 'var(--accent-glow)')}>
      <motion.span animate={{ opacity: [1, .3, 1] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{ width: dot, height: dot, borderRadius: '50%', background: subj?.color || 'var(--accent)', flexShrink: 0 }} />
      <span style={timeStyle(compact)}>{fmtChrono(remaining)}</span>
    </motion.button>
  );
}

/** Joined group session — green on a break, muted while paused. */
function GroupChronoPill({ session, phase, leftMs, paused, compact, onOpen }) {
  const { t } = useTranslation();
  const color = paused ? 'var(--text-muted)' : phase === 'break' ? '#27AE60' : 'var(--accent)';
  const waiting = phase === 'lobby';
  const dot = compact ? 5 : 6;

  return (
    <motion.button
      initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .9 }}
      whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }}
      onClick={onOpen}
      title={session?.title || t('groups.sessionLive')}
      style={pillStyle(compact, color)}>
      <Users size={compact ? 10 : 11} strokeWidth={2.4} style={{ color, flexShrink: 0 }} />
      <motion.span
        animate={paused || waiting ? { opacity: .4 } : { opacity: [1, .3, 1] }}
        transition={paused || waiting ? {} : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{ width: dot, height: dot, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={timeStyle(compact)}>
        {waiting ? '--:--' : fmtLeft(leftMs)}
      </span>
    </motion.button>
  );
}

export function ChronoStack({ user, activeTab, subjects = [], onOpenStudy, onOpenGroups }) {
  const [draft, setDraftState] = useState(getDraft);
  useEffect(() => subscribeDraft(setDraftState), []);

  const group = useGroupSession(user?.uid);

  // Each pill hides on its own page, where the real timer is already on screen.
  const showSolo = !!draft?.running && activeTab !== 'study';
  const showGroup = group.live && activeTab !== 'groups';
  if (!showSolo && !showGroup) return null;

  const compact = showSolo && showGroup;

  return (
    <div style={{
      display: 'flex',
      flexDirection: compact ? 'column' : 'row',
      alignItems: compact ? 'stretch' : 'center',
      gap: compact ? 3 : 5,
      flexShrink: 0,
    }}>
      {showSolo && (
        <SoloChronoPill draft={draft} subjects={subjects} compact={compact} onOpen={onOpenStudy} />
      )}
      {showGroup && (
        <GroupChronoPill
          session={group.session}
          phase={group.phase}
          leftMs={group.leftMs}
          paused={group.paused}
          compact={compact}
          onOpen={onOpenGroups}
        />
      )}
    </div>
  );
}
