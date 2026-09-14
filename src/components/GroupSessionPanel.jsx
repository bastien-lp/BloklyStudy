/**
 * GroupSessionPanel — the live session UI inside a group.
 * --------------------------------------------------------------------------
 * Three pieces:
 *   - <NewSessionModal>  : the host configures work / break / rounds + title
 *   - <GroupSessionBar>  : the sticky live bar above the conversation
 *   - <SessionFullscreen>: the immersive view, same dial as the study timer
 *
 * The countdown is derived from the session's absolute timestamps against the
 * shared server clock, so the number on screen is the same for everyone — no
 * counter is ever sent over the wire. See `lib/groupSession.js`.
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { Play, Pause, SkipForward, Square, Maximize2, Minimize2, LogOut, Users, X } from 'lucide-react';
import { Ring } from './Ring';
import { Button } from './ui';
import { useTranslation } from '../i18n';
import { fmtLeft } from '../focus/useGroupSession';
import { SESSION_LIMITS, normalizeProgramme, totalMs } from '../lib/groupSession';

/** Ring diameter for the immersive view, sized to always fit the viewport. */
function computeFocusSize() {
  if (typeof window === 'undefined') return 300;
  const byHeight = window.innerHeight - 220;
  const byWidth = window.innerWidth - 40;
  return Math.round(Math.max(140, Math.min(320, byHeight, byWidth)));
}

/** "1 h 55" / "45 min" from milliseconds. */
function fmtDuration(ms, t) {
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} h${m ? ` ${m}` : ''}` : `${m} ${t('groups.sessionMinutes')}`;
}

const PRESETS = [
  { workMin: 25, breakMin: 5, rounds: 4 },
  { workMin: 50, breakMin: 10, rounds: 2 },
  { workMin: 45, breakMin: 15, rounds: 3 },
];

// ── Creation modal ──────────────────────────────────────────────────────────

export function NewSessionModal({ onClose, onCreate }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [workMin, setWorkMin] = useState(SESSION_LIMITS.workMin.default);
  const [breakMin, setBreakMin] = useState(SESSION_LIMITS.breakMin.default);
  const [rounds, setRounds] = useState(SESSION_LIMITS.rounds.default);
  const [busy, setBusy] = useState(false);

  const programme = normalizeProgramme({ workMin, breakMin, rounds });
  const total = totalMs(programme);

  // Matches the input styling the other group modals use.
  const field = {
    width: '100%', padding: '9px 11px', borderRadius: 10, fontSize: '.82rem', boxSizing: 'border-box',
    background: 'var(--bg-input)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)',
  };
  const label = { fontSize: '.68rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 5, display: 'block' };

  async function submit() {
    if (busy) return;
    setBusy(true);
    try { await onCreate({ title, subject, ...programme }); }
    finally { setBusy(false); }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <motion.div
        initial={{ scale: .94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: .96, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 380, borderRadius: 16, padding: 18,
          background: 'var(--bg-modal)', border: '1px solid var(--border-strong)',
          display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '90vh', overflowY: 'auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '.92rem', fontWeight: 800 }}>{t('groups.sessionNew')}</div>
          <button onClick={onClose} aria-label={t('common.close')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <X size={17} />
          </button>
        </div>

        <div>
          <label style={label} htmlFor="gs-title">{t('groups.sessionTitleLabel')}</label>
          <input id="gs-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={60}
            placeholder={t('groups.sessionTitlePlaceholder')} style={field} autoFocus />
        </div>

        <div>
          <label style={label} htmlFor="gs-subject">{t('groups.sessionSubjectLabel')}</label>
          <input id="gs-subject" value={subject} onChange={e => setSubject(e.target.value)} maxLength={40}
            placeholder={t('groups.sessionSubjectPlaceholder')} style={field} />
        </div>

        <div>
          <span style={label}>{t('groups.sessionPresets')}</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PRESETS.map(p => {
              const active = p.workMin === workMin && p.breakMin === breakMin && p.rounds === rounds;
              return (
                <button key={`${p.workMin}-${p.breakMin}-${p.rounds}`}
                  onClick={() => { setWorkMin(p.workMin); setBreakMin(p.breakMin); setRounds(p.rounds); }}
                  style={{ padding: '6px 11px', borderRadius: 9, cursor: 'pointer', fontSize: '.72rem', fontWeight: 700,
                    background: active ? 'var(--accent-subtle)' : 'var(--bg-card)',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    color: active ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {p.workMin}/{p.breakMin} ×{p.rounds}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <NumberField id="gs-work" label={t('groups.sessionWork')} value={workMin} onChange={setWorkMin}
            limits={SESSION_LIMITS.workMin} suffix={t('groups.sessionMinutes')} />
          <NumberField id="gs-break" label={t('groups.sessionBreak')} value={breakMin} onChange={setBreakMin}
            limits={SESSION_LIMITS.breakMin} suffix={t('groups.sessionMinutes')} />
          <NumberField id="gs-rounds" label={t('groups.sessionRounds')} value={rounds} onChange={setRounds}
            limits={SESSION_LIMITS.rounds} />
        </div>

        <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>
          {t('groups.sessionTotalLength', { duration: fmtDuration(total, t) })}
        </div>
        <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {t('groups.sessionXpHint')}
        </div>

        <Button variant="primary" full icon={Play} onClick={submit} disabled={busy}>
          {t('groups.sessionCreate')}
        </Button>
      </motion.div>
    </motion.div>
  );
}

function NumberField({ id, label, value, onChange, limits, suffix }) {
  return (
    <div>
      <label htmlFor={id} style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, boxSizing: 'border-box',
        background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '6px 8px' }}>
        <input id={id} type="number" inputMode="numeric" min={limits.min} max={limits.max}
          value={value}
          onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          onBlur={e => {
            const n = Number(e.target.value);
            onChange(Number.isFinite(n) ? Math.min(limits.max, Math.max(limits.min, Math.round(n))) : limits.default);
          }}
          style={{ width: '100%', minWidth: 0, background: 'none', border: 'none', outline: 'none',
            color: 'var(--text-primary)', fontSize: '.85rem', fontWeight: 800 }} />
        {suffix && <span style={{ fontSize: '.62rem', color: 'var(--text-muted)', flexShrink: 0 }}>{suffix}</span>}
      </div>
    </div>
  );
}

// ── Shared bits ─────────────────────────────────────────────────────────────

/** Colour of the current phase — focus uses the accent, breaks go green. */
function phaseColor(phase, paused) {
  if (paused || phase === 'lobby') return 'var(--text-muted)';
  return phase === 'break' ? '#27AE60' : 'var(--accent)';
}

function phaseLabel(phase, t) {
  if (phase === 'lobby') return t('groups.sessionWaiting');
  if (phase === 'break') return t('groups.sessionPhaseBreak');
  if (phase === 'done') return t('groups.sessionPhaseDone');
  return t('groups.sessionPhaseWork');
}

/** Avatars of everyone currently in the session. */
function ParticipantRow({ participants, max = 6 }) {
  const { t } = useTranslation();
  const list = Object.entries(participants);
  if (!list.length) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex' }}>
        {list.slice(0, max).map(([uid, p], i) => (
          <span key={uid} title={p.pseudo}
            style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              marginLeft: i === 0 ? 0 : -7, border: '2px solid var(--bg-modal)',
              background: 'var(--accent-subtle)', color: 'var(--accent)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '.6rem', fontWeight: 800 }}>
            {(p.pseudo || '?').slice(0, 1).toUpperCase()}
          </span>
        ))}
      </div>
      <span style={{ fontSize: '.66rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {t('groups.sessionInFocus', { count: list.length })}
      </span>
    </div>
  );
}

/** Pause / skip / end — only rendered for the host. */
function HostControls({ paused, onPause, onResume, onSkip, onEnd, size = 'sm' }) {
  const { t } = useTranslation();
  return (
    <>
      <Button size={size} icon={paused ? Play : Pause} onClick={paused ? onResume : onPause}>
        {paused ? t('groups.sessionResume') : t('groups.sessionPause')}
      </Button>
      <Button size={size} icon={SkipForward} onClick={onSkip}>{t('groups.sessionSkip')}</Button>
      <Button size={size} icon={Square} danger onClick={onEnd}>{t('groups.sessionEnd')}</Button>
    </>
  );
}

// ── Live bar ────────────────────────────────────────────────────────────────

/**
 * The sticky bar above the conversation. Shown to everyone in the group while
 * a session is live — joined or not — so a late arrival can hop in.
 */
export function GroupSessionBar({
  session, participants, phase, round, leftMs, remainingPct, paused, joined, isHost,
  ringStyle, onJoin, onLeave, onStart, onPause, onResume, onSkip, onEnd, onClose, onFullscreen,
}) {
  const { t } = useTranslation();
  if (!session) return null;

  const color = phaseColor(phase, paused);
  const over = phase === 'done';
  const waiting = phase === 'lobby';

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '10px 12px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-modal)' }}>

      {/* Dial + remaining time */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Ring pct={over ? 0 : waiting ? 1 : remainingPct} size={56} stroke={5} color={color}
          running={!paused && !over && !waiting} ringStyle={ringStyle}>
          <span style={{ fontSize: '.62rem', fontWeight: 800, fontFamily: 'monospace', color }}>
            {over ? '00:00' : waiting ? `${session.workMin}′` : fmtLeft(leftMs)}
          </span>
        </Ring>
      </div>

      {/* Identity of the session */}
      <div style={{ flex: 1, minWidth: 130 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {session.title || t('groups.sessionLive')}
          </span>
          <span style={{ fontSize: '.6rem', fontWeight: 800, padding: '2px 7px', borderRadius: 20,
            background: 'var(--accent-subtle)', color }}>
            {paused ? t('groups.sessionPausedBy') : phaseLabel(phase, t)}
          </span>
        </div>
        <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', marginTop: 2 }}>
          {over || waiting
            ? `${t('groups.sessionProgramme', { work: session.workMin, break: session.breakMin, rounds: session.rounds })} · ${t('groups.sessionHostedBy', { pseudo: session.hostPseudo })}`
            : `${t('groups.sessionRoundOf', { round, total: session.rounds })} · ${t('groups.sessionHostedBy', { pseudo: session.hostPseudo })}`}
        </div>
        <div style={{ marginTop: 5 }}>
          <ParticipantRow participants={participants} />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {over ? (
          isHost && <Button size="sm" onClick={onClose}>{t('groups.sessionClose')}</Button>
        ) : waiting ? (
          // Gathering: the countdown only begins when the host presses start.
          <>
            {!joined && <Button size="sm" variant="primary" icon={Users} onClick={onJoin}>{t('groups.sessionJoin')}</Button>}
            {isHost && <Button size="sm" variant="primary" icon={Play} onClick={onStart}>{t('groups.sessionLaunch')}</Button>}
            {isHost && <Button size="sm" icon={Square} danger onClick={onClose}>{t('groups.sessionCancel')}</Button>}
            {joined && !isHost && (
              <Button size="sm" icon={LogOut} variant="ghost" onClick={onLeave}>{t('groups.sessionLeave')}</Button>
            )}
          </>
        ) : joined ? (
          <>
            <Button size="sm" icon={Maximize2} onClick={onFullscreen}>{t('groups.sessionFullscreen')}</Button>
            {isHost && <HostControls paused={paused} onPause={onPause} onResume={onResume} onSkip={onSkip} onEnd={onEnd} />}
            <Button size="sm" icon={LogOut} variant="ghost" onClick={onLeave}>{t('groups.sessionLeave')}</Button>
          </>
        ) : (
          <Button size="sm" variant="primary" icon={Users} onClick={onJoin}>{t('groups.sessionJoin')}</Button>
        )}
      </div>
    </motion.div>
  );
}

// ── Immersive view ──────────────────────────────────────────────────────────

/**
 * Full-screen countdown, mirroring the study timer's focus mode, with the
 * participant list underneath so the room still feels shared.
 */
export function SessionFullscreen({
  session, participants, phase, round, leftMs, remainingPct, paused, isHost, ringStyle,
  myFocusMs, onExit, onStart, onPause, onResume, onSkip, onEnd,
}) {
  const { t } = useTranslation();
  const [size] = useState(computeFocusSize);
  if (!session) return null;

  const color = phaseColor(phase, paused);
  const over = phase === 'done';
  const waiting = phase === 'lobby';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'var(--bg-base)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 18, padding: 20 }}>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '.95rem', fontWeight: 800 }}>{session.title || t('groups.sessionLive')}</div>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 3 }}>
          {over || waiting
            ? phaseLabel(phase, t)
            : `${phaseLabel(phase, t)} · ${t('groups.sessionRoundOf', { round, total: session.rounds })}`}
        </div>
      </div>

      <Ring pct={over ? 0 : waiting ? 1 : remainingPct} size={size} stroke={Math.max(7, Math.round(size * 0.043))}
        color={color} running={!paused && !over && !waiting} ringStyle={ringStyle}>
        <span style={{ fontSize: size * 0.2, fontWeight: 800, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
          {over ? '00:00' : waiting ? fmtLeft(session.workMin * 60000) : fmtLeft(leftMs)}
        </span>
        {paused && !over && (
          <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)', marginTop: 4 }}>
            {t('groups.sessionPausedBy')}
          </span>
        )}
      </Ring>

      <ParticipantRow participants={participants} max={10} />

      <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>
        {t('groups.sessionMyTime', { duration: fmtLeft(myFocusMs) })}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {isHost && waiting && (
          <Button size="md" variant="primary" icon={Play} onClick={onStart}>{t('groups.sessionLaunch')}</Button>
        )}
        {isHost && !over && !waiting && (
          <HostControls paused={paused} onPause={onPause} onResume={onResume} onSkip={onSkip} onEnd={onEnd} size="md" />
        )}
        <Button size="md" icon={Minimize2} onClick={onExit}>{t('groups.sessionExitFullscreen')}</Button>
      </div>
    </motion.div>
  );
}
