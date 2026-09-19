/**
 * ExternalCalendars — UI for imported (.ics) calendars in the Planning page.
 * --------------------------------------------------------------------------
 * - `CalendarsModal`: add / recolor / remove the user's feeds.
 * - `ExternalEventBlock`: a read-only timed event on the week grid.
 * - `AllDayEventChips`: read-only all-day events pinned to the top of a day column.
 *
 * Data and fetching live in `src/lib/externalCalendars.js`. Imported events are
 * display-only: never draggable, editable, or written into planner `blocks`.
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { CalendarPlus, Trash2, Lock } from 'lucide-react';
import { useTranslation } from '../i18n';
import {
  MAX_CALENDARS, DEFAULT_CALENDAR_COLOR, normalizeIcsUrl, newCalendarId, formatEventTime,
} from '../lib/externalCalendars';

const ERROR_KEYS = {
  fetch_failed: 'planning.calendarErrorFetch',
  parse_failed: 'planning.calendarErrorParse',
  invalid_url: 'planning.calendarErrorUrl',
  too_large: 'planning.calendarErrorTooLarge',
};

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--border-strong)', background: 'var(--bg-input)',
  color: 'var(--text-primary)', fontSize: '.82rem', outline: 'none',
};
const labelStyle = { fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 };
const colorInputStyle = { width: 40, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', flexShrink: 0 };

/** Hostname only — the full URL carries a private token and is never displayed. */
function feedHost(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

/**
 * @param calendars   [{ id, name, url, color }]
 * @param errors      { [calId]: errorCode } from the last worker call
 * @param serviceDown true when the worker itself could not be reached
 * @param onSave      async (nextCalendars) => void
 */
export function CalendarsModal({ calendars, errors, serviceDown, onSave, onClose }) {
  const { t } = useTranslation();
  const [name, setName]   = useState('');
  const [url, setUrl]     = useState('');
  const [color, setColor] = useState(DEFAULT_CALENDAR_COLOR);
  const [urlError, setUrlError] = useState('');
  const [saving, setSaving] = useState(false);

  const full = calendars.length >= MAX_CALENDARS;

  async function persist(next) {
    setSaving(true);
    try { await onSave(next); } finally { setSaving(false); }
  }

  async function addCalendar() {
    const normalized = normalizeIcsUrl(url);
    if (!normalized) { setUrlError(t('planning.calendarInvalidUrl')); return; }
    const label = name.trim() || feedHost(normalized);
    await persist([...calendars, { id: newCalendarId(), name: label.slice(0, 60), url: normalized, color }]);
    setName(''); setUrl(''); setUrlError('');
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(12px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: .94, y: 16 }} animate={{ scale: 1, y: 0 }}
        role="dialog" aria-modal="true" aria-labelledby="calendars-modal-title"
        style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 18,
          padding: '1.5rem', width: 460, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 14 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 id="calendars-modal-title" style={{ color: 'var(--text-primary)', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
            <CalendarPlus size={16} strokeWidth={2.2} /> {t('planning.calendarsTitle')}
          </h3>
          <button aria-label={t('common.close')} onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.3rem', cursor: 'pointer' }}>×</button>
        </div>

        <p style={{ margin: 0, fontSize: '.78rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
          {t('planning.calendarsHint')}
        </p>

        {serviceDown && (
          <div role="status" style={{ fontSize: '.75rem', color: 'var(--danger)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--danger)' }}>
            {t('planning.calendarErrorService')}
          </div>
        )}

        {/* Existing calendars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {calendars.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '.82rem' }}>
              {t('planning.calendarEmpty')}
            </div>
          ) : calendars.map(cal => (
            <div key={cal.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: `3px solid ${cal.color}`, borderRadius: 10 }}>
              <input type="color" value={cal.color} aria-label={t('planning.color')}
                onChange={e => persist(calendars.map(c => c.id === cal.id ? { ...c, color: e.target.value } : c))}
                style={colorInputStyle} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cal.name}</div>
                <div style={{ fontSize: '.62rem', color: errors[cal.id] ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {errors[cal.id] ? t(ERROR_KEYS[errors[cal.id]] || 'planning.calendarErrorFetch') : feedHost(cal.url)}
                </div>
              </div>
              <button onClick={() => persist(calendars.filter(c => c.id !== cal.id))}
                aria-label={t('planning.calendarRemove')} title={t('planning.calendarRemove')} disabled={saving}
                style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid var(--danger)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Trash2 size={13} strokeWidth={2.2} />
              </button>
            </div>
          ))}
        </div>

        {/* Add form */}
        {full ? (
          <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            {t('planning.calendarMax', { count: MAX_CALENDARS })}
          </div>
        ) : (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label htmlFor="ics-url" style={labelStyle}>{t('planning.calendarUrl')} *</label>
              <input id="ics-url" type="url" inputMode="url" autoComplete="off" spellCheck={false}
                value={url} onChange={e => { setUrl(e.target.value); setUrlError(''); }}
                placeholder={t('planning.calendarUrlPlaceholder')} style={inputStyle}
                aria-invalid={!!urlError} aria-describedby={urlError ? 'ics-url-error' : undefined} />
              {urlError && <div id="ics-url-error" style={{ fontSize: '.68rem', color: 'var(--danger)', marginTop: 4 }}>{urlError}</div>}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label htmlFor="ics-name" style={labelStyle}>{t('planning.calendarName')}</label>
                <input id="ics-name" value={name} onChange={e => setName(e.target.value)} maxLength={60}
                  placeholder={t('planning.calendarNamePlaceholder')} style={inputStyle} />
              </div>
              <div>
                <label htmlFor="ics-color" style={labelStyle}>{t('planning.color')}</label>
                <input id="ics-color" type="color" value={color} onChange={e => setColor(e.target.value)} style={colorInputStyle} />
              </div>
            </div>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: .98 }} onClick={addCalendar} disabled={!url.trim() || saving}
              style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '.8rem', fontWeight: 700,
                cursor: !url.trim() || saving ? 'default' : 'pointer', opacity: !url.trim() || saving ? .5 : 1 }}>
              {saving ? '…' : t('common.add')}
            </motion.button>
          </div>
        )}

        <p style={{ margin: 0, fontSize: '.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Lock size={11} strokeWidth={2.2} /> {t('planning.calendarsPrivacy')}
        </p>
      </motion.div>
    </motion.div>
  );
}

/**
 * Read-only timed event positioned on a day column (same PX-per-hour scale as
 * planner blocks). Sits below user blocks (zIndex 1 < 2) so planning over a
 * class stays possible; drops still land because the day column is its ancestor.
 */
export function ExternalEventBlock({ event, color, startH, endH, pxPerHour }) {
  const { t, lang } = useTranslation();
  const from = Math.max(event.fromH, startH);
  const to = Math.min(event.toH, endH);
  if (to <= from) return null;

  const top = (from - startH) * pxPerHour;
  const height = (to - from) * pxPerHour;
  const time = `${formatEventTime(event.start, lang)}–${formatEventTime(event.end, lang)}`;
  const widthPct = 100 / event.lanes;

  return (
    <div title={`${event.title}\n${time}\n${t('planning.calendarReadOnly')}`}
      style={{
        position: 'absolute', top: top + 1, height: height - 2,
        left: `calc(${event.lane * widthPct}% + 2px)`, width: `calc(${widthPct}% - 4px)`,
        background: `${color}2e`, border: `1px dashed ${color}99`, borderLeft: `3px solid ${color}`,
        borderRadius: 8, padding: '3px 6px', overflow: 'hidden', zIndex: 1,
        boxSizing: 'border-box', userSelect: 'none', cursor: 'default',
      }}>
      <div style={{ fontSize: height > 30 ? '.68rem' : '.6rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.25,
        overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: Math.max(1, Math.floor((height - 18) / 14)), WebkitBoxOrient: 'vertical' }}>
        {event.title}
      </div>
      {height > 34 && (
        <div style={{ fontSize: '.56rem', color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap' }}>{time}</div>
      )}
    </div>
  );
}

/** Read-only all-day events stacked at the top of a day column. */
export function AllDayEventChips({ events, colorOf }) {
  const { t } = useTranslation();
  if (!events.length) return null;
  return (
    <div style={{ position: 'absolute', top: 2, left: 2, right: 2, display: 'flex', flexDirection: 'column', gap: 2, zIndex: 3, pointerEvents: 'none' }}>
      {events.map(e => (
        <div key={e.key} title={`${e.title} — ${t('planning.calendarAllDay')}`}
          style={{ pointerEvents: 'auto', fontSize: '.58rem', fontWeight: 700, padding: '2px 6px', borderRadius: 5,
            background: `${colorOf(e.calId)}40`, borderLeft: `3px solid ${colorOf(e.calId)}`, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {e.title}
        </div>
      ))}
    </div>
  );
}
