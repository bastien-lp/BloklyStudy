import { useRef, useEffect, useState } from 'react';
import { gsap } from 'gsap';
import './FlowingMenu.css';

function MenuItem({ text, icon, desc, color, bgColor, marqueeTextColor, onSelect, speed = 12 }) {
  const resolvedMarqueeColor = marqueeTextColor || (() => {
    try {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim();
      const isLight = bg.startsWith('#') ? parseInt(bg.slice(1,3),16) > 200 : false;
      return isLight ? '#ffffff' : '#0a0a18';
    } catch { return '#0a0a18'; }
  })();
  const itemRef       = useRef(null);
  const marqueeRef    = useRef(null);
  const marqueeInner  = useRef(null);
  const animRef       = useRef(null);
  const [reps, setReps] = useState(6);

  const distMetric = (x,y,x2,y2) => (x-x2)**2 + (y-y2)**2;
  const closestEdge = (mx,my,w,h) =>
    distMetric(mx,my,w/2,0) < distMetric(mx,my,w/2,h) ? 'top' : 'bottom';

  useEffect(() => {
    const calc = () => {
      if (!marqueeInner.current) return;
      const part = marqueeInner.current.querySelector('.marquee__part');
      if (!part) return;
      const needed = Math.ceil(window.innerWidth / (part.offsetWidth || 200)) + 3;
      setReps(Math.max(5, needed));
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, [text]);

  useEffect(() => {
    const setup = () => {
      if (!marqueeInner.current) return;
      const part = marqueeInner.current.querySelector('.marquee__part');
      if (!part || !part.offsetWidth) return;
      if (animRef.current) animRef.current.kill();
      animRef.current = gsap.to(marqueeInner.current, {
        x: -part.offsetWidth, duration: speed, ease: 'none', repeat: -1,
      });
    };
    const t = setTimeout(setup, 60);
    return () => { clearTimeout(t); animRef.current?.kill(); };
  }, [text, reps, speed]);

  const onEnter = e => {
    if (!itemRef.current) return;
    const r = itemRef.current.getBoundingClientRect();
    const edge = closestEdge(e.clientX-r.left, e.clientY-r.top, r.width, r.height);
    gsap.timeline({ defaults:{duration:.5,ease:'expo'} })
      .set(marqueeRef.current,  { y: edge==='top'?'-101%':'101%' }, 0)
      .set(marqueeInner.current,{ y: edge==='top'?'101%':'-101%' }, 0)
      .to([marqueeRef.current, marqueeInner.current], { y:'0%' }, 0);
  };

  const onLeave = e => {
    if (!itemRef.current) return;
    const r = itemRef.current.getBoundingClientRect();
    const edge = closestEdge(e.clientX-r.left, e.clientY-r.top, r.width, r.height);
    gsap.timeline({ defaults:{duration:.5,ease:'expo'} })
      .to(marqueeRef.current,  { y: edge==='top'?'-101%':'101%' }, 0)
      .to(marqueeInner.current,{ y: edge==='top'?'101%':'-101%' }, 0);
  };

  return (
    <div className="menu__item" ref={itemRef} onClick={onSelect} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="menu__item-link" style={{ color }}>
        <span className="menu-icon">{icon}</span>
        <span>{text}</span>
        <span className="menu-desc">{desc}</span>
      </div>
      <div className="marquee" ref={marqueeRef} style={{ background: bgColor || 'var(--accent)', opacity:1 }}>
        <div className="marquee__inner-wrap">
          <div className="marquee__inner" ref={marqueeInner} aria-hidden>
            {Array.from({length:reps}).map((_,i) => (
              <div className="marquee__part" key={i} style={{ color: resolvedMarqueeColor }}>
                <span>{icon} {text}</span>
                <span className="sep">·</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FlowingMenu({ items=[], bgColor }) {
  return (
    <div className="menu-wrap" style={{ background: bgColor || 'var(--bg-card)' }}>
      <nav className="menu">
        {items.map((item,i) => <MenuItem key={i} {...item} />)}
      </nav>
    </div>
  );
}