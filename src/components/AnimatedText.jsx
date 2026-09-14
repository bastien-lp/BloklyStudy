import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';

export function BlurFade({ children, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, filter: 'blur(12px)', y: 20 }}
      animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Cycles through `words` in place.
 *
 * The longest word is also rendered invisibly, in flow, to hold the slot open:
 * it fixes the width so the headline never re-wraps mid-animation, and it gives
 * the inline box a normal text baseline so the word sits on the same line as the
 * words around it. The visible word is layered on top and centred in that slot.
 */
export function WordRotate({ words, style }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex(i => (i + 1) % words.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [words]);

  const widest = words.reduce((a, b) => (b.length > a.length ? b : a), words[0] ?? '');

  return (
    <span style={{ position: 'relative', display: 'inline-block', whiteSpace: 'nowrap' }}>
      {/* Holds the width and the baseline; never painted, never read aloud. */}
      <span aria-hidden="true" style={{ visibility: 'hidden', ...style }}>{widest}</span>
      <AnimatePresence mode="wait">
        <motion.span
          key={index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.4 }}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, textAlign: 'center', ...style }}
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}