/**
 * DocCover — the visual face of a document in grids, chat bubbles and pickers.
 * --------------------------------------------------------------------------
 * Images show their real thumbnail (fetched with the user's token). Other
 * files get a drawn sheet of paper with a folded corner, tinted by kind, and
 * the extension on a label — so a wall of PDFs still reads as a desk of
 * notes rather than a list of identical icons.
 */

import { useEffect, useState } from 'react';
import { getDocObjectUrl } from '../../lib/docs';
import { visualFor, extensionLabel } from './docVisuals';

/** The drawn sheet. Pure SVG: scales to any height, follows the theme. */
function PaperSheet({ tint, label }) {
  return (
    <svg viewBox="0 0 120 90" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {/* soft shadow */}
      <rect x="37" y="15" width="50" height="66" rx="5" fill={tint} opacity=".18" />
      {/* sheet with folded corner */}
      <path d="M34 11 h36 l14 14 v53 a4 4 0 0 1 -4 4 h-46 a4 4 0 0 1 -4 -4 v-63 a4 4 0 0 1 4 -4 z"
        fill="var(--bg-modal)" stroke={tint} strokeOpacity=".55" strokeWidth="1.5" />
      <path d="M70 11 v10 a4 4 0 0 0 4 4 h10" fill="none" stroke={tint} strokeOpacity=".55" strokeWidth="1.5" strokeLinejoin="round" />
      {/* text lines */}
      {[34, 41, 48, 55].map((y, i) => (
        <line key={y} x1="40" y1={y} x2={i === 3 ? 62 : 76} y2={y}
          stroke="var(--text-muted)" strokeOpacity=".35" strokeWidth="2.2" strokeLinecap="round" />
      ))}
      {/* extension label */}
      <rect x="40" y="62" width="30" height="12" rx="3" fill={tint} />
      <text x="55" y="70.6" textAnchor="middle" fontSize="7" fontWeight="800" fill="#fff"
        fontFamily="var(--font-family), system-ui, sans-serif" letterSpacing=".4">{label}</text>
    </svg>
  );
}

export default function DocCover({ user, doc, height = 110, radius = 12 }) {
  const { tint } = visualFor(doc.kind);
  const [thumbUrl, setThumbUrl] = useState(null);

  useEffect(() => {
    if (!doc.hasThumb) return undefined;
    let alive = true;
    getDocObjectUrl(user, doc.id, 'thumb')
      .then(url => { if (alive) setThumbUrl(url); })
      .catch(() => {});
    return () => { alive = false; };
  }, [user, doc.id, doc.hasThumb]);

  return (
    <div style={{ height, borderRadius: radius, overflow: 'hidden', position: 'relative', flexShrink: 0,
      background: `linear-gradient(160deg, ${tint}14, ${tint}08)` }}>
      {thumbUrl ? (
        <img src={thumbUrl} alt="" loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <PaperSheet tint={tint} label={extensionLabel(doc.name) || '?'} />
      )}
    </div>
  );
}
