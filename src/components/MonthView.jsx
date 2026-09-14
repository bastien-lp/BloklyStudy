import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '../i18n';

function hm(h) {
  const hh=Math.floor(h), mm=h%1===0.5?'30':'00';
  return `${hh}h${mm!=='00'?mm:''}`;
}

export default function MonthView({ blocks, subjects, onAddBlock, onToggleBlock, onDeleteBlock }) {
  const { t, formatDate } = useTranslation();
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

      <div style={{ display:'grid', gridTemplateColumns: selectedDay ? '1fr 280px' : '1fr', gap:12, alignItems:'start' }}>

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

                return (
                  <motion.div key={di}
                    whileHover={{ background:'rgba(255,255,255,.05)' }}
                    onClick={()=>setSelectedDay(isSelected?null:day)}
                    style={{ minHeight:80, padding:'6px', cursor:'pointer',
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
                        <span title={dayExams.map(e=>e.name).join(', ')}
                          style={{ fontSize:'.55rem', background:'rgba(231,76,60,.2)',
                            color:'#ff6b6b', borderRadius:6, padding:'1px 4px', fontWeight:700 }}>
                          🎓
                        </span>
                      )}
                    </div>

                    {/* Blocs colorés */}
                    <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                      {dayBlocks.slice(0,3).map(b => {
                        const subj = subjects.find(s=>s.id===b.subj);
                        const color = subj?.color||'#4A90D9';
                        return (
                          <div key={b.id} style={{ fontSize:'.58rem', padding:'1px 5px', borderRadius:4,
                            background: b.status==='done' ? `${color}20` : `${color}35`,
                            color: b.status==='done' ? `${color}80` : 'var(--text-primary)',
                            textDecoration: b.status==='done' ? 'line-through' : 'none',
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                            borderLeft:`2px solid ${color}` }}>
                            {subj?.name?.slice(0,10)||'?'}
                          </div>
                        );
                      })}
                      {dayBlocks.length>3 && (
                        <div style={{ fontSize:'.55rem', color:'var(--text-muted)', paddingLeft:4 }}>
                          {t('planning.monthAndMore', { count: dayBlocks.length-3 })}
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
                    {selectedDay.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}
                  </div>
                  {selectedExams.length>0 && (
                    <div style={{ fontSize:'.65rem', color:'#ff6b6b', marginTop:2 }}>
                      🎓 {selectedExams.map(e=>e.name).join(', ')}
                    </div>
                  )}
                </div>
                <button onClick={()=>setSelectedDay(null)}
                  style={{ background:'transparent',border:'none',color:'var(--text-muted)',
                    fontSize:'1.1rem',cursor:'pointer' }}>×</button>
              </div>

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
                          {hm(b.hour)} · {b.dur}h {b.task&&`· ${b.task}`}
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
                style={{ padding:'9px',borderRadius:10,border:'1px solid rgba(74,144,217,.3)',
                  background:'rgba(74,144,217,.08)',color:'#93c5fd',
                  fontSize:'.78rem',fontWeight:600,cursor:'pointer' }}>
                + Ajouter un bloc
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}