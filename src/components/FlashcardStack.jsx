import { useState } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'motion/react';
import { useTranslation } from '../i18n';


function SwipeCard({ card, onSwipe, isTop }) {
  const { t } = useTranslation();
  const x          = useMotionValue(0);
  const rotate     = useTransform(x, [-300, 300], [-25, 25]);
  const bgGreen    = useTransform(x, [0, 200],    [0, 0.3]);
  const bgRed      = useTransform(x, [-200, 0],   [0.3, 0]);
  const opacityL   = useTransform(x, [-200, -50], [1, 0]);
  const opacityR   = useTransform(x, [50, 200],   [0, 1]);
  const [flipped, setFlipped] = useState(false);

  function handleDragEnd(_, info) {
    if (info.offset.x > 120)       onSwipe('know', card);
    else if (info.offset.x < -120) onSwipe('dontknow', card);
  }

  const cardW = Math.min(typeof window !== 'undefined' ? window.innerWidth - 48 : 380, 420);

  return (
    <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <motion.div style={{ position:'fixed', inset:0, background:'#27AE60', opacity:bgGreen, pointerEvents:'none', zIndex:0 }} />
      <motion.div style={{ position:'fixed', inset:0, background:'#E74C3C', opacity:bgRed, pointerEvents:'none', zIndex:0 }} />

      <motion.div
        drag={isTop ? 'x' : false}
        dragConstraints={{ left:0, right:0 }}
        dragElastic={0.8}
        style={{ x, rotate, position:'relative', zIndex:10, cursor:isTop?'grab':'default' }}
        onDragEnd={handleDragEnd}
        whileTap={{ cursor:'grabbing' }}>

        {/* Indicateurs swipe — toujours montés, visibilité via opacity */}
        <motion.div style={{ position:'absolute', top:20, left:20, zIndex:20,
          opacity: isTop ? opacityL : 0, pointerEvents:'none',
          background:'rgba(231,76,60,.9)', borderRadius:10, padding:'6px 14px',
          color:'#fff', fontWeight:800, fontSize:'1rem', border:'2px solid #E74C3C' }}>
          ✗ {t('flashcards.dontKnow')}
        </motion.div>
        <motion.div style={{ position:'absolute', top:20, right:20, zIndex:20,
          opacity: isTop ? opacityR : 0, pointerEvents:'none',
          background:'rgba(39,174,96,.9)', borderRadius:10, padding:'6px 14px',
          color:'#fff', fontWeight:800, fontSize:'1rem', border:'2px solid #27AE60' }}>
          ✓ {t('flashcards.know')}
        </motion.div>

        {/* Carte flip */}
        <div
          onClick={() => isTop && setFlipped(f => !f)}
          style={{ width:cardW, height:280, perspective:1000, cursor:'pointer', borderRadius:24 }}>

          <motion.div
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ duration:.45, ease:[.4,0,.2,1] }}
            style={{ width:'100%', height:'100%', position:'relative', transformStyle:'preserve-3d' }}>

            {/* Front */}
            <div style={{ position:'absolute', inset:0, backfaceVisibility:'hidden',
              background:'var(--bg-modal)',
              border:'1px solid var(--border-strong)', borderRadius:24,
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              padding:'2rem', boxShadow:'0 4px 24px rgba(0,0,0,.15)' }}>
              <div style={{ fontSize:'.6rem', fontWeight:700, color:'var(--text-muted)',
                letterSpacing:'.12em', textTransform:'uppercase', marginBottom:16,
                background:'var(--bg-input)', padding:'4px 12px', borderRadius:20 }}>❓ {t('flashcards.question')}</div>
              <div style={{ fontSize:'clamp(1rem,4vw,1.25rem)', fontWeight:700, color:'var(--text-primary)',
                textAlign:'center', lineHeight:1.5, overflowY:'auto', maxHeight:160 }}>{card.q}</div>
              {isTop && (
                <div style={{ position:'absolute', bottom:16, fontSize:'.62rem', color:'var(--text-muted)',
                  display:'flex', alignItems:'center', gap:4 }}>
                  <span>👆</span> {t('flashcards.tapToFlip')}
                </div>
              )}
            </div>

            {/* Back */}
            <div style={{ position:'absolute', inset:0, backfaceVisibility:'hidden', transform:'rotateY(180deg)',
              background:'var(--bg-modal)',
              border:'1px solid rgba(39,174,96,.4)', borderRadius:24,
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              padding:'2rem', boxShadow:'0 4px 24px rgba(0,0,0,.15)' }}>
              <div style={{ fontSize:'.6rem', fontWeight:700, color:'#27AE60',
                letterSpacing:'.12em', textTransform:'uppercase', marginBottom:16,
                background:'rgba(39,174,96,.12)', padding:'4px 12px', borderRadius:20 }}>💡 {t('flashcards.answer')}</div>
              <div style={{ fontSize:'clamp(1rem,4vw,1.25rem)', fontWeight:700, color:'var(--text-primary)',
                textAlign:'center', lineHeight:1.5, overflowY:'auto', maxHeight:160 }}>{card.a}</div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * @param {object[]} cards           the cards still to answer
 * @param {object[]} initialResults  answers from a resumed session
 * @param {Function} onProgress      (results, remainingCards) after each card,
 *                                   so the caller can save the position
 */
export default function FlashcardStack({ cards, onDone, initialResults = [], onProgress }) {
  const { t } = useTranslation();
  // The deck is captured once: the parent may re-render (and reshuffle) without
  // disturbing a quiz in progress.
  const [stack, setStack]     = useState(() => [...cards].reverse());
  const [results, setResults] = useState(initialResults);
  const [last, setLast]       = useState(null);

  function handleSwipe(dir, card) {
    setLast(dir);
    setTimeout(() => setLast(null), 600);
    // Computed here rather than read back from state, which updates later.
    const nextResults = [...results, { ...card, ok: dir === 'know' }];
    const nextStack   = stack.slice(0, -1);
    setResults(nextResults);
    setStack(nextStack);
    // `stack` is stored reversed (top card last), so undo that for the caller.
    onProgress?.(nextResults, [...nextStack].reverse());
  }

  // A resumed quiz counts the cards already answered, so the bar and the final
  // score cover the whole set and not just what was left.
  const total = initialResults.length + cards.length;
  const done  = total - stack.length;
  const pct   = total > 0 ? done / total : 0;

  if (stack.length === 0) {
    const knew     = results.filter(r => r.ok).length;
    const dontKnew = results.filter(r => !r.ok).length;
    const score    = Math.round(knew / total * 100);
    const scoreColor = score >= 80 ? '#27AE60' : score >= 50 ? '#F1C40F' : '#E74C3C';
    return (
      <motion.div initial={{ opacity:0, scale:.9 }} animate={{ opacity:1, scale:1 }}
        style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:20, padding:'2rem', textAlign:'center' }}>
        <div style={{ fontSize:'4rem' }}>{score>=80?'🎉':score>=50?'💪':'📚'}</div>
        <div style={{ fontSize:'3rem', fontWeight:900, color:scoreColor }}>{score}%</div>
        <div style={{ fontSize:'1rem', color:'var(--text-secondary)' }}>{t('flashcards.resultMastered', { knew, total })}</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, width:'100%', maxWidth:300 }}>
          <div style={{ padding:'14px', background:'rgba(39,174,96,.1)', border:'1px solid rgba(39,174,96,.25)', borderRadius:14, textAlign:'center' }}>
            <div style={{ fontSize:'1.8rem', fontWeight:900, color:'#27AE60' }}>{knew}</div>
            <div style={{ fontSize:'.65rem', color:'var(--text-muted)' }}>✅ {t('flashcards.knew')}</div>
          </div>
          <div style={{ padding:'14px', background:'rgba(231,76,60,.1)', border:'1px solid rgba(231,76,60,.25)', borderRadius:14, textAlign:'center' }}>
            <div style={{ fontSize:'1.8rem', fontWeight:900, color:'#E74C3C' }}>{dontKnew}</div>
            <div style={{ fontSize:'.65rem', color:'var(--text-muted)' }}>❌ {t('flashcards.toReview')}</div>
          </div>
        </div>
        <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:.97 }} onClick={() => onDone(results)}
          style={{ padding:'12px 32px', borderRadius:14, border:'none',
            background:'linear-gradient(135deg,#4A90D9,#6366f1)', color:'#fff',
            fontSize:'.9rem', fontWeight:700, cursor:'pointer' }}>
          {t('flashcards.finish')}
        </motion.button>
      </motion.div>
    );
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', gap:0 }}>

      {/* Progress bar */}
      <div style={{ padding:'0 1rem 1rem', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <span style={{ fontSize:'.75rem', color:'var(--text-muted)' }}>{done}/{total}</span>
        <div style={{ flex:1, height:4, background:'var(--border)', borderRadius:10, overflow:'hidden' }}>
          <motion.div animate={{ width:`${pct*100}%` }}
            style={{ height:'100%', background:'linear-gradient(90deg,#4A90D9,#6366f1)', borderRadius:10 }} />
        </div>
        <AnimatePresence>
          {last && (
            <motion.span initial={{ opacity:0, scale:.8 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0 }}
              style={{ fontSize:'1rem' }}>{last==='know'?'✓':'✗'}</motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Stack */}
      <div style={{ flex:1, position:'relative' }}>
        {stack.slice(-3).map((card, i, arr) => {
          const isTop   = i === arr.length - 1;
          const depth   = arr.length - 1 - i; // 0 = top, 1 = deuxième, 2 = troisième
          const rotates = [0, -4, 3];
          const ys      = [0, 8, 14];
          const scales  = [1, 0.96, 0.92];
          return (
            <motion.div key={card.q + i}
              animate={{
                scale: scales[depth] ?? 0.9,
                y: ys[depth] ?? 18,
                rotate: rotates[depth] ?? 0,
              }}
              transition={{ type:'spring', damping:20, stiffness:200 }}
              style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
                zIndex: 10 - depth }}>
              <SwipeCard card={card} onSwipe={handleSwipe} isTop={isTop} />
            </motion.div>
          );
        })}
      </div>

    </div>
  );
}