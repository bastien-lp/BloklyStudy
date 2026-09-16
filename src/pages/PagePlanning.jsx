/**
 * PagePlanning — Weekly drag & drop study planner (+ month view).
 * --------------------------------------------------------------------------
 * Blocks live in `users/{uid}/data/main` under `blocks` (and a `nid` counter);
 * week templates live in `users/{uid}/data/templates`. A block is either a
 * revision block (tied to a subject) or a custom block (label + color). Blocks
 * carry { day(0-6), hour, dur, status, weekOffset, dateStr, ... } and are
 * positioned on a time grid (PX_H px per hour). Supports drag from the subject
 * sidebar, drag-move, resize, undo/redo, templates, print and a guided tour.
 *
 * Props: { user }
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, onSnapshot, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import MonthView from '../components/MonthView';
import { GuidedTour, useGuidedTour, TourButton } from '../components/GuidedTour';
import {
  Plus, Pencil, BookOpen, Target, CheckSquare, Square, ArrowDown, Trash2,
  ClipboardList, Save, MapPin, Printer, Settings, GraduationCap, Check, RotateCcw, Undo2, Redo2,
} from 'lucide-react';
import { useTranslation } from '../i18n';
import { reportSaveError } from '../lib/notify';

// ── Constants ──
const PX_H     = 56;
const UNDO_MAX = 50;

function getWeekStart(offset = 0) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const mon = new Date(today);
  mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7);
  return mon;
}

/** Capitalize first letter. */
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

/** Compact hour label, locale-aware: FR "08h"/"08h30", else "08:00"/"08:30". */
/** Solid light version of a hex colour (blended 85% with white) — used for the
 *  print grid so blocks have an opaque tint instead of a transparent overlay. */
function printTint(hex) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return '#f0f0f0';
  const mix = c => Math.round(c + (255 - c) * 0.85);
  const to2 = c => c.toString(16).padStart(2, '0');
  return `#${to2(mix(parseInt(h.slice(0, 2), 16)))}${to2(mix(parseInt(h.slice(2, 4), 16)))}${to2(mix(parseInt(h.slice(4, 6), 16)))}`;
}

function fmtH(h, lang) {
  const hh = String(Math.floor(h)).padStart(2, '0');
  if (lang === 'fr') return `${hh}h${h % 1 === 0.5 ? '30' : ''}`;
  return `${hh}:${h % 1 === 0.5 ? '30' : '00'}`;
}

function snapHour(y, top, startH, pxH) {
  const raw = (y - top) / pxH + startH;
  return Math.max(startH, Math.min(24 - 0.5, Math.round(raw * 2) / 2));
}

function findFreeSlot(blocks, newBlock) {
  const same = blocks.filter(b => b.day === newBlock.day && b.weekOffset === newBlock.weekOffset && b.id !== newBlock.id);
  let h = newBlock.hour;
  let tries = 0;
  while (tries < 48) {
    const overlap = same.find(b => h < b.hour + b.dur && h + newBlock.dur > b.hour);
    if (!overlap) return h;
    h = overlap.hour + overlap.dur;
    tries++;
  }
  return newBlock.hour;
}

/** Localized weekday arrays (0=Mon … 6=Sun). 2024-01-01 is a Monday. */
function useDayNames() {
  const { formatDate } = useTranslation();
  const daysShort = useMemo(() => Array.from({ length: 7 }, (_, i) => cap(formatDate(new Date(2024, 0, 1 + i), { weekday: 'short' }).replace(/\.$/, ''))), [formatDate]);
  const daysFull  = useMemo(() => Array.from({ length: 7 }, (_, i) => cap(formatDate(new Date(2024, 0, 1 + i), { weekday: 'long' }))), [formatDate]);
  return { daysShort, daysFull };
}

// ── Block modal (add + edit) ──
function BlockModal({ block, weekStart, subjects, onSave, onClose, mode = 'add' }) {
  const { t, lang } = useTranslation();
  const { daysFull } = useDayNames();
  const [subjId, setSubjId]   = useState(block?.subj || subjects[0]?.id || '');
  const [day, setDay]         = useState(block?.day ?? 0);
  const [hour, setHour]       = useState(block?.hour ?? 8);
  const [dur, setDur]         = useState(block?.dur ?? 2);
  const [task, setTask]       = useState(block?.task || '');
  const [notes, setNotes]     = useState(block?.notes || '');
  const [status, setStatus]   = useState(block?.status || 'todo');
  const [chapSel, setChapSel] = useState(block?.chapters || []);
  const [isCustom, setIsCustom] = useState(block?.type === 'custom');
  const [customLabel, setCustomLabel] = useState(block?.label || '');
  const [customColor, setCustomColor] = useState(block?.color || '#9B59B6');

  const subj = subjects.find(s => s.id === subjId);
  const dateForDay = useMemo(() => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + day); return d;
  }, [weekStart, day]);

  const hours = Array.from({ length: 48 }, (_, i) => i * 0.5);

  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-strong)',
    background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.83rem', fontFamily: 'var(--font-family)', boxSizing: 'border-box', outline: 'none' };

  function handleSave() {
    const b = {
      ...block,
      type: isCustom ? 'custom' : 'rev',
      subj: isCustom ? null : subjId,
      label: isCustom ? customLabel : '',
      color: isCustom ? customColor : (subj?.color || '#4A90D9'),
      day, hour, dur, task, notes, status,
      chapters: chapSel,
      weekOffset: block?.weekOffset ?? 0,
      dateStr: dateForDay.toISOString().slice(0, 10),
    };
    onSave(b);
    onClose();
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(5,5,12,.7)', backdropFilter: 'blur(12px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: .94, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: .94, y: 16 }}
        style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 18,
          padding: '1.5rem', width: 440, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 14, boxShadow: 'var(--card-shadow)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '1rem', margin: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              {mode === 'add' ? <Plus size={15} strokeWidth={2.4} /> : <Pencil size={14} strokeWidth={2.2} />}
              {mode === 'add' ? t('planning.newBlock') : t('planning.editBlock')}
            </span>
          </h3>
          <button aria-label="Fermer" onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.3rem', cursor: 'pointer' }}>×</button>
        </div>

        {/* Type toggle */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', padding: 3, borderRadius: 10, border: '1px solid var(--border)' }}>
          {[{ v: false, Icon: BookOpen, l: t('planning.typeRev') }, { v: true, Icon: Target, l: t('planning.typeCustom') }].map(({ v, Icon, l }) => (
            <button key={String(v)} onClick={() => setIsCustom(v)}
              style={{ flex: 1, padding: '6px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '.78rem', fontWeight: 500,
                background: isCustom === v ? 'var(--accent-subtle)' : 'transparent',
                color: isCustom === v ? 'var(--accent)' : 'var(--text-muted)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <Icon size={13} strokeWidth={2.2} /> {l}
              </span>
            </button>
          ))}
        </div>

        {isCustom ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('planning.label')} *</label>
              <input value={customLabel} onChange={e => setCustomLabel(e.target.value)} placeholder={t('planning.labelPlaceholder')} style={inp} autoFocus />
            </div>
            <div>
              <label style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('planning.color')}</label>
              <input type="color" value={customColor} onChange={e => setCustomColor(e.target.value)}
                style={{ width: 40, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent' }} />
            </div>
          </div>
        ) : (
          <div>
            <label style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('common.subject')}</label>
            <select value={subjId} onChange={e => setSubjId(parseInt(e.target.value, 10))} style={inp}>
              {subjects.map(s => <option key={s.id} value={s.id} style={{ background: 'var(--bg-modal)' }}>{s.name}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('planning.day')}</label>
            <select value={day} onChange={e => setDay(parseInt(e.target.value, 10))} style={inp}>
              {daysFull.map((d, i) => <option key={i} value={i} style={{ background: 'var(--bg-modal)' }}>{d}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('planning.startHour')}</label>
            <select value={hour} onChange={e => setHour(parseFloat(e.target.value))} style={inp}>
              {hours.map(h => <option key={h} value={h} style={{ background: 'var(--bg-modal)' }}>{fmtH(h, lang)}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('planning.duration')}</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[0.5, 1, 1.5, 2, 3, 4, 6].map(d => (
              <button key={d} onClick={() => setDur(d)}
                style={{ padding: '6px 10px', borderRadius: 8,
                  border: `1px solid ${dur === d ? 'var(--accent)' : 'var(--border)'}`,
                  background: dur === d ? 'var(--accent-subtle)' : 'transparent',
                  color: dur === d ? 'var(--accent)' : 'var(--text-muted)', fontSize: '.75rem', cursor: 'pointer' }}>
                {d}h
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('planning.status')}</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {[{ v: 'todo', l: t('planning.todo') }, { v: 'done', l: `✓ ${t('planning.done')}` }].map(({ v, l }) => (
              <button key={v} onClick={() => setStatus(v)}
                style={{ flex: 1, padding: '7px', borderRadius: 8,
                  border: `1px solid ${status === v ? (v === 'done' ? 'rgba(39,174,96,.4)' : 'var(--accent-glow)') : 'var(--border)'}`,
                  background: status === v ? (v === 'done' ? 'rgba(39,174,96,.12)' : 'var(--accent-subtle)') : 'transparent',
                  color: status === v ? (v === 'done' ? 'var(--success)' : 'var(--accent)') : 'var(--text-muted)', fontSize: '.78rem', cursor: 'pointer' }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {!isCustom && subj?.chapters?.length > 0 && (
          <div>
            <label style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('planning.chaptersToStudy')}</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {subj.chapters.map((ch, i) => {
                const sel = chapSel.includes(i);
                return (
                  <button key={i} onClick={() => setChapSel(s => sel ? s.filter(x => x !== i) : [...s, i])}
                    style={{ padding: '5px 8px', borderRadius: 7,
                      border: `1px solid ${sel ? `${subj.color}70` : 'var(--border)'}`,
                      background: sel ? `${subj.color}22` : 'transparent',
                      color: sel ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: '.72rem', cursor: 'pointer', textAlign: 'left' }}>
                    {sel
                      ? <CheckSquare size={13} strokeWidth={2.2} style={{ verticalAlign: '-2px' }} />
                      : <Square size={13} strokeWidth={2.2} style={{ verticalAlign: '-2px' }} />} Ch.{i + 1} — {ch.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            {t('planning.objective')} <span style={{ color: 'rgba(255,255,255,.2)' }}>{t('planning.optionalParen')}</span>
          </label>
          <input value={task} onChange={e => setTask(e.target.value)} placeholder={t('planning.objectivePlaceholder')} style={inp} />
        </div>

        <div>
          <label style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('planning.notes')}</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            style={{ ...inp, resize: 'vertical' }} placeholder={t('planning.notesPlaceholder')} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid rgba(255,255,255,.08)',
              background: 'transparent', color: 'rgba(255,255,255,.4)', cursor: 'pointer', fontSize: '.85rem' }}>
            {t('common.cancel')}
          </button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: .98 }} onClick={handleSave}
            disabled={!isCustom && !subjId}
            style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none', background: '#4A90D9',
              color: '#fff', cursor: 'pointer', fontSize: '.85rem', fontWeight: 700 }}>
            {mode === 'add' ? t('planning.add') : t('common.save')}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Context menu ──
function ContextMenu({ x, y, block, subject, onToggle, onEdit, onDelete, onMove, onClose }) {
  const { t, lang } = useTranslation();
  const ref = useRef(null);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h); };
  }, [onClose]);

  const color = block.type === 'custom' ? (block.color || '#9B59B6') : (subject?.color || '#4A90D9');
  const done = block.status === 'done';

  const items = [
    { Icon: done ? RotateCcw : Check, label: done ? t('planning.markTodo') : t('planning.markDone'), action: () => { onToggle(block.id); onClose(); }, color: '#27AE60' },
    { Icon: Pencil, label: t('common.edit'), action: () => { onEdit(block); onClose(); }, color: '#4A90D9' },
    { Icon: ArrowDown, label: t('planning.moveToFree'), action: () => { onMove(block.id); onClose(); }, color: 'var(--text-secondary)' },
    { Icon: Trash2, label: t('planning.delete'), action: () => { onDelete(block.id); onClose(); }, color: 'var(--danger)' },
  ];

  return (
    <motion.div ref={ref} initial={{ opacity: 0, scale: .92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .92 }}
      style={{ position: 'fixed', left: Math.min(x, window.innerWidth - 200), top: Math.min(y, window.innerHeight - 200),
        zIndex: 2000, background: 'var(--bg-modal)', backdropFilter: 'blur(16px)',
        border: '1px solid var(--border-strong)', borderRadius: 12, padding: '6px', minWidth: 190, boxShadow: 'var(--card-shadow)' }}>
      <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
          <span style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>{block.type === 'custom' ? block.label : (subject?.name || '?')}</span>
        </div>
        <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 2 }}>{fmtH(block.hour, lang)} · {block.dur}h</div>
      </div>
      {items.map((item, i) => (
        <button key={i} onClick={item.action}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px',
            borderRadius: 8, border: 'none', background: 'transparent', color: item.color, fontSize: '.8rem', cursor: 'pointer', textAlign: 'left' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.06)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <item.Icon size={14} strokeWidth={2.2} style={{ flexShrink: 0 }} />
          {item.label}
        </button>
      ))}
    </motion.div>
  );
}

// ── Course block ──
/** Double-tap tolerance: how long between the two taps, and how far apart. */
const DOUBLE_TAP_MS = 450;
const DOUBLE_TAP_PX = 32;

function CourseBlock({ block, subject, onDelete, onToggle, onEdit, onMoveToFree, onResizeStart, isDragging, onDragStart, gridStartH = 0 }) {
  const { lang } = useTranslation();
  const tapRef  = useRef(null); // { t, x, y } of the previous tap
  const longRef = useRef(null);
  const touchToggleRef = useRef(0); // when touch last toggled, to ignore the synthetic dblclick
  const dragStartRef = useRef(null);
  const [ctxMenu, setCtxMenu] = useState(null);

  const color = block.type === 'custom' ? (block.color || '#9B59B6') : (subject?.color || '#4A90D9');
  const done = block.status === 'done';

  function handleContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX || e.touches?.[0]?.clientX || 200, y: e.clientY || e.touches?.[0]?.clientY || 200 });
  }

  function handleDoubleClick(e) {
    e.preventDefault(); e.stopPropagation();
    // A touch double-tap makes the browser synthesise a dblclick a moment
    // later. Without this guard it toggled a second time and undid the first,
    // which is why validating a block on mobile looked unreliable.
    if (Date.now() - touchToggleRef.current < 900) return;
    onToggle(block.id);
  }

  // Touch: double-tap = toggle, long press = context menu.
  //
  // The window is measured between the two touchstarts and used to be 300 ms,
  // which is shorter than a comfortable double tap — hence the misses. It is
  // now 450 ms, and the two taps must land close together so that a drag or
  // two deliberate taps on different blocks never count as one gesture.
  function handleTouchStart(e) {
    const now = Date.now();
    const touch = e.touches[0];
    const here = { x: touch.clientX, y: touch.clientY };

    longRef.current = setTimeout(() => {
      setCtxMenu({ x: here.x, y: here.y });
      longRef.current = null;
    }, 500);

    const prev = tapRef.current;
    const quick = prev && now - prev.t < DOUBLE_TAP_MS;
    const close = prev && Math.hypot(here.x - prev.x, here.y - prev.y) < DOUBLE_TAP_PX;

    if (quick && close) {
      clearTimeout(longRef.current);
      longRef.current = null;
      tapRef.current = null;
      touchToggleRef.current = now;
      // Confirm the toggle physically: on a small block the visual change is
      // easy to miss, and a silent miss is what makes a gesture feel broken.
      navigator.vibrate?.(15);
      onToggle(block.id);
    } else {
      tapRef.current = { t: now, ...here };
    }
  }
  function handleTouchEnd() { if (longRef.current) { clearTimeout(longRef.current); longRef.current = null; } }

  const blockH = Math.max(PX_H * 0.5, block.dur * PX_H);
  const top = (block.hour - gridStartH) * PX_H;

  return (
    <>
      <div
        onPointerDown={e => { dragStartRef.current = { x: e.clientX, y: e.clientY }; onDragStart(e, block); }}
        onPointerMove={e => {
          const s = dragStartRef.current;
          if (s && longRef.current && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) { clearTimeout(longRef.current); longRef.current = null; }
        }}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          position: 'absolute', top: top + 1, left: 2, right: 2, height: blockH - 2,
          background: done ? `${color}28` : `${color}dd`,
          borderRadius: 8, padding: '4px 7px',
          cursor: isDragging ? 'grabbing' : 'grab',
          overflow: 'hidden', opacity: isDragging ? 0.35 : 1,
          border: `1px solid ${done ? `${color}50` : `${color}bb`}`,
          boxShadow: done ? 'none' : `0 2px 8px ${color}30`,
          transition: 'box-shadow .2s,opacity .15s,background .2s',
          zIndex: 2, userSelect: 'none', touchAction: 'none',
        }}
      >
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '2px 4px' }}>
          <div style={{ fontSize: blockH > 40 ? '.82rem' : blockH > 25 ? '.72rem' : '.62rem', fontWeight: 800,
            color: done ? `${color}80` : '#fff',
            textDecoration: done ? 'line-through' : 'none',
            textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: blockH > 50 ? 2 : 1, WebkitBoxOrient: 'vertical' }}>
            {block.type === 'custom' ? block.label : (subject?.name || '?')}
          </div>
          {blockH > 42 && (
            <div style={{ fontSize: '.6rem', color: done ? `${color}60` : 'rgba(255,255,255,.75)', fontWeight: 500 }}>
              {fmtH(block.hour, lang)}–{fmtH(block.hour + block.dur, lang)}
            </div>
          )}
        </div>
        {/* Resize handle — stops pointerdown so it doesn't start a block drag */}
        <div onPointerDown={e => e.stopPropagation()}
          onMouseDown={e => { e.stopPropagation(); onResizeStart(e, block); }}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 7,
            cursor: 'ns-resize', background: 'rgba(0,0,0,.1)', borderRadius: '0 0 8px 8px', touchAction: 'none' }} />
      </div>

      <AnimatePresence>
        {ctxMenu && (
          <ContextMenu x={ctxMenu.x} y={ctxMenu.y} block={block} subject={subject}
            onToggle={onToggle} onEdit={onEdit} onDelete={onDelete}
            onMove={onMoveToFree} onClose={() => setCtxMenu(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

// ── Templates modal ──
function TemplatesModal({ blocks, wkOff, onApply, onClose, user }) {
  const { t, formatDate } = useTranslation();
  const [templates, setTemplates] = useState([]);
  const [tplName, setTplName]     = useState('');
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid, 'data', 'templates')).then(snap => {
      if (snap.exists()) setTemplates(snap.data().savedTemplates || []);
    });
  }, [user]);

  async function saveTemplate() {
    if (!tplName.trim()) return;
    setSaving(true);
    const weekBlocks = blocks.filter(b => b.weekOffset === wkOff);
    const tpl = { id: Date.now(), name: tplName.trim(), blocks: weekBlocks, createdAt: new Date().toISOString() };
    const updated = [...templates, tpl];
    setTemplates(updated);
    await setDoc(doc(db, 'users', user.uid, 'data', 'templates'), { savedTemplates: updated });
    setTplName('');
    setSaving(false);
  }

  async function deleteTemplate(id) {
    const updated = templates.filter(tp => tp.id !== id);
    setTemplates(updated);
    await setDoc(doc(db, 'users', user.uid, 'data', 'templates'), { savedTemplates: updated });
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(12px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: .94, y: 16 }} animate={{ scale: 1, y: 0 }}
        style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 18,
          padding: '1.5rem', width: 460, maxWidth: '100%', maxHeight: '80vh', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ color: 'var(--text-primary)', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
            <ClipboardList size={16} strokeWidth={2.2} /> {t('planning.templatesTitle')}
          </h3>
          <button aria-label="Fermer" onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.3rem', cursor: 'pointer' }}>×</button>
        </div>

        {/* Save current week */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Save size={13} strokeWidth={2.2} /> {t('planning.saveCurrentWeek')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={tplName} onChange={e => setTplName(e.target.value)}
              placeholder={t('planning.templateName')}
              style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-strong)',
                background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.82rem', outline: 'none' }} />
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: .97 }} onClick={saveTemplate} disabled={!tplName.trim() || saving}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer' }}>
              {saving ? '…' : t('planning.saveBtn')}
            </motion.button>
          </div>
        </div>

        {/* Templates list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {templates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '.82rem' }}>
              {t('planning.noTemplates')}
            </div>
          ) : templates.map(tp => (
            <div key={tp.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>{tp.name}</div>
                <div style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>
                  {t('planning.blocksCount', { count: tp.blocks.length })} · {formatDate(tp.createdAt)}
                </div>
              </div>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: .97 }}
                onClick={() => { onApply(tp.blocks); onClose(); }}
                style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer' }}>
                {t('planning.apply')}
              </motion.button>
              <button onClick={() => deleteTemplate(tp.id)}
                aria-label={t('planning.delete')}
                style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid var(--danger)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={13} strokeWidth={2.2} />
              </button>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Unified pointer-based drag for the planner — works with both mouse and touch
 * (the previous native HTML5 drag-and-drop ignored touchscreens entirely and
 * was flaky elsewhere). A drag only starts once the pointer moves past a small
 * threshold, so taps/clicks still work; drop targets are the day columns tagged
 * with `data-plan-day`, resolved via elementFromPoint so the same code serves
 * the mobile (single column) and desktop (7 columns) layouts.
 *
 * @param startHRef ref to the grid's first hour (kept fresh by the caller)
 * @param onDropRef ref to onDrop(src, { day, hour }) (kept fresh by the caller)
 * @returns { drag, startDrag } — `drag` is the live drag ({ src, hover, x, y,
 *          label, color }) or null; `startDrag(e, src, opts)` arms a drag on
 *          pointerdown (opts: { label, color, onEnd }).
 */
function usePointerDrag(startHRef, onDropRef) {
  const [drag, setDrag] = useState(null);
  const pending = useRef(null);

  useEffect(() => {
    function findTarget(x, y) {
      const el = document.elementFromPoint(x, y);
      const col = el && el.closest ? el.closest('[data-plan-day]') : null;
      if (!col) return null;
      const day = parseInt(col.getAttribute('data-plan-day'), 10);
      if (Number.isNaN(day)) return null;
      const rect = col.getBoundingClientRect();
      return { day, hour: snapHour(y, rect.top, startHRef.current, PX_H) };
    }
    function onMove(e) {
      const p = pending.current;
      if (!p) return;
      if (!p.active) {
        if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < 8) return;
        p.active = true;
      }
      e.preventDefault();
      setDrag({ src: p.src, hover: findTarget(e.clientX, e.clientY), x: e.clientX, y: e.clientY, label: p.label, color: p.color });
    }
    function onUp(e) {
      const p = pending.current;
      pending.current = null;
      if (p && p.active) {
        const target = findTarget(e.clientX, e.clientY);
        if (target) onDropRef.current(p.src, target);
      }
      setDrag(null);
      if (p && p.onEnd) p.onEnd();
    }
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [startHRef, onDropRef]);

  const startDrag = useCallback((e, src, opts = {}) => {
    if (typeof e.button === 'number' && e.button !== 0) return; // left button / touch / pen only
    pending.current = { src, startX: e.clientX, startY: e.clientY, active: false, ...opts };
  }, []);

  return { drag, startDrag };
}

// ── Page ──
export default function PagePlanning({ user }) {
  const { t, lang, formatDate } = useTranslation();
  const { daysShort, daysFull } = useDayNames();
  const [subjects, setSubjects] = useState([]);
  const [blocks, setBlocks]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [wkOff, setWkOff]       = useState(0);
  const [view, setView]         = useState('week');

  // Time-window settings.
  const [startH, setStartH] = useState(0);
  const [endH, setEndH]     = useState(24);
  const [showSettings, setShowSettings] = useState(false);

  // Undo/redo.
  const undoStack = useRef([]);
  const redoStack = useRef([]);

  // Drag & drop.
  // Modals.
  const [addModal, setAddModal]         = useState(null);
  const [editBlock, setEditBlock]       = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const nidRef  = useRef(1000);
  const gridRef = useRef(null);
  const TOTAL_H = endH - startH;
  const GRID_H  = TOTAL_H * PX_H;

  const tour = useGuidedTour('planning');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  const [mobileDay, setMobileDay] = useState(() => new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);

  const fmtRange = d => formatDate(d, { day: 'numeric', month: 'short' });

  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 640); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'data', 'main'), snap => {
      if (snap.exists()) {
        const d = snap.data();
        setSubjects(d.subjects || []);
        setBlocks(d.blocks || []);
        if (d.nid) nidRef.current = d.nid;
        if (typeof d.planningStartH === 'number') setStartH(d.planningStartH);
        if (typeof d.planningEndH === 'number') setEndH(d.planningEndH);
      }
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const save = useCallback(async (b) => {
    if (!user) return;
    try { await updateDoc(doc(db, 'users', user.uid, 'data', 'main'), { blocks: b, nid: nidRef.current }); }
    catch (e) { reportSaveError(e, 'Planning — save'); }
  }, [user]);

  function snapshot() { return JSON.parse(JSON.stringify(blocks)); }

  function pushUndo() {
    undoStack.current.push(snapshot());
    if (undoStack.current.length > UNDO_MAX) undoStack.current.shift();
    redoStack.current = [];
  }

  function undo() {
    if (!undoStack.current.length) return;
    redoStack.current.push(snapshot());
    const snap = undoStack.current.pop();
    setBlocks(snap); save(snap);
  }

  function redo() {
    if (!redoStack.current.length) return;
    undoStack.current.push(snapshot());
    const snap = redoStack.current.pop();
    setBlocks(snap); save(snap);
  }

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const weekStart = useMemo(() => getWeekStart(wkOff), [wkOff]);
  const weekEnd   = useMemo(() => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + 6); return d; }, [weekStart]);
  const todayStr  = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toDateString(); }, []);

  const currentWeekBlocks = useMemo(() =>
    blocks.filter(b => b.weekOffset === wkOff ||
      (b.dateStr && (() => {
        const ws = weekStart;
        for (let i = 0; i < 7; i++) { const d = new Date(ws); d.setDate(ws.getDate() + i); if (d.toISOString().slice(0, 10) === b.dateStr) return true; }
        return false;
      })())
    ), [blocks, wkOff, weekStart]);

  const dayLoads = useMemo(() => {
    const loads = Array(7).fill(0);
    currentWeekBlocks.forEach(b => { if (b.status !== 'done') loads[b.day] += b.dur; });
    return loads;
  }, [currentWeekBlocks]);

  // ── Actions ──
  function addBlock(b) {
    pushUndo();
    const targetDate = new Date(weekStart); targetDate.setDate(weekStart.getDate() + b.day);
    const id = nidRef.current++;
    const newB = { ...b, id, weekOffset: wkOff, dateStr: targetDate.toISOString().slice(0, 10) };
    newB.hour = findFreeSlot(blocks, newB);
    const updated = [...blocks, newB];
    setBlocks(updated); save(updated);
  }

  function updateBlock(b) {
    pushUndo();
    const targetDate = new Date(weekStart); targetDate.setDate(weekStart.getDate() + b.day);
    const updated = blocks.map(x => x.id === b.id ? { ...b, weekOffset: wkOff, dateStr: targetDate.toISOString().slice(0, 10) } : x);
    setBlocks(updated); save(updated);
  }

  function deleteBlock(id) {
    pushUndo();
    const updated = blocks.filter(b => b.id !== id);
    setBlocks(updated); save(updated);
  }

  function toggleBlock(id) {
    pushUndo();
    const updated = blocks.map(b => b.id === id ? { ...b, status: b.status === 'done' ? 'todo' : 'done' } : b);
    setBlocks(updated); save(updated);
  }

  function moveBlock(id, newDay, newHour) {
    pushUndo();
    const targetDate = new Date(weekStart); targetDate.setDate(weekStart.getDate() + newDay);
    const b = blocks.find(x => x.id === id);
    if (!b) return;
    const moved = { ...b, day: newDay, hour: newHour, weekOffset: wkOff, dateStr: targetDate.toISOString().slice(0, 10) };
    moved.hour = findFreeSlot(blocks, moved);
    const updated = blocks.map(x => x.id === id ? moved : x);
    setBlocks(updated); save(updated);
  }

  // ── Pointer drag-and-drop (mouse + touch) ──
  // Drop a dragged source onto a { day, hour } target: a subject creates a
  // revision block, the custom chip opens the add modal, a block moves.
  function handleDrop(src, target) {
    if (src.type === 'pre') addBlock({ type: 'rev', subj: src.id, dur: 2, task: '', notes: '', status: 'todo', day: target.day, hour: target.hour, chapters: [] });
    else if (src.type === 'custom') setAddModal({ day: target.day, hour: target.hour, isCustom: true });
    else if (src.type === 'block') moveBlock(src.id, target.day, target.hour);
  }
  const startHRef = useRef(startH);
  const onDropRef = useRef(handleDrop);
  // Keep the refs the drag hook reads fresh (updated after each commit, so a
  // drop always sees the latest hour window and block list).
  useEffect(() => { startHRef.current = startH; onDropRef.current = handleDrop; });
  const { drag, startDrag } = usePointerDrag(startHRef, onDropRef);
  const dragSrc        = drag?.src || null;
  const dragHover      = drag?.hover || null;
  const draggingBlockId = dragSrc?.type === 'block' ? dragSrc.id : null;

  function moveToFree(id) {
    pushUndo();
    const b = blocks.find(x => x.id === id); if (!b) return;
    const h = findFreeSlot(blocks.filter(x => x.id !== id), b);
    const updated = blocks.map(x => x.id === id ? { ...x, hour: h } : x);
    setBlocks(updated); save(updated);
  }

  function applyTemplate(tplBlocks) {
    pushUndo();
    const existing = blocks.filter(b => b.weekOffset !== wkOff);
    const newBlocks = tplBlocks.map(b => ({ ...b, id: nidRef.current++, weekOffset: wkOff,
      dateStr: (() => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + (b.day || 0)); return d.toISOString().slice(0, 10); })(),
    }));
    const updated = [...existing, ...newBlocks];
    setBlocks(updated); save(updated);
  }

  function handleResizeStart(e, block) {
    e.preventDefault();
    const startY = e.clientY, startDur = block.dur;
    let cur = startDur;
    function onMove(ev) {
      const next = Math.max(0.5, Math.round((startDur + (ev.clientY - startY) / PX_H) * 2) / 2);
      if (next !== cur) { cur = next; setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, dur: next } : b)); }
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setBlocks(prev => { save(prev); return prev; });
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function printPlanning() { window.print(); }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <motion.div animate={{ opacity: [.3, 1, .3] }} transition={{ duration: 1.5, repeat: Infinity }}
        style={{ color: 'rgba(255,255,255,.4)', fontSize: '.9rem' }}>{t('planning.loadingPlanning')}</motion.div>
    </div>
  );

  const sidebarInline = !isMobile;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'var(--font-family)', color: 'var(--text-primary)' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8 }}>
        {/* View */}
        <div data-tour="tour-planning-view" style={{ display: 'flex', background: 'var(--bg-card)', padding: 3, borderRadius: 10, border: '1px solid var(--border)' }}>
          {[{ v: 'week', l: t('planning.week') }, { v: 'month', l: t('planning.month') }].map(({ v, l }) => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '.78rem', fontWeight: 600,
                background: view === v ? 'var(--accent-alpha, rgba(74,144,217,.18))' : 'transparent',
                color: view === v ? 'var(--accent, #93c5fd)' : 'var(--text-secondary)',
                boxShadow: view === v ? 'inset 0 0 0 1px var(--accent-border, rgba(74,144,217,.35))' : 'none', transition: 'all .2s' }}>
              {l}
            </button>
          ))}
        </div>

        {/* Week navigation */}
        <div data-tour="tour-planning-nav" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }} onClick={() => setWkOff(w => w - 1)}
            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</motion.button>
          <div style={{ padding: '5px 12px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', minWidth: 140, textAlign: 'center' }}>
            <span style={{ fontSize: '.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              {fmtRange(weekStart)} – {fmtRange(weekEnd)}
            </span>
          </div>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }} onClick={() => setWkOff(w => w + 1)}
            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>→</motion.button>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: .97 }} onClick={() => setWkOff(0)}
            style={{ padding: '5px 10px', borderRadius: 8,
              border: `1px solid ${wkOff === 0 ? 'rgba(74,144,217,.5)' : 'rgba(74,144,217,.2)'}`,
              background: wkOff === 0 ? 'rgba(74,144,217,.15)' : 'rgba(74,144,217,.06)',
              color: wkOff === 0 ? '#93c5fd' : 'rgba(74,144,217,.6)', fontSize: '.72rem', cursor: 'pointer', fontWeight: 600 }}>
            <MapPin size={14} strokeWidth={2.4} />
          </motion.button>
        </div>

        {/* Tools */}
        <div data-tour="tour-planning-tools" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <motion.button aria-label={t('a11y.undo')} whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }} onClick={undo}
            disabled={!undoStack.current.length} title={t('planning.undoTitle')}
            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.85rem', opacity: undoStack.current.length ? 1 : .4 }}><Undo2 size={15} strokeWidth={2} /></motion.button>
          <motion.button aria-label={t('a11y.redo')} whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }} onClick={redo}
            disabled={!redoStack.current.length} title={t('planning.redoTitle')}
            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.85rem', opacity: redoStack.current.length ? 1 : .4 }}><Redo2 size={15} strokeWidth={2} /></motion.button>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }} onClick={() => setShowTemplates(true)}
            title={t('planning.templatesTitleShort')}
            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.82rem' }}><ClipboardList size={15} strokeWidth={2} /></motion.button>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }} onClick={printPlanning}
            title={t('planning.printTitle')}
            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.82rem' }}><Printer size={15} strokeWidth={2} /></motion.button>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }} onClick={() => setShowSettings(s => !s)}
            title={t('planning.settingsTitle')}
            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)',
              background: showSettings ? 'var(--accent-subtle)' : 'var(--bg-card)',
              color: showSettings ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.82rem' }}><Settings size={15} strokeWidth={2} /></motion.button>
          <TourButton onClick={tour.start} label={t('common.guidedTour')} align='center' />
        </div>
      </div>

      {/* Time settings */}
      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{t('planning.timeRange')}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.4)' }}>{t('planning.start')}</label>
                <select value={startH} onChange={e => { const v = parseInt(e.target.value, 10); setStartH(v); if (user) updateDoc(doc(db, 'users', user.uid, 'data', 'main'), { planningStartH: v }).catch(() => {}); }}
                  style={{ padding: '4px 8px', borderRadius: 7, border: '1px solid var(--border-strong)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.78rem', outline: 'none' }}>
                  {Array.from({ length: 24 }, (_, i) => <option key={i} value={i} style={{ background: 'var(--bg-modal)' }}>{i}{lang === 'fr' ? 'h00' : ':00'}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.4)' }}>{t('planning.end')}</label>
                <select value={endH} onChange={e => { const v = parseInt(e.target.value, 10); setEndH(v); if (user) updateDoc(doc(db, 'users', user.uid, 'data', 'main'), { planningEndH: v }).catch(() => {}); }}
                  style={{ padding: '4px 8px', borderRadius: 7, border: '1px solid var(--border-strong)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.78rem', outline: 'none' }}>
                  {Array.from({ length: 24 }, (_, i) => <option key={i + 1} value={i + 1} style={{ background: 'var(--bg-modal)' }}>{i + 1}{lang === 'fr' ? 'h00' : ':00'}</option>)}
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Month view ── */}
      {view === 'month' ? (
        <MonthView blocks={blocks} subjects={subjects}
          onAddBlock={day => {
            const dow = day.getDay();
            const mon = new Date(day); mon.setDate(day.getDate() - (dow === 0 ? 6 : dow - 1));
            const diff = Math.round((day - mon) / 86400000);
            const off = Math.round((mon - getWeekStart(0)) / (7 * 86400000));
            setWkOff(off); setView('week');
            setAddModal({ day: diff, hour: 9 });
          }}
          onToggleBlock={toggleBlock}
          onDeleteBlock={deleteBlock}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {isMobile ? (
            /* ── Mobile view: single day ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* 7-day selector */}
              <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                {daysShort.map((d, i) => {
                  const date = new Date(weekStart); date.setDate(weekStart.getDate() + i);
                  const isToday = date.toDateString() === todayStr;
                  const hasBlocks = currentWeekBlocks.filter(b => b.day === i).length > 0;
                  return (
                    <button key={i} onClick={() => setMobileDay(i)}
                      style={{ flex: 1, padding: '8px 2px', border: 'none',
                        borderRight: i < 6 ? '1px solid var(--border)' : 'none', cursor: 'pointer',
                        background: mobileDay === i ? 'var(--accent-subtle)' : 'transparent',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, transition: 'background .15s' }}>
                      <span style={{ fontSize: '.6rem', fontWeight: 700, color: mobileDay === i ? 'var(--accent)' : isToday ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {d}
                      </span>
                      <span style={{ fontSize: '.55rem', color: mobileDay === i ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {date.getDate()}
                      </span>
                      {hasBlocks && (
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: mobileDay === i ? 'var(--accent)' : 'var(--border-strong)' }} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Subjects — tap to add */}
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
                {subjects.map(s => (
                  <button key={s.id}
                    onClick={() => addBlock({ type: 'rev', subj: s.id, dur: 1, task: '', notes: '', status: 'todo', day: mobileDay, hour: 9, chapters: [] })}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                      borderRadius: 20, background: `${s.color}15`, border: `1px solid ${s.color}40`,
                      cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                    <span style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</span>
                  </button>
                ))}
                <button
                  onClick={() => setAddModal({ day: mobileDay, hour: 9, isCustom: true })}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                    borderRadius: 20, background: 'rgba(155,89,182,.1)', border: '1px dashed rgba(155,89,182,.4)',
                    cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '.72rem', color: 'rgba(155,89,182,.9)' }}>
                    <Target size={12} strokeWidth={2.2} /> {t('planning.typeCustom')}
                  </span>
                </button>
              </div>

              {/* 1-column grid */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <button onClick={() => setMobileDay(d => Math.max(0, d - 1))} disabled={mobileDay === 0}
                    style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)',
                      background: 'var(--bg-card)', cursor: mobileDay === 0 ? 'not-allowed' : 'pointer',
                      color: mobileDay === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: mobileDay === 0 ? .4 : 1 }}>←</button>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{daysFull[mobileDay]}</div>
                    <div style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>
                      {fmtRange(new Date(weekStart.getTime() + mobileDay * 86400000))}
                    </div>
                  </div>
                  <button onClick={() => setMobileDay(d => Math.min(6, d + 1))} disabled={mobileDay === 6}
                    style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)',
                      background: 'var(--bg-card)', cursor: mobileDay === 6 ? 'not-allowed' : 'pointer',
                      color: mobileDay === 6 ? 'var(--text-muted)' : 'var(--text-primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: mobileDay === 6 ? .4 : 1 }}>→</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr', overflowY: 'auto', maxHeight: '62vh' }}>
                  <div style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                    {Array.from({ length: TOTAL_H }, (_, i) => (
                      <div key={i} style={{ height: PX_H, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingRight: 3, paddingTop: 2, borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                        <span style={{ fontSize: '.5rem', color: 'var(--text-muted)' }}>{startH + i}{lang === 'fr' ? 'h' : ':00'}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ position: 'relative', height: GRID_H }} data-plan-day={mobileDay}>
                    {Array.from({ length: TOTAL_H }, (_, i) => (
                      <div key={i} style={{ position: 'absolute', top: i * PX_H, left: 0, right: 0, borderTop: `1px solid ${i % 2 === 0 ? 'var(--border-strong)' : 'var(--border)'}`, pointerEvents: 'none' }} />
                    ))}
                    {dragHover?.day === mobileDay && (
                      <div style={{ position: 'absolute', top: (dragHover.hour - startH) * PX_H, left: 2, right: 2, height: 2 * PX_H, background: 'rgba(74,144,217,.12)', border: '2px dashed rgba(74,144,217,.4)', borderRadius: 8, pointerEvents: 'none', zIndex: 1 }} />
                    )}
                    {currentWeekBlocks.filter(b => b.day === mobileDay).map(b => (
                      <CourseBlock key={b.id} block={b}
                        subject={subjects.find(s => s.id === b.subj)}
                        onDelete={deleteBlock} onToggle={toggleBlock} onEdit={setEditBlock}
                        onMoveToFree={moveToFree} onResizeStart={handleResizeStart}
                        isDragging={draggingBlockId === b.id}
                        gridStartH={startH}
                        onDragStart={(e, bl) => startDrag(e, { type: 'block', id: bl.id }, { label: bl.type === 'custom' ? bl.label : (subjects.find(s => s.id === bl.subj)?.name || '?'), color: bl.type === 'custom' ? (bl.color || '#9B59B6') : (subjects.find(s => s.id === bl.subj)?.color || '#4A90D9') })}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: .97 }}
                onClick={() => setAddModal({ day: mobileDay, hour: 9 })}
                style={{ width: '100%', padding: '11px', borderRadius: 10, border: '1px dashed var(--accent)', background: 'var(--accent-subtle)', color: 'var(--accent)', fontSize: '.82rem', fontWeight: 700, cursor: 'pointer' }}>
                + {t('planning.addBlockDay')}
              </motion.button>
            </div>

          ) : (
            /* ── Desktop view: sidebar + 7 columns ── */
            <div style={{ display: 'flex', flexDirection: sidebarInline ? 'row' : 'column', gap: 12, alignItems: 'start' }}>
            {/* Sidebar */}
            <div data-tour="tour-planning-sidebar" style={{
              display: 'flex', flexDirection: sidebarInline ? 'column' : 'row',
              flexWrap: sidebarInline ? 'nowrap' : 'wrap', gap: 6, flexShrink: 0,
              width: sidebarInline ? 156 : '100%',
              background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '10px', borderRadius: 12,
            }}>
              {!sidebarInline && <div style={{ width: '100%', fontSize: '.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>{t('planning.dragDown')}</div>}
              {sidebarInline && <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{t('planning.subjects')}</div>}
              {subjects.map(s => (
                <div key={s.id}
                  onPointerDown={e => startDrag(e, { type: 'pre', id: s.id }, { label: s.name, color: s.color })}
                  style={{ display: 'flex', alignItems: 'center', gap: 7,
                    padding: sidebarInline ? '8px 10px' : '6px 10px', borderRadius: 9,
                    background: `${s.color}22`, border: `1px solid ${s.color}60`, cursor: 'grab', flexShrink: 0,
                    minWidth: sidebarInline ? 'auto' : 80, touchAction: 'none' }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '.76rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: sidebarInline ? 100 : 120 }}>{s.name}</span>
                </div>
              ))}
              {/* Custom block */}
              <div
                onPointerDown={e => startDrag(e, { type: 'custom' }, { label: t('planning.customBlock'), color: '#9B59B6' })}
                style={{ display: 'flex', alignItems: 'center', gap: 7,
                  padding: sidebarInline ? '8px 10px' : '6px 10px', borderRadius: 9, background: 'rgba(155,89,182,.2)',
                  border: '1px dashed rgba(155,89,182,.55)', cursor: 'grab', flexShrink: 0, touchAction: 'none' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.76rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  <Target size={13} strokeWidth={2.2} /> {t('planning.customBlock')}
                </span>
              </div>

              {/* Shortcut legend — desktop only */}
              {sidebarInline && (
                <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {[['Ctrl+Z', t('planning.legUndo')], ['Ctrl+Y', t('planning.legRedo')], [t('planning.legDblClick'), t('planning.legDone')], [t('planning.legRightClick'), t('planning.legMenu')]].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <code style={{ fontSize: '.6rem', background: 'var(--bg-card-hover)', padding: '1px 5px', borderRadius: 4, color: 'var(--text-secondary)' }}>{k}</code>
                      <span style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Grid */}
            <div data-tour="tour-planning-grid" style={{ flex: 1, overflow: 'auto', maxHeight: '75vh', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-strong)' }}>
              <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: `40px repeat(7,minmax(88px,1fr))`, minWidth: 680 }}>

                {/* Corner header — sticky top+left */}
                <div style={{ borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', height: 46, background: 'var(--bg-nav)', position: 'sticky', top: 0, left: 0, zIndex: 10 }} />

                {/* Day headers — sticky top */}
                {daysShort.map((d, i) => {
                  const date = new Date(weekStart); date.setDate(weekStart.getDate() + i);
                  const isToday = date.toDateString() === todayStr;
                  const examSubj = subjects.find(s => {
                    if (!s.date) return false;
                    const sd = new Date(s.date); sd.setHours(0, 0, 0, 0);
                    return sd.toDateString() === date.toDateString();
                  });
                  return (
                    <div key={i} style={{
                      background: examSubj ? 'rgba(241,196,15,.18)' : isToday ? 'var(--accent-subtle)' : 'var(--bg-nav)',
                      borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                      textAlign: 'center', padding: '6px 2px', height: 46,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      position: 'sticky', top: 0, zIndex: 9, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
                      <div style={{ fontSize: '.74rem', fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--accent)' : examSubj ? '#F1C40F' : 'var(--text-primary)' }}>
                        {d}
                      </div>
                      <div style={{ fontSize: '.58rem', color: isToday ? '#4A90D9' : examSubj ? '#F1C40F' : 'rgba(255,255,255,.4)', marginTop: 1 }}>
                        {fmtRange(date)}
                      </div>
                      {examSubj && (
                        <div style={{ fontSize: '.5rem', color: '#F1C40F', fontWeight: 700, background: 'rgba(241,196,15,.2)', borderRadius: 4, padding: '1px 4px', marginTop: 1 }}>
                          <GraduationCap size={9} strokeWidth={2.6} style={{ verticalAlign: '-1px' }} /> {examSubj.name.slice(0, 8)}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Hour column — sticky left */}
                <div style={{ position: 'sticky', left: 0, zIndex: 8, borderRight: '1px solid var(--border)', background: 'var(--bg-nav)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
                  {Array.from({ length: TOTAL_H }, (_, i) => (
                    <div key={i} style={{ position: 'absolute', top: i * PX_H, right: 3, fontSize: '.58rem', color: 'var(--text-muted)', lineHeight: 1, paddingTop: 2 }}>
                      {startH + i}:00
                    </div>
                  ))}
                  <div style={{ height: GRID_H }} />
                </div>

                {/* Day columns */}
                {daysShort.map((_, dayIdx) => {
                  const date = new Date(weekStart); date.setDate(weekStart.getDate() + dayIdx);
                  const isToday = date.toDateString() === todayStr;
                  const examSubj = subjects.find(s => {
                    if (!s.date) return false;
                    const sd = new Date(s.date); sd.setHours(0, 0, 0, 0);
                    return sd.toDateString() === date.toDateString();
                  });
                  const dayBlocks = currentWeekBlocks.filter(b => b.day === dayIdx);
                  const timeNow = new Date();
                  const nowH = isToday ? timeNow.getHours() + timeNow.getMinutes() / 60 : null;

                  return (
                    <div key={dayIdx} data-plan-day={dayIdx}
                      style={{ position: 'relative', height: GRID_H,
                        borderRight: '1px solid rgba(255,255,255,.07)',
                        background: examSubj ? 'rgba(241,196,15,.04)' : isToday ? 'rgba(74,144,217,.025)' : 'transparent' }}>

                      {/* Hour lines */}
                      {Array.from({ length: TOTAL_H }, (_, i) => (
                        <div key={i} style={{ position: 'absolute', top: i * PX_H, left: 0, right: 0, borderTop: `1px solid ${i % 2 === 0 ? 'var(--border-strong)' : 'var(--border)'}`, pointerEvents: 'none' }} />
                      ))}

                      {/* Half-hours */}
                      {Array.from({ length: TOTAL_H }, (_, i) => (
                        <div key={'h' + i} style={{ position: 'absolute', top: i * PX_H + PX_H / 2, left: 0, right: 0, borderTop: '1px dashed var(--border)', pointerEvents: 'none', opacity: .5 }} />
                      ))}

                      {/* Ghost preview */}
                      {dragHover?.day === dayIdx && (
                        <div style={{ position: 'absolute',
                          top: (dragHover.hour - startH) * PX_H, left: 2, right: 2,
                          height: (dragSrc?.type === 'block' ? blocks.find(b => b.id === dragSrc.id)?.dur || 2 : 2) * PX_H,
                          background: 'rgba(74,144,217,.12)', border: '2px dashed rgba(74,144,217,.4)', borderRadius: 8, pointerEvents: 'none', zIndex: 1 }} />
                      )}

                      {/* Current-time line */}
                      {nowH && nowH >= startH && nowH <= endH && (
                        <div style={{ position: 'absolute', top: (nowH - startH) * PX_H, left: 0, right: 0, height: 2, background: '#E74C3C', zIndex: 20, boxShadow: '0 0 8px rgba(231,76,60,.5)' }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#E74C3C', position: 'absolute', left: -3, top: -2 }} />
                        </div>
                      )}

                      {/* Hover + button */}
                      <div className="add-btn-hover" style={{ position: 'absolute', bottom: 6, right: 4, opacity: 0, transition: 'opacity .2s', zIndex: 5 }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '0'}>
                      </div>

                      {/* Blocks */}
                      {dayBlocks.map(b => (
                        <CourseBlock key={b.id} block={b}
                          subject={subjects.find(s => s.id === b.subj)}
                          onDelete={deleteBlock} onToggle={toggleBlock}
                          onEdit={setEditBlock} onMoveToFree={moveToFree}
                          onResizeStart={handleResizeStart}
                          isDragging={draggingBlockId === b.id}
                          gridStartH={startH}
                          onDragStart={(e, bl) => startDrag(e, { type: 'block', id: bl.id }, { label: bl.type === 'custom' ? bl.label : (subjects.find(s => s.id === bl.subj)?.name || '?'), color: bl.type === 'custom' ? (bl.color || '#9B59B6') : (subjects.find(s => s.id === bl.subj)?.color || '#4A90D9') })}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          )}{/* end mobile/desktop ternary */}

          {/* Week load */}
          <div style={{ display: 'flex', gap: 10 }}>
            {!isMobile && sidebarInline && <div style={{ width: 156, flexShrink: 0 }} />}
            <div data-tour="tour-planning-charge" style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px' }}>
              <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>{t('planning.weekLoad')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
                {daysShort.map((d, i) => {
                  const load = dayLoads[i];
                  const pct = Math.min(load / 10, 1);
                  const color = pct > .8 ? '#E74C3C' : pct > .5 ? '#F1C40F' : '#27AE60';
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 4px', borderRadius: 9, background: `${color}10`, border: `1px solid ${color}25` }}>
                      <span style={{ fontSize: '.65rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{d}</span>
                      <div style={{ width: '100%', height: 4, background: 'var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ width: `${pct * 100}%`, height: '100%', background: color, borderRadius: 10, transition: 'width .3s' }} />
                      </div>
                      <span style={{ fontSize: '.68rem', fontWeight: 700, color }}>{load}h</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {addModal && subjects.length > 0 && (
          <BlockModal mode="add"
            block={{ day: addModal.day, hour: addModal.hour, type: addModal.isCustom ? 'custom' : 'rev',
              subj: subjects[0]?.id, dur: 2, task: '', notes: '', status: 'todo', chapters: [] }}
            weekStart={weekStart} subjects={subjects}
            onSave={addBlock} onClose={() => setAddModal(null)} />
        )}
        {editBlock && (
          <BlockModal mode="edit" block={editBlock}
            weekStart={weekStart} subjects={subjects}
            onSave={updateBlock} onClose={() => setEditBlock(null)} />
        )}
        {showTemplates && (
          <TemplatesModal blocks={blocks} weekStart={weekStart} wkOff={wkOff}
            subjects={subjects} user={user}
            onApply={applyTemplate} onClose={() => setShowTemplates(false)} />
        )}
      </AnimatePresence>

      <GuidedTour
        active={tour.active}
        step={tour.step}
        steps={tour.steps}
        onNext={tour.next}
        onPrev={tour.prev}
        onStop={tour.stop}
      />

      {/* Drag ghost — follows the pointer/finger while dragging */}
      {drag && (
        <div style={{ position: 'fixed', left: drag.x, top: drag.y, transform: 'translate(-50%,-130%)',
          zIndex: 9999, pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 10, background: `${drag.color || '#4A90D9'}ee`, color: '#fff',
          fontSize: '.76rem', fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,.35)', whiteSpace: 'nowrap' }}>
          {drag.label || t('planning.newBlock')}
        </div>
      )}

      {/* Print-only view — full-page weekly time grid (hidden on screen).
          Hours down the left, days across the top, hour/half-hour ruling kept,
          blocks positioned in their slots with the user's subject colours. */}
      {(() => {
        // Height per hour (mm) chosen so the whole window roughly fills a
        // landscape page, whatever the user's start/end hour window.
        const printHourMm = Math.max(6, Math.min(24, 176 / Math.max(1, TOTAL_H)));
        const bodyH = `${TOTAL_H * printHourMm}mm`;
        const dayCol = (dayIdx) => currentWeekBlocks.filter(b => b.day === dayIdx).sort((a, b) => a.hour - b.hour);
        return (
          <div className="blokly-planning-print">
            <div style={{ fontSize: 13, fontWeight: 700, color: '#000', marginBottom: '2mm' }}>
              Blokly Study — {t('app.tabPlanning')} · {fmtRange(weekStart)} – {fmtRange(weekEnd)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '11mm repeat(7, 1fr)', width: '100%', border: '1px solid #999' }}>
              {/* Header row: corner + 7 day headers */}
              <div style={{ borderRight: '1px solid #999', borderBottom: '1px solid #999', height: '9mm' }} />
              {daysFull.map((d, i) => {
                const date = new Date(weekStart); date.setDate(weekStart.getDate() + i);
                return (
                  <div key={'h' + i} style={{ borderRight: i < 6 ? '1px solid #999' : 'none', borderBottom: '1px solid #999',
                    height: '9mm', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    background: '#eee', color: '#000', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
                    <span style={{ fontSize: '9pt', fontWeight: 700 }}>{d}</span>
                    <span style={{ fontSize: '7pt', color: '#555' }}>{fmtRange(date)}</span>
                  </div>
                );
              })}

              {/* Hour column */}
              <div style={{ position: 'relative', height: bodyH, borderRight: '1px solid #999' }}>
                {Array.from({ length: TOTAL_H }, (_, i) => (
                  <div key={i} style={{ position: 'absolute', top: `${i * printHourMm}mm`, right: '1mm', fontSize: '7pt', color: '#444', lineHeight: 1 }}>
                    {startH + i}h
                  </div>
                ))}
              </div>

              {/* 7 day columns with hour ruling + blocks */}
              {daysFull.map((_, dayIdx) => (
                <div key={'d' + dayIdx} style={{ position: 'relative', height: bodyH, borderRight: dayIdx < 6 ? '1px solid #ccc' : 'none' }}>
                  {/* Hour lines (solid) + half-hours (dashed) */}
                  {Array.from({ length: TOTAL_H }, (_, i) => (
                    <div key={i}>
                      <div style={{ position: 'absolute', top: `${i * printHourMm}mm`, left: 0, right: 0, borderTop: '1px solid #ccc' }} />
                      <div style={{ position: 'absolute', top: `${(i + 0.5) * printHourMm}mm`, left: 0, right: 0, borderTop: '1px dotted #e5e5e5' }} />
                    </div>
                  ))}
                  {/* Blocks */}
                  {dayCol(dayIdx).map(b => {
                    const subj = subjects.find(s => s.id === b.subj);
                    const name = b.type === 'custom' ? (b.label || '—') : (subj?.name || '?');
                    const col = b.type === 'custom' ? (b.color || '#9B59B6') : (subj?.color || '#4A90D9');
                    const h = b.dur * printHourMm;
                    return (
                      <div key={b.id} style={{ position: 'absolute', top: `${(b.hour - startH) * printHourMm}mm`, height: `${Math.max(h, 4)}mm`,
                        left: '0.5mm', right: '0.5mm', overflow: 'hidden', borderRadius: '2px', padding: '0.5mm 1mm',
                        background: b.status === 'done' ? '#f3f3f3' : printTint(col), borderLeft: `3px solid ${col}`,
                        printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
                        <div style={{ fontSize: '7.5pt', fontWeight: 700, color: '#000', lineHeight: 1.1,
                          textDecoration: b.status === 'done' ? 'line-through' : 'none' }}>{name}{b.status === 'done' ? ' ✓' : ''}</div>
                        {h > 8 && <div style={{ fontSize: '6.5pt', color: '#555' }}>{fmtH(b.hour, lang)}–{fmtH(b.hour + b.dur, lang)}</div>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Print + hover CSS */}
      <style>{`
        .blokly-planning-print { display: none; }
        @media print {
          @page { size: landscape; margin: 8mm; }
          body * { visibility: hidden; }
          .blokly-planning-print, .blokly-planning-print * { visibility: visible; }
          .blokly-planning-print { display: block !important; position: absolute; left: 0; top: 0; width: 100%; background: #fff;
            -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        div[style*="add-btn-hover"]:hover { opacity:1 !important; }
      `}</style>
    </div>
  );
}