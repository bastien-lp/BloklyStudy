import { useState, useEffect } from 'react';
import { motion } from 'motion/react';

// ── Mini Planning ──
function MiniPlanning() {
  const days = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const blocks = [
    { day: 0, h: 9, dur: 2, color: '#4A90D9', label: 'Maths' },
    { day: 0, h: 14, dur: 3, color: '#9B59B6', label: 'Phys' },
    { day: 1, h: 10, dur: 2, color: '#27AE60', label: 'Info' },
    { day: 2, h: 9, dur: 4, color: '#E74C3C', label: 'Chimie' },
    { day: 3, h: 13, dur: 2, color: '#4A90D9', label: 'Maths' },
    { day: 4, h: 10, dur: 3, color: '#F1C40F', label: 'Éco' },
    { day: 5, h: 9, dur: 2, color: '#27AE60', label: 'Info' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, padding: '0.5rem' }}>
      {days.map((d, i) => (
        <div key={i}>
          <div style={{ textAlign: 'center', fontSize: '.6rem', color: 'rgba(255,255,255,.4)', marginBottom: 4 }}>{d}</div>
          <div style={{ height: 80, background: 'rgba(255,255,255,.05)', borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
            {blocks.filter(b => b.day === i).map((b, j) => (
              <motion.div key={j}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: i * 0.1 + j * 0.15, duration: 0.4, ease: 'easeOut' }}
                style={{ position: 'absolute', left: 2, right: 2, top: `${(b.h - 8) * 9}%`, height: `${b.dur * 9}%`, background: b.color, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', transformOrigin: 'top' }}>
                <span style={{ fontSize: '.45rem', color: '#fff', fontWeight: 700 }}>{b.label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Mini Todo ──
function MiniTodo() {
  const [items, setItems] = useState([
    { id: 1, text: 'Relire chapitre 3', done: false, priority: 'high' },
    { id: 2, text: 'Fiches de révision', done: true, priority: 'medium' },
    { id: 3, text: 'Exercices type exam', done: false, priority: 'high' },
    { id: 4, text: 'Résumé cours Éco', done: false, priority: 'low' },
  ]);
  const toggle = (id) => setItems(prev => prev.map(i => i.id === id ? { ...i, done: !i.done } : i));
  const colors = { high: '#E74C3C', medium: '#F1C40F', low: '#27AE60' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0.5rem' }}>
      {items.map(item => (
        <motion.div key={item.id} layout
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(255,255,255,.06)', borderRadius: 8, cursor: 'pointer', opacity: item.done ? 0.5 : 1 }}
          onClick={() => toggle(item.id)}
          whileHover={{ scale: 1.02 }}>
          <motion.div animate={{ background: item.done ? '#27AE60' : 'transparent', borderColor: item.done ? '#27AE60' : 'rgba(255,255,255,.3)' }}
            style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {item.done && <span style={{ fontSize: '.5rem', color: '#fff' }}>✓</span>}
          </motion.div>
          <span style={{ fontSize: '.72rem', color: '#fff', flex: 1, textDecoration: item.done ? 'line-through' : 'none' }}>{item.text}</span>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: colors[item.priority], flexShrink: 0 }} />
        </motion.div>
      ))}
    </div>
  );
}

// ── Mini Timer ──
function MiniTimer() {
  const [running, setRunning] = useState(false);
  const [time, setTime] = useState(25 * 60);
  const total = 25 * 60;
  const pct = time / total;
  const r = 36;
  const circ = 2 * Math.PI * r;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTime(t => t > 0 ? t - 1 : 0), 1000);
    return () => clearInterval(id);
  }, [running]);
  const mm = String(Math.floor(time / 60)).padStart(2, '0');
  const ss = String(time % 60).padStart(2, '0');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '1rem' }}>
      <div style={{ position: 'relative', width: 90, height: 90 }}>
        <svg width="90" height="90" viewBox="0 0 90 90">
          <circle cx="45" cy="45" r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="6" />
          <motion.circle cx="45" cy="45" r={r} fill="none" stroke="#4A90D9" strokeWidth="6"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
            strokeLinecap="round" style={{ rotate: -90, transformOrigin: '45px 45px' }}
            animate={{ strokeDashoffset: circ * (1 - pct) }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>{mm}:{ss}</span>
          <span style={{ fontSize: '.55rem', color: 'rgba(255,255,255,.4)' }}>FOCUS</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setRunning(r => !r)}
          style={{ padding: '5px 16px', borderRadius: 20, border: 'none', background: running ? '#E74C3C' : '#4A90D9', color: '#fff', fontSize: '.7rem', fontWeight: 700, cursor: 'pointer' }}>
          {running ? '⏸ Pause' : '▶ Start'}
        </button>
        <button onClick={() => { setRunning(false); setTime(total); }}
          style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid rgba(255,255,255,.2)', background: 'transparent', color: 'rgba(255,255,255,.6)', fontSize: '.7rem', cursor: 'pointer' }}>↺</button>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {['25/5', '50/10'].map(m => (
          <span key={m} style={{ fontSize: '.6rem', padding: '2px 8px', borderRadius: 10, background: 'rgba(74,144,217,.2)', color: '#93c5fd' }}>{m}</span>
        ))}
      </div>
    </div>
  );
}

// ── Mini Flashcard ──
function MiniFlashcard() {
  const [flipped, setFlipped] = useState(false);
  const cards = [
    { q: 'Quelle est la loi d\'Ohm ?', a: 'U = R × I' },
    { q: 'Définir l\'intégrale de Riemann', a: '∫f(x)dx = lim Σf(xᵢ)Δx' },
  ];
  const [idx, setIdx] = useState(0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '0.5rem' }}>
      <div style={{ perspective: 600, width: '100%', height: 80, cursor: 'pointer' }} onClick={() => setFlipped(f => !f)}>
        <motion.div animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: 0.5 }}
          style={{ width: '100%', height: '100%', position: 'relative', transformStyle: 'preserve-3d' }}>
          <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', background: 'rgba(74,144,217,.15)', border: '1px solid rgba(74,144,217,.3)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0.5rem' }}>
            <span style={{ fontSize: '.55rem', color: 'rgba(255,255,255,.4)', marginBottom: 4 }}>QUESTION</span>
            <span style={{ fontSize: '.75rem', color: '#fff', textAlign: 'center', fontWeight: 600 }}>{cards[idx].q}</span>
          </div>
          <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', background: 'rgba(39,174,96,.2)', border: '1px solid rgba(39,174,96,.4)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0.5rem' }}>
            <span style={{ fontSize: '.55rem', color: 'rgba(255,255,255,.4)', marginBottom: 4 }}>RÉPONSE</span>
            <span style={{ fontSize: '.9rem', color: '#fff', textAlign: 'center', fontWeight: 700 }}>{cards[idx].a}</span>
          </div>
        </motion.div>
      </div>
      <span style={{ fontSize: '.6rem', color: 'rgba(255,255,255,.35)' }}>Clique pour retourner</span>
      <div style={{ display: 'flex', gap: 6 }}>
        {['😕', '🤔', '😊', '🔥'].map((e, i) => (
          <button key={i} onClick={() => { setFlipped(false); setIdx((idx + 1) % cards.length); }}
            style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.06)', cursor: 'pointer', fontSize: '.8rem' }}>{e}</button>
        ))}
      </div>
    </div>
  );
}

// ── Mini XP ──
function MiniXP() {
  const [xp, setXp] = useState(3420);
  const level = Math.floor(xp / 500) + 1;
  const xpInLevel = xp % 500;
  const badges = ['🎯', '📚', '🔥', '⚡', '🏆', '💎'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg,#4A90D9,#9B59B6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 900, color: '#fff', flexShrink: 0 }}>{level}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.6)' }}>Niveau {level}</span>
            <span style={{ fontSize: '.65rem', color: '#57FF2B' }}>{xpInLevel}/500 XP</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,.1)', borderRadius: 10, overflow: 'hidden' }}>
            <motion.div animate={{ width: `${(xpInLevel / 500) * 100}%` }}
              style={{ height: '100%', background: 'linear-gradient(90deg,#57FF2B,#2aff00)', borderRadius: 10 }} />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {badges.map((b, i) => (
          <motion.div key={i} whileHover={{ scale: 1.2 }}
            style={{ width: 28, height: 28, borderRadius: 8, background: i < 4 ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.04)', border: `1px solid ${i < 4 ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.08)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.9rem', opacity: i < 4 ? 1 : 0.4, cursor: 'pointer' }}>
            {b}
          </motion.div>
        ))}
      </div>
      <button onClick={() => setXp(x => x + 50)}
        style={{ padding: '5px 0', borderRadius: 8, border: 'none', background: 'rgba(87,255,43,.15)', color: '#57FF2B', fontSize: '.65rem', fontWeight: 700, cursor: 'pointer' }}>
        +50 XP simulé ⚡
      </button>
    </div>
  );
}

// ── Mini Stats ──
function MiniStats() {
  const subjects = [
    { name: 'Maths', pct: 78, color: '#4A90D9' },
    { name: 'Physique', pct: 55, color: '#9B59B6' },
    { name: 'Info', pct: 92, color: '#27AE60' },
    { name: 'Chimie', pct: 40, color: '#E74C3C' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0.5rem' }}>
      {subjects.map((s, i) => (
        <div key={i}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.7)' }}>{s.name}</span>
            <span style={{ fontSize: '.68rem', fontWeight: 700, color: s.color }}>{s.pct}%</span>
          </div>
          <div style={{ height: 5, background: 'rgba(255,255,255,.08)', borderRadius: 10, overflow: 'hidden' }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${s.pct}%` }}
              transition={{ delay: i * 0.1 + 0.3, duration: 0.8, ease: 'easeOut' }}
              style={{ height: '100%', background: s.color, borderRadius: 10 }} />
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        {[{ v: '47h', l: 'focus' }, { v: '12', l: 'streak' }, { v: '84%', l: 'global' }].map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,.05)', borderRadius: 8, padding: '5px 0' }}>
            <div style={{ fontSize: '.85rem', fontWeight: 700, color: '#fff' }}>{s.v}</div>
            <div style={{ fontSize: '.55rem', color: 'rgba(255,255,255,.4)' }}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Mini Exams ──
function MiniExams() {
  const exams = [
    { name: 'Maths', days: 3, color: '#4A90D9', chaps: 6, done: 4 },
    { name: 'Physique', days: 7, color: '#9B59B6', chaps: 8, done: 3 },
    { name: 'Info', days: 12, color: '#27AE60', chaps: 5, done: 5 },
    { name: 'Chimie', days: 21, color: '#E74C3C', chaps: 7, done: 2 },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0.5rem' }}>
      {exams.map((e, i) => (
        <motion.div key={i} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.1 }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(255,255,255,.05)', borderRadius: 8, borderLeft: `3px solid ${e.color}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#fff' }}>{e.name}</div>
            <div style={{ fontSize: '.58rem', color: 'rgba(255,255,255,.4)' }}>{e.done}/{e.chaps} chapitres</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '.8rem', fontWeight: 700, color: e.days <= 5 ? '#E74C3C' : e.days <= 10 ? '#F1C40F' : '#27AE60' }}>J-{e.days}</div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ── Mini Groupes ──
function MiniGroupes() {
  const messages = [
    { user: 'Léa', text: 'Quelqu\'un a les exos du TD3 ?', color: '#4A90D9', time: '14:32' },
    { user: 'Tom', text: 'Je les ai, je les partage !', color: '#27AE60', time: '14:33' },
    { user: 'Moi', text: 'Merci Tom 🙏', color: '#9B59B6', time: '14:34' },
  ];
  const members = ['👤', '👤', '👤', '👤', '👤'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <div style={{ display: 'flex' }}>
          {members.map((m, i) => (
            <div key={i} style={{ width: 20, height: 20, borderRadius: '50%', background: `hsl(${i * 60},60%,50%)`, marginLeft: i > 0 ? -6 : 0, border: '2px solid rgba(0,0,0,.3)', fontSize: '.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {String.fromCharCode(65 + i)}
            </div>
          ))}
        </div>
        <span style={{ fontSize: '.6rem', color: 'rgba(255,255,255,.5)' }}>Groupe Maths L1 · 5 membres</span>
      </div>
      {messages.map((m, i) => (
        <div key={i} style={{ display: 'flex', gap: 6 }}>
          <div style={{ width: 18, height: 18, borderRadius: '50%', background: m.color, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.55rem', fontWeight: 700, color: '#fff' }}>
            {m.user[0]}
          </div>
          <div style={{ flex: 1, background: 'rgba(255,255,255,.06)', borderRadius: 8, padding: '4px 8px' }}>
            <span style={{ fontSize: '.58rem', fontWeight: 700, color: m.color }}>{m.user} </span>
            <span style={{ fontSize: '.62rem', color: 'rgba(255,255,255,.7)' }}>{m.text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Mini Confiance ──
function MiniConfiance() {
  const [stars, setStars] = useState({ maths: 3, physique: 2, info: 5, chimie: 1 });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0.5rem' }}>
      <p style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.45)', marginBottom: 2 }}>Évalue ta confiance par matière</p>
      {Object.entries(stars).map(([subj, val]) => (
        <div key={subj} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.7)', width: 60, textTransform: 'capitalize' }}>{subj}</span>
          <div style={{ display: 'flex', gap: 3 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <motion.span key={n} whileHover={{ scale: 1.3 }}
                onClick={() => setStars(s => ({ ...s, [subj]: n }))}
                style={{ fontSize: '.9rem', cursor: 'pointer', filter: n <= val ? 'none' : 'grayscale(1) opacity(0.3)' }}>⭐</motion.span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Mini Calculateur ──
function MiniCalc() {
  const [grades, setGrades] = useState([
    { name: 'Maths', grade: 14, coeff: 3 },
    { name: 'Physique', grade: 12, coeff: 2 },
    { name: 'Info', grade: 17, coeff: 2 },
    { name: 'Chimie', grade: 9, coeff: 1 },
  ]);
  const avg = grades.reduce((s, g) => s + g.grade * g.coeff, 0) / grades.reduce((s, g) => s + g.coeff, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0.5rem' }}>
      {grades.map((g, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.6)', flex: 1 }}>{g.name}</span>
          <input type="number" min="0" max="20" value={g.grade}
            onChange={e => setGrades(prev => prev.map((x, j) => j === i ? { ...x, grade: Number(e.target.value) } : x))}
            style={{ width: 36, padding: '2px 4px', borderRadius: 4, border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: '.7rem', textAlign: 'center' }} />
          <span style={{ fontSize: '.6rem', color: 'rgba(255,255,255,.3)' }}>×{g.coeff}</span>
        </div>
      ))}
      <div style={{ marginTop: 4, padding: '6px 10px', background: avg >= 10 ? 'rgba(39,174,96,.2)' : 'rgba(231,76,60,.2)', borderRadius: 8, textAlign: 'center' }}>
        <span style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.6)' }}>Moyenne : </span>
        <span style={{ fontSize: '1rem', fontWeight: 800, color: avg >= 10 ? '#27AE60' : '#E74C3C' }}>{avg.toFixed(2)}/20</span>
      </div>
    </div>
  );
}

// ── Mini Journal ──
function MiniJournal() {
  const entries = [
    { date: 'Aujourd\'hui', mood: '🔥', text: 'Super séance de 2h sur les intégrales !', subj: 'Maths' },
    { date: 'Hier', mood: '😐', text: 'Difficile de rester concentré...', subj: 'Chimie' },
    { date: 'Mer.', mood: '😊', text: 'Tous les chapitres terminés !', subj: 'Info' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0.5rem' }}>
      {entries.map((e, i) => (
        <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }}
          style={{ padding: '8px 10px', background: 'rgba(255,255,255,.05)', borderRadius: 8, borderLeft: '2px solid rgba(74,144,217,.5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: '.6rem', color: 'rgba(255,255,255,.4)' }}>{e.date} · {e.subj}</span>
            <span style={{ fontSize: '.8rem' }}>{e.mood}</span>
          </div>
          <p style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.75)', lineHeight: 1.4 }}>{e.text}</p>
        </motion.div>
      ))}
    </div>
  );
}

// ── Mini Révisions Espacées ──
function MiniSpacedRep() {
  const cards = [
    { q: 'Dérivée de sin(x)', status: 'today', next: 'Aujourd\'hui' },
    { q: 'Théorème de Pythagore', status: 'soon', next: 'Dans 3j' },
    { q: 'Loi de Coulomb', status: 'later', next: 'Dans 14j' },
    { q: 'Intégrale par parties', status: 'today', next: 'Aujourd\'hui' },
  ];
  const colors = { today: '#E74C3C', soon: '#F1C40F', later: '#27AE60' };
  const labels = { today: 'À revoir', soon: 'Bientôt', later: 'Maîtrisé' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '0.5rem' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
        {['today', 'soon', 'later'].map(s => (
          <div key={s} style={{ flex: 1, textAlign: 'center', padding: '3px', borderRadius: 6, background: `${colors[s]}22`, border: `1px solid ${colors[s]}44` }}>
            <div style={{ fontSize: '.7rem', fontWeight: 700, color: colors[s] }}>{cards.filter(c => c.status === s).length}</div>
            <div style={{ fontSize: '.55rem', color: 'rgba(255,255,255,.5)' }}>{labels[s]}</div>
          </div>
        ))}
      </div>
      {cards.map((c, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: 'rgba(255,255,255,.04)', borderRadius: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: colors[c.status], flexShrink: 0 }} />
          <span style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.75)', flex: 1 }}>{c.q}</span>
          <span style={{ fontSize: '.6rem', color: colors[c.status], fontWeight: 600 }}>{c.next}</span>
        </div>
      ))}
    </div>
  );
}

// ── Mini Synthèses ──
function MiniSyntheses() {
  const chapters = [
    { name: 'Chap. 1 — Fonctions', status: 'done', notes: 3 },
    { name: 'Chap. 2 — Dérivées', status: 'wip', notes: 1 },
    { name: 'Chap. 3 — Intégrales', status: 'todo', notes: 0 },
    { name: 'Chap. 4 — Équations', status: 'done', notes: 2 },
  ];
  const statusConfig = { done: { color: '#27AE60', label: '✓ Fait' }, wip: { color: '#F1C40F', label: '⏳ En cours' }, todo: { color: '#E74C3C', label: '○ À faire' } };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '0.5rem' }}>
      {chapters.map((c, i) => (
        <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.1 }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(255,255,255,.05)', borderRadius: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.68rem', color: '#fff', fontWeight: 600 }}>{c.name}</div>
            {c.notes > 0 && <div style={{ fontSize: '.58rem', color: 'rgba(255,255,255,.4)' }}>{c.notes} note{c.notes > 1 ? 's' : ''}</div>}
          </div>
          <span style={{ fontSize: '.6rem', color: statusConfig[c.status].color, fontWeight: 600 }}>{statusConfig[c.status].label}</span>
        </motion.div>
      ))}
    </div>
  );
}

// ── Feature Cards Data ──
const FEATURES = [
  { id: 'planning', ico: '📅', title: 'Planning visuel', desc: 'Organise ta semaine avec drag & drop. Visualise ta charge d\'un coup d\'œil.', color: '#4A90D9', component: MiniPlanning },
  { id: 'todo', ico: '✅', title: 'To-do liste', desc: 'Gère tes tâches par priorité, matière et date limite. Streak de productivité inclus.', color: '#27AE60', component: MiniTodo },
  { id: 'timer', ico: '⏱️', title: 'Focus Timer', desc: 'Pomodoro 25/5 ou 50/10, ambiance sonore, XP et stats de concentration.', color: '#E67E22', component: MiniTimer },
  { id: 'flashcards', ico: '🃏', title: 'Flashcards IA', desc: 'Crée des cartes, entraîne-toi en quiz et évalue ta maîtrise par émoji.', color: '#9B59B6', component: MiniFlashcard },
  { id: 'xp', ico: '⚡', title: 'XP & Badges', desc: 'Monte de niveau, débloque 13 thèmes et collecte des badges en étudiant.', color: '#F1C40F', component: MiniXP },
  { id: 'stats', ico: '📊', title: 'Statistiques', desc: 'Heatmap d\'activité, temps de focus, streak et progression par matière.', color: '#E74C3C', component: MiniStats },
  { id: 'exams', ico: '📆', title: 'Suivi examens', desc: 'Compte à rebours par matière, progression chapitres et alertes J-3.', color: '#4A90D9', component: MiniExams },
  { id: 'groups', ico: '👥', title: 'Groupes d\'étude', desc: 'Chat en temps réel, partage de flashcards et classement entre amis.', color: '#27AE60', component: MiniGroupes },
  { id: 'confiance', ico: '⭐', title: 'Confiance', desc: 'Évalue ta confiance par matière et prédit tes résultats aux examens.', color: '#F1C40F', component: MiniConfiance },
  { id: 'calc', ico: '🧮', title: 'Calculateur de moyenne', desc: 'Calcule ta moyenne pondérée en temps réel et simule tes résultats.', color: '#9B59B6', component: MiniCalc },
  { id: 'journal', ico: '📓', title: 'Journal de révision', desc: 'Note tes séances avec ton humeur. Retrouve l\'historique de tes progrès.', color: '#E67E22', component: MiniJournal },
  { id: 'spacedRep', ico: '🔁', title: 'Révisions espacées', desc: 'Algorithme J1·J7·J30 pour ancrer tes connaissances durablement.', color: '#E74C3C', component: MiniSpacedRep },
  { id: 'syntheses', ico: '📝', title: 'Synthèses', desc: 'Suis ta progression chapitre par chapitre avec statuts et notes intégrées.', color: '#4A90D9', component: MiniSyntheses },
];

export default function FeatureCards() {
  const [active, setActive] = useState(null);

  return (
    <section style={{ padding: '5rem 2rem', maxWidth: 1200, margin: '0 auto', width: '100%', position: 'relative', zIndex: 1 }}>
      <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
        style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
        <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 800, color: '#fff', letterSpacing: '-.02em', marginBottom: '0.75rem' }}>
          Tout ce qu'il te faut pour réussir
        </h2>
        <p style={{ color: 'rgba(255,255,255,.45)', fontSize: '1.05rem', maxWidth: 540, margin: '0 auto' }}>
          Des outils pensés par un étudiant, pour les étudiants. Gratuit, sans pub, pour toujours.
        </p>
      </motion.div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 20 }}>
        {FEATURES.map((f, i) => {
          const Demo = f.component;
          const isActive = active === f.id;
          return (
            <motion.div key={f.id}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ delay: i * 0.05, duration: 0.5 }}
              onHoverStart={() => setActive(f.id)}
              onHoverEnd={() => setActive(null)}
              style={{
                background: isActive ? `rgba(${hexToRgb(f.color)},.12)` : 'rgba(255,255,255,.04)',
                border: `1px solid ${isActive ? f.color + '66' : 'rgba(255,255,255,.08)'}`,
                borderRadius: 20,
                overflow: 'hidden',
                cursor: 'default',
                transition: 'border-color .3s, background .3s',
                boxShadow: isActive ? `0 20px 60px ${f.color}22` : 'none',
              }}>
              <div style={{ padding: '1.4rem 1.4rem 0.8rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.6rem' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: `${f.color}22`, border: `1px solid ${f.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                    {f.ico}
                  </div>
                  <h3 style={{ fontSize: '.95rem', fontWeight: 700, color: '#fff', margin: 0 }}>{f.title}</h3>
                </div>
                <p style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.5)', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,.06)', background: 'rgba(0,0,0,.15)' }}>
                <Demo />
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? `${parseInt(r[1], 16)},${parseInt(r[2], 16)},${parseInt(r[3], 16)}` : '255,255,255';
}