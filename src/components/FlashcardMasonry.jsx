import { useLayoutEffect, useEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import './Masonry.css';

const statusColor = ok => ok===true?'#27AE60':ok===false?'#E74C3C':'var(--border-strong)';

export default function FlashcardMasonry({ cards, onEdit, onDelete }) {
  const containerRef = useRef(null);
  const [cols, setCols] = useState(3);
  const [width, setWidth] = useState(0);
  const mounted = useRef(false);

  useEffect(() => {
    const calc = () => {
      const w = containerRef.current?.offsetWidth || window.innerWidth;
      setWidth(w);
      setCols(w < 480 ? 1 : w < 720 ? 2 : w < 1100 ? 3 : 4);
    };
    calc();
    const ro = new ResizeObserver(calc);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Heights aléatoires basées sur la longueur du texte
  const grid = useMemo(() => {
    if (!width || !cols) return [];
    const colH = new Array(cols).fill(0);
    const colW = width / cols;
    return cards.map((card, i) => {
      const h = 120 + Math.min(card.q.length * 1.2, 120) + Math.min((card.a||'').length * 0.6, 80);
      const col = colH.indexOf(Math.min(...colH));
      const x = col * colW;
      const y = colH[col];
      colH[col] += h + 10;
      return { ...card, x, y, w: colW, h, i };
    });
  }, [cards, cols, width]);

  const totalH = useMemo(() => grid.length ? Math.max(...grid.map(g=>g.y+g.h)) : 0, [grid]);

  useLayoutEffect(() => {
    if (!grid.length) return;
    grid.forEach((item, idx) => {
      const el = document.querySelector(`[data-fcid="${item.i}"]`);
      if (!el) return;
      if (!mounted.current) {
        gsap.fromTo(el, { opacity:0, y: item.y+40, x:item.x, width:item.w-12, height:item.h },
          { opacity:1, y:item.y, x:item.x, width:item.w-12, height:item.h, duration:.6, ease:'power3.out', delay:idx*.04 });
      } else {
        gsap.to(el, { y:item.y, x:item.x, width:item.w-12, height:item.h, duration:.4, ease:'power2.out' });
      }
    });
    mounted.current = true;
  }, [grid]);

  return (
    <div ref={containerRef} className="masonry-list" style={{ height: totalH }}>
      {grid.map(item => (
        <div key={item.i} data-fcid={item.i} className="masonry-item" style={{ position:'absolute', padding:6 }}>
          <div className="masonry-card" style={{ borderLeft:`3px solid ${statusColor(item.ok)}`, height:'100%' }}>
            <div className="card-actions">
              <button onClick={e=>{e.stopPropagation();onEdit(item)}}
                style={{ width:24,height:24,borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-input)',color:'var(--text-secondary)',fontSize:'.7rem',cursor:'pointer' }}>✏️</button>
              <button onClick={e=>{e.stopPropagation();onDelete(item.i)}}
                style={{ width:24,height:24,borderRadius:6,border:'1px solid rgba(231,76,60,.2)',background:'rgba(231,76,60,.08)',color:'#E74C3C',fontSize:'.7rem',cursor:'pointer' }}>🗑</button>
            </div>
            <div style={{ width:8,height:8,borderRadius:'50%',background:statusColor(item.ok),alignSelf:'flex-end',flexShrink:0 }} />
            <div className="card-question">{item.q}</div>
            {item.a && <div className="card-answer">{item.a}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}