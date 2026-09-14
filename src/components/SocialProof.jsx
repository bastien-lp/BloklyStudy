import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'motion/react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { ref as dbRef, onValue } from 'firebase/database';
import { db, rtdb } from '../firebase/config';

// ── CountUp ──
function CountUp({ to, duration = 2 }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView || to === 0) return;
    let start = 0;
    const step = to / (duration * 60);
    const timer = setInterval(() => {
      start += step;
      if (start >= to) { setCount(to); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 1000 / 60);
    return () => clearInterval(timer);
  }, [inView, to, duration]);

  return <span ref={ref}>{count.toLocaleString('fr-FR')}</span>;
}

// ── Stats Bar ──
export function StatsBar() {
  const [totalUsers, setTotalUsers] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    // Nombre d'inscrits depuis leaderboard
    getDocs(collection(db, 'leaderboard'))
      .then(snap => setTotalUsers(snap.size))
      .catch(() => {});

    // Utilisateurs en ligne depuis Realtime DB
    const presenceRef = dbRef(rtdb, 'presence');
    const unsub = onValue(presenceRef, (snap) => {
      const data = snap.val() || {};
      setOnlineCount(Object.keys(data).length);
    }, () => {});

    return () => unsub();
  }, []);

  const stats = [
    { value: totalUsers, label: 'étudiants inscrits', prefix: '', suffix: '' },
    { value: onlineCount, label: 'en ligne maintenant', prefix: '', suffix: '', live: true },
    { value: 100, label: 'sauvegardé dans le cloud', prefix: '', suffix: '%', static: true },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.5 }}
      style={{
        display: 'flex',
        gap: 0,
        flexWrap: 'wrap',
        justifyContent: 'center',
        background: 'rgba(255,255,255,.04)',
        border: '1px solid rgba(255,255,255,.08)',
        borderRadius: 16,
        overflow: 'hidden',
        margin: '1.5rem auto 0',
        maxWidth: 600,
      }}>
      {stats.map((s, i) => (
        <div key={i} style={{
          flex: '1 1 130px',
          padding: '1rem 0.75rem',
          textAlign: 'center',
          borderRight: i < stats.length - 1 ? '1px solid rgba(255,255,255,.06)' : 'none',
        }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', lineHeight: 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {s.live && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#27AE60', boxShadow: '0 0 8px rgba(39,174,96,.8)' }} />}
            <span>{s.prefix}{s.static ? s.value : <CountUp to={s.value} />}{s.suffix}</span>
          </div>
          <div style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.4)', marginTop: 4 }}>{s.label}</div>
        </div>
      ))}
    </motion.div>
  );
}

// ── Free Forever Banner ──
export function FreeForeverBanner() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      style={{
        margin: '2rem auto',
        maxWidth: 800,
        padding: '0 2rem',
        position: 'relative',
        zIndex: 1,
      }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(255,193,7,.08) 0%, rgba(255,94,91,.08) 100%)',
        border: '1px solid rgba(255,193,7,.2)',
        borderRadius: 24,
        padding: '2.5rem',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)', width: 200, height: 200, background: 'rgba(255,193,7,.08)', borderRadius: '50%', filter: 'blur(40px)', pointerEvents: 'none' }} />
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>☕</div>
        <h3 style={{ fontSize: 'clamp(1.2rem,3vw,1.8rem)', fontWeight: 800, color: '#fff', marginBottom: '0.75rem' }}>
          Un projet étudiant, porté par sa communauté.
        </h3>
        <p style={{ fontSize: '.92rem', color: 'rgba(255,255,255,.6)', lineHeight: 1.7, maxWidth: 520, margin: '0 auto 1.5rem', position: 'relative' }}>
          Blokly est développé seul, sur mon temps libre, avec la conviction que de bons outils d'étude devraient être à la portée de tous les étudiants.
          <br /><br />
          Si l'app t'aide, un café sur Ko-fi contribue à son hébergement et à ses futures fonctionnalités. Une partie est reversée à une bonne cause 💙
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', position: 'relative' }}>
          <a href="https://ko-fi.com/bloklystudy" target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 28px', background: '#FF5E5B', border: 'none', borderRadius: 10, color: '#fff', fontSize: '.9rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', boxShadow: '0 4px 20px rgba(255,94,91,.35)' }}>
            ☕ Soutenir sur Ko-fi
          </a>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 20px', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, color: 'rgba(255,255,255,.6)', fontSize: '.82rem' }}>
            ✓ Pas de CB requise &nbsp;·&nbsp; ✓ Annulable à tout moment
          </div>
        </div>
      </div>
    </motion.section>
  );
}

// ── Testimonials Section (vrais avis consentis) ──
export function TestimonialsSection() {
  const [reviews, setReviews] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // On récupère les avis publics, triés du plus récent au plus ancien
        const q = query(
          collection(db, 'reviews'),
          where('consent', '==', true),
          orderBy('createdAt', 'desc'),
          limit(12)
        );
        const snap = await getDocs(q);
        setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch {
        // En cas d'index manquant ou de souci, on retombe sur une requête simple
        try {
          const snap = await getDocs(collection(db, 'reviews'));
          setReviews(
            snap.docs.map(d => ({ id: d.id, ...d.data() }))
              .filter(r => r.consent === true)
              .sort((a, b) => {
                const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
                const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
                return tb - ta;
              })
              .slice(0, 12)
          );
        } catch { /* lecture impossible : on n'affiche rien */ }
      }
      setLoaded(true);
    })();
  }, []);

  // Pas d'avis publics → on n'affiche pas la section du tout
  if (loaded && reviews.length === 0) return null;
  if (!loaded) return null;

  const avg = reviews.reduce((a, r) => a + (r.rating || 0), 0) / reviews.length;

  return (
    <section style={{ margin: '3rem auto 1rem', maxWidth: 1100, padding: '0 2rem', position: 'relative', zIndex: 1 }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: 'clamp(1.4rem,3.5vw,2.2rem)', fontWeight: 800, color: '#fff', marginBottom: 8 }}>
          Ils utilisent Blokly
        </h2>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {[1, 2, 3, 4, 5].map(s => (
              <span key={s} style={{ fontSize: '1.1rem', filter: avg >= s ? 'none' : 'grayscale(1) opacity(.3)' }}>⭐</span>
            ))}
          </div>
          <span style={{ fontSize: '.9rem', fontWeight: 700, color: '#fff' }}>{Math.round(avg * 10) / 10}/5</span>
          <span style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.4)' }}>· {reviews.length} avis</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
        {reviews.map((r, i) => (
          <motion.div key={r.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: Math.min(i * 0.05, 0.4), duration: 0.4 }}
            style={{
              background: 'rgba(255,255,255,.04)',
              border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 16,
              padding: '1.2rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
            <div style={{ display: 'flex', gap: 2 }}>
              {[1, 2, 3, 4, 5].map(s => (
                <span key={s} style={{ fontSize: '.8rem', filter: (r.rating || 0) >= s ? 'none' : 'grayscale(1) opacity(.25)' }}>⭐</span>
              ))}
            </div>
            <div style={{ fontSize: '.85rem', color: 'rgba(255,255,255,.75)', lineHeight: 1.6, fontStyle: 'italic', flex: 1 }}>
              "{r.comment}"
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                background: `hsl(${(r.name || 'A').charCodeAt(0) * 47 % 360},60%,50%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '.85rem', fontWeight: 700, color: '#fff', flexShrink: 0,
              }}>
                {(r.name || '?')[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '.8rem', fontWeight: 700, color: '#fff' }}>{r.name}</div>
                {r.school && <div style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.4)' }}>{r.school}</div>}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}