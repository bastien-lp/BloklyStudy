/**
 * MonthView — the planner's month grid.
 * --------------------------------------------------------------------------
 * Every cell has the SAME height and its content is clipped: a busy day makes
 * its entries scroll behind a "+N", it never stretches its whole week. That is
 * what the view was missing — cells grew to fit their text, rows went out of
 * step and everything ended up too small to read.
 *
 * One entry is one line: a colour bar, the time, and the name. Blocks and
 * imported calendar events are merged and sorted by time, so a day reads like
 * a schedule and not like two separate lists.
 *
 * Clicking a day opens the panel on the right, which is where the full detail
 * and the actions live.
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GraduationCap, Plus } from 'lucide-react';
import { useTranslation } from '../i18n';
import { formatDuration } from '../lib/duration';
import { eventsForDay, formatEventTime, DEFAULT_CALENDAR_COLOR } from '../lib/externalCalendars';

/** How many entries a cell shows before the rest becomes "+N". */
const MAX_ENTRIES = 3;
/** Cell height, fixed so a heavy day never stretches its week. */
const CELL_H = 108;

/** Imported events of a day, all-day first then by start time. */
function externalForDay(events, day) {
  const { timed, allDay } = eventsForDay(events, day);
  return [...allDay, ...timed.sort((a, b) => a.start - b.start)];
}

function hm(h) {
  const hh=Math.floor(h), mm=String(Math.round((h%1)*60)).padStart(2,'0');
  return `${hh}h${mm!=='00'?mm:''}`;
}

/**
 * One line of a day cell. The colour is carried by a bar on the left rather
 * than by a filled background: three tinted rectangles in a small cell is
 * exactly what made the grid unreadable.
 */
function Entry({ color, time, label, done, dashed, title }) {
  return (
    <div title={title || label}
      style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, height: 17, flexShrink: 0,
        padding: '0 4px 0 0', borderRadius: 4, background: done ? 'transparent' : `${color}1f`,
        borderLeft: `3px ${dashed ? 'dashed' : 'solid'} ${color}`, opacity: done ? .55 : 1 }}>
      {time && (
        <span className="month-entry-time" style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0,
          fontVariantNumeric: 'tabular-nums', paddingLeft: 4 }}>
          {time}
        </span>
      )}
      <span style={{ fontSize: '.66rem', fontWeight: 600, minWidth: 0, color: 'var(--text-primary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        textDecoration: done ? 'line-through' : 'none', paddingLeft: time ? 0 : 4 }}>
        {label}
      </span>
    </div>
  );
}

export default function MonthView({ blocks, subjects, onAddBlock, onToggleBlock, onDeleteBlock, externalEvents = [], calendarColorOf = () => DEFAULT_CALENDAR_COLOR }) {
  const { t, lang, formatDate } = useTranslation();
  const [monthOff, setMonthOff] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);

  const today = useMemo(() => { const d=new Date(); d.setHours(0,0,0,0); return d; }, []);

  // Localized Monday-first weekday headers, derived from the active locale so
  // they follow the language switch (fr/en/es/de) instead of being hardcoded.
  // 2024-01-01 is a Monday, so seven consecutive days give Mon…Sun.
  const dayHeaders = useMemo(
    () => Array.from({ length: 7 }, (_, i) =>
      formatDate(new Date(2024, 0, 1 + i), { weekday: 'short' })),
    [formatDate]
  );

  const monthStart = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + monthOff, 1);
    return d;
  }, [monthOff, today]);

  const monthEnd = useMemo(() => {
    return new Date(monthStart.getFullYear(), monthStart.getMonth()+1, 0);
  }, [monthStart]);

  // Grille : commence le lundi de la semaine du 1er du mois
  const gridStart = useMemo(() => {
    const d = new Date(monthStart);
    const dow = d.getDay();
    d.setDate(d.getDate() - (dow===0 ? 6 : dow-1));
    return d;
  }, [monthStart]);

  const gridDays = useMemo(() => {
    const days = [];
    const d = new Date(gridStart);
    // On affiche 6 semaines max
    for (let i=0; i<42; i++) {
      days.push(new Date(d));
      d.setDate(d.getDate()+1);
    }
    return days;
  }, [gridStart]);

  // Blocks par dateStr
  const blocksByDate = useMemo(() => {
    const map = {};
    blocks.forEach(b => {
      const key = b.dateStr;
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(b);
    });
    return map;
  }, [blocks]);

  // Examens par date
  const examsByDate = useMemo(() => {
    const map = {};
    subjects.forEach(s => {
      if (s.date) map[s.date] = [...(map[s.date]||[]), s];
    });
    return map;
  }, [subjects]);

  const selectedDateStr = selectedDay?.toISOString().slice(0,10);
  const selectedBlocks  = selectedDateStr ? (blocksByDate[selectedDateStr]||[]) : [];
  const selectedExams   = selectedDateStr ? (examsByDate[selectedDateStr]||[]) : [];
  const selectedExternal = useMemo(
    () => selectedDay ? externalForDay(externalEvents, selectedDay) : [],
    [externalEvents, selectedDay]
  );

  // Ne pas afficher la 6ème semaine si vide
  const weeksToShow = useMemo(() => {
    const lastDay = gridDays[41];
    if (lastDay < monthStart || lastDay > monthEnd) {
      // Check si la 6ème semaine a des jours du mois
      const week6 = gridDays.slice(35);
      const hasMonthDays = week6.some(d => d.getMonth()===monthStart.getMonth());
      return hasMonthDays ? 6 : 5;
    }
    return 6;
  }, [gridDays, monthStart, monthEnd]);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <style>{`
        .month-layout { display: grid; gap: 12px; align-items: start; }
        @media (max-width: 760px) {
          .month-layout { grid-template-columns: 1fr !important; }
          .month-entry-time { display: none; }
          .month-day { height: 92px !important; }
        }
      `}</style>

      {/* Header mois */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
        <motion.button whileHover={{scale:1.05}} whileTap={{scale:.95}}
          onClick={()=>setMonthOff(m=>m-1)}
          style={{ width:32,height:32,borderRadius:9,border:'1px solid var(--border)',
            background:'var(--bg-card)',color:'var(--text-secondary)',cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center' }}>←</motion.button>

        <div style={{ padding:'6px 20px',borderRadius:10,background:'var(--bg-card)',
          border:'1px solid var(--border)',minWidth:180,textAlign:'center' }}>
          <span style={{ fontSize:'.88rem',fontWeight:700,color:'var(--text-primary)',textTransform:'capitalize' }}>
            {formatDate(monthStart, { month: 'long', year: 'numeric' })}
          </span>
        </div>

        <motion.button whileHover={{scale:1.05}} whileTap={{scale:.95}}
          onClick={()=>setMonthOff(m=>m+1)}
          style={{ width:32,height:32,borderRadius:9,border:'1px solid var(--border)',
            background:'var(--bg-card)',color:'var(--text-secondary)',cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center' }}>→</motion.button>

        <motion.button whileHover={{scale:1.03}} whileTap={{scale:.97}}
          onClick={()=>setMonthOff(0)}
          style={{ padding:'6px 12px',borderRadius:9,
            border:`1px solid ${monthOff===0?'rgba(74,144,217,.4)':'rgba(74,144,217,.2)'}`,
            background:monthOff===0?'rgba(74,144,217,.15)':'rgba(74,144,217,.06)',
            color:monthOff===0?'#93c5fd':'rgba(74,144,217,.7)',
            fontSize:'.75rem',cursor:'pointer',fontWeight:600 }}>
          📍 {t('common.today')}
        </motion.button>
      </div>

      <div className="month-layout" style={{ gridTemplateColumns: selectedDay ? '1fr 280px' : '1fr' }}>

        {/* Grille calendrier */}
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>

          {/* En-têtes jours */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid var(--border)' }}>
            {dayHeaders.map((d,di)=>(
              <div key={di} style={{ padding:'8px 4px', textAlign:'center', fontSize:'.7rem',
                fontWeight:700, color:'var(--text-muted)', letterSpacing:'.04em', textTransform:'capitalize' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Semaines */}
          {Array.from({length:weeksToShow}).map((_,wi) => (
            <div key={wi} style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)',
              borderBottom: wi<weeksToShow-1 ? '1px solid var(--border)' : 'none' }}>
              {gridDays.slice(wi*7, wi*7+7).map((day,di) => {
                const dateStr   = day.toISOString().slice(0,10);
                const isToday   = day.toDateString()===today.toDateString();
                const isMonth   = day.getMonth()===monthStart.getMonth();
                const isSelected= selectedDay?.toDateString()===day.toDateString();
                const dayBlocks = blocksByDate[dateStr]||[];
                const dayExams  = examsByDate[dateStr]||[];
                const dayExternal = externalForDay(externalEvents, day);
                // Blocks and imported events in one list, in the order of the day.
                const entries = [
                  ...dayBlocks.map(b => ({
                    key: `b${b.id}`, sort: Number(b.hour) || 0, time: hm(b.hour),
                    label: subjects.find(s => s.id === b.subj)?.name || '?',
                    color: subjects.find(s => s.id === b.subj)?.color || '#4A90D9',
                    done: b.status === 'done',
                    title: `${hm(b.hour)} · ${subjects.find(s => s.id === b.subj)?.name || '?'}${b.task ? ` · ${b.task}` : ''}`,
                  })),
                  ...dayExternal.map(e => ({
                    key: `e${e.key}`, sort: e.allDay ? -1 : e.start.getHours() + e.start.getMinutes() / 60,
                    time: e.allDay ? '' : formatEventTime(e.start, lang),
                    label: e.title, color: calendarColorOf(e.calId), dashed: true, title: e.title,
                  })),
                ].sort((a, b) => a.sort - b.sort);
                const hiddenCount = Math.max(0, entries.length - MAX_ENTRIES);

                return (
                  <motion.div key={di}
                    whileHover={{ background:'rgba(255,255,255,.05)' }}
                    onClick={()=>setSelectedDay(isSelected?null:day)}
                    className="month-day"
                    style={{ height: CELL_H, boxSizing: 'border-box', overflow: 'hidden', padding:'5px 5px 4px', cursor:'pointer',
                      borderRight: di<6 ? '1px solid var(--border)' : 'none',
                      background: isSelected ? 'var(--accent-subtle)' : isToday ? 'var(--accent-subtle)' : 'transparent',
                      outline: isSelected ? '1px solid var(--accent)' : isToday ? '1px solid var(--accent-glow)' : 'none',
                      transition:'background .15s' }}>

                    {/* Numéro du jour */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:'.78rem', fontWeight: isToday?800:600,
                        color: isToday?'var(--accent)' : isMonth?'var(--text-primary)':'var(--text-muted)',
                        width:22, height:22, borderRadius:'50%',
                        background: isToday?'var(--accent-subtle)':'transparent',
                        display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {day.getDate()}
                      </span>
                      {dayExams.length>0 && (
                        <span title={dayExams.map(e=>e.name).join(', ')} aria-label={dayExams.map(e=>e.name).join(', ')}
                          style={{ display:'inline-flex', alignItems:'center', gap:3, background:'rgba(231,76,60,.18)',
                            color:'#ff6b6b', borderRadius:6, padding:'1px 5px', fontSize:'.58rem', fontWeight:800 }}>
                          <GraduationCap size={11} strokeWidth={2.4} aria-hidden="true" />
                          {dayExams.length > 1 ? dayExams.length : ''}
                        </span>
                      )}
                    </div>

                    {/* The day, one line per entry */}
                    <div style={{ display:'flex', flexDirection:'column', gap:2, minHeight:0 }}>
                      {entries.slice(0, MAX_ENTRIES).map(e => (
                        <Entry key={e.key} color={e.color} time={e.time} label={e.label}
                          done={e.done} dashed={e.dashed} title={e.title} />
                      ))}
                      {hiddenCount>0 && (
                        <div style={{ fontSize:'.6rem', fontWeight:700, color:'var(--text-muted)', paddingLeft:7 }}>
                          {t('planning.monthAndMore', { count: hiddenCount })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Panneau latéral jour sélectionné */}
        <AnimatePresence>
          {selectedDay && (
            <motion.div initial={{opacity:0,x:16}} animate={{opacity:1,x:0}} exit={{opacity:0,x:16}}
              style={{ background:'var(--bg-card)', border:'1px solid var(--border)',
                borderRadius:14, padding:'1rem', display:'flex', flexDirection:'column', gap:10,
                position:'sticky', top:80 }}>

              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontSize:'.88rem', fontWeight:700, color:'var(--text-primary)' }}>
                    {formatDate(selectedDay, { weekday: 'long', day: 'numeric', month: 'long' })}
                  </div>
                  {selectedExams.length>0 && (
                    <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:'.65rem', color:'#ff6b6b', marginTop:2 }}>
                      <GraduationCap size={12} strokeWidth={2.4} aria-hidden="true" />
                      {selectedExams.map(e=>e.name).join(', ')}
                    </div>
                  )}
                </div>
                <button onClick={()=>setSelectedDay(null)}
                  style={{ background:'transparent',border:'none',color:'var(--text-muted)',
                    fontSize:'1.1rem',cursor:'pointer' }}>×</button>
              </div>

              {/* Imported calendar events (read-only) */}
              {selectedExternal.length>0 && (
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {selectedExternal.map(e => {
                    const color = calendarColorOf(e.calId);
                    return (
                      <div key={e.key} title={t('planning.calendarReadOnly')}
                        style={{ padding:'6px 10px', borderRadius:9, background:`${color}14`,
                          border:`1px dashed ${color}66`, borderLeft:`3px solid ${color}` }}>
                        <div style={{ fontSize:'.74rem', fontWeight:600, color:'var(--text-primary)',
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {e.title}
                        </div>
                        <div style={{ fontSize:'.6rem', color:'var(--text-muted)', marginTop:2 }}>
                          {e.allDay ? t('planning.calendarAllDay') : `${formatEventTime(e.start, lang)}–${formatEventTime(e.end, lang)}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Blocs du jour */}
              <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:320, overflowY:'auto' }}>
                {selectedBlocks.length===0 ? (
                  <div style={{ textAlign:'center', padding:'1.5rem', color:'var(--text-muted)', fontSize:'.78rem' }}>
                    {t('planning.monthNoBlockDay')}
                  </div>
                ) : selectedBlocks.sort((a,b)=>a.hour-b.hour).map(b => {
                  const subj = subjects.find(s=>s.id===b.subj);
                  const color = subj?.color||'#4A90D9';
                  return (
                    <div key={b.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px',
                      background: b.status==='done'?'rgba(255,255,255,.02)':`${color}12`,
                      border:`1px solid ${b.status==='done'?'rgba(255,255,255,.06)':`${color}30`}`,
                      borderLeft:`3px solid ${color}`, borderRadius:9,
                      opacity: b.status==='done'?.6:1 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:'.78rem', fontWeight:600,
                          color: b.status==='done'?'var(--text-muted)':'var(--text-primary)',
                          textDecoration: b.status==='done'?'line-through':'none',
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {subj?.name||'?'}
                        </div>
                        <div style={{ fontSize:'.62rem', color:'var(--text-muted)', marginTop:2 }}>
                          {hm(b.hour)} · {formatDuration(b.dur, lang)} {b.task&&`· ${b.task}`}
                        </div>
                      </div>
                      <button onClick={()=>onToggleBlock(b.id)}
                        style={{ width:24,height:24,borderRadius:7,border:`1px solid ${color}30`,
                          background: b.status==='done'?'rgba(255,255,255,.06)':`${color}20`,
                          color: b.status==='done'?'rgba(255,255,255,.4)':color,
                          fontSize:'.7rem',cursor:'pointer' }}>
                        {b.status==='done'?'↺':'✓'}
                      </button>
                      <button onClick={()=>onDeleteBlock(b.id)}
                        style={{ width:24,height:24,borderRadius:7,border:'1px solid rgba(231,76,60,.2)',
                          background:'rgba(231,76,60,.06)',color:'#E74C3C',fontSize:'.7rem',cursor:'pointer' }}>
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Ajouter un bloc */}
              <motion.button whileHover={{scale:1.02}} whileTap={{scale:.98}}
                onClick={()=>onAddBlock(selectedDay)}
                style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:6,
                  padding:'9px',borderRadius:10,border:'1px solid rgba(74,144,217,.3)',
                  background:'rgba(74,144,217,.08)',color:'#93c5fd',
                  fontSize:'.78rem',fontWeight:600,cursor:'pointer' }}>
                <Plus size={14} strokeWidth={2.4} aria-hidden="true" />
                {t('planning.addBlockDay')}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}