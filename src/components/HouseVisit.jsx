/**
 * HouseVisit — looking at someone else's house.
 * --------------------------------------------------------------------------
 * Read-only by construction: it loads the owner's `reserve` document once and
 * draws it. There is no handle, no drag, no button that writes anything — a
 * visitor is a guest.
 *
 * The rooms are drawn exactly as they are in the Réserve (same catalogue, same
 * placement maths in `cqw` units against a container query), so a house looks
 * the same to its owner and to a visitor.
 *
 * Whether the door opens at all is decided by lib/houseVisit.js and enforced
 * by the Firestore rules; this screen only reports what it is told.
 *
 * Props: { uid, pseudo, visibility, isFriend, isSelf, onClose }
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Home, X, ChevronLeft, Lock, DoorClosed } from 'lucide-react';
import { useTranslation } from '../i18n';
import { ROOMS, itemById } from '../lib/houseCatalog';
import { canVisitHouse, visitDenialReason, loadHouse, houseSize } from '../lib/houseVisit';

/** Where the floor starts, in percent of the room's height (as in the Réserve). */
const FLOOR_START = 68;

/** One room, with its furniture where the owner left it. */
function RoomCanvas({ room, items }) {
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', containerType: 'inline-size',
      borderRadius: 16, overflow: 'hidden', background: 'var(--bg-card)' }}>
      <img src={room.image} alt="" draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      {[...items].sort((a, b) => a.y - b.y).map(p => {
        const it = itemById(p.itemId);
        if (!it) return null;
        const sizePct = p.y <= FLOOR_START ? 16 : 16 + ((p.y - FLOOR_START) / (100 - FLOOR_START)) * 10;
        const sz = sizePct * (p.scale ?? 1) * (it.size ?? 1);
        return (
          <div key={p.uid} style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`,
            width: `${sz}cqw`, height: `${sz}cqw`,
            transform: `translate(-50%, -50%) rotate(${p.rot || 0}deg)`,
            zIndex: p.z != null ? 200 + p.z : Math.round(p.y) }}>
            {it.image
              ? <img src={it.image} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <span style={{ fontSize: `${sz * 0.8}cqw` }}>{it.emoji}</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function HouseVisit({ uid, pseudo, visibility, isFriend, isSelf, onClose }) {
  const { t } = useTranslation();
  const allowed = canVisitHouse({ visibility, isFriend, isSelf });
  // undefined = loading, null = unreadable, object = the house
  const [house, setHouse] = useState(allowed ? undefined : null);
  const [openRoom, setOpenRoom] = useState(null);

  useEffect(() => {
    if (!allowed) return undefined;
    let alive = true;
    loadHouse(uid)
      .then(data => { if (alive) setHouse(data); })
      .catch(() => { if (alive) setHouse(null); });
    return () => { alive = false; };
  }, [uid, allowed]);

  const denial = visitDenialReason({ visibility, isFriend, isSelf });
  const rooms = house ? ROOMS.filter(r => house.unlocked.includes(r.id)) : [];
  const active = openRoom ? ROOMS.find(r => r.id === openRoom) : null;
  const activeItems = openRoom ? (house?.rooms?.[openRoom]?.placedItems || []) : [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      role="dialog" aria-modal="true" aria-label={t('house.title', { name: pseudo || '' })}
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <motion.div initial={{ y: 16, scale: .97 }} animate={{ y: 0, scale: 1 }} transition={{ duration: .22, ease: 'easeOut' }}
        style={{ width: 640, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14,
          background: 'var(--bg-modal)', borderRadius: 22, padding: '1.2rem', boxShadow: 'var(--card-shadow)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {active ? (
            <button type="button" onClick={() => setOpenRoom(null)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '7px 13px 7px 9px', borderRadius: 20,
                border: 'none', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer',
                fontSize: '.75rem', fontWeight: 600 }}>
              <ChevronLeft size={15} strokeWidth={2.4} /> {t('house.allRooms')}
            </button>
          ) : (
            <span style={{ width: 36, height: 36, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
              <Home size={18} aria-hidden="true" />
            </span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {active ? t(`reserveRooms.${active.id}`) : t('house.title', { name: pseudo || t('stats.anon') })}
            </div>
            {house && (
              <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>
                {active
                  ? t('house.itemsHere', { count: activeItems.length })
                  : t('house.summary', { rooms: rooms.length, items: houseSize(house) })}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        {!allowed ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '2rem 1rem', textAlign: 'center' }}>
            <span style={{ width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
              {denial === 'friendsOnly' ? <Lock size={20} /> : <DoorClosed size={20} />}
            </span>
            <div style={{ fontSize: '.8rem', color: 'var(--text-secondary)', maxWidth: 320, lineHeight: 1.6 }}>
              {t(denial === 'friendsOnly' ? 'house.friendsOnly' : 'house.closed', { name: pseudo || '' })}
            </div>
          </div>
        ) : house === undefined ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '.8rem', padding: '2rem' }}>{t('common.loading')}</div>
        ) : house === null ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '.8rem', padding: '2rem', lineHeight: 1.6 }}>
            {t('house.unavailable')}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {active ? (
              <motion.div key="room" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <RoomCanvas room={active} items={activeItems} />
              </motion.div>
            ) : (
              <motion.div key="rooms" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
                {rooms.map(room => {
                  const items = house.rooms?.[room.id]?.placedItems || [];
                  return (
                    <button key={room.id} type="button" onClick={() => setOpenRoom(room.id)}
                      style={{ all: 'unset', cursor: 'pointer', borderRadius: 16, overflow: 'hidden', position: 'relative' }}>
                      <RoomCanvas room={room} items={items} />
                      <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 400, padding: '26px 12px 10px',
                        fontSize: '.74rem', fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,.5)',
                        background: 'linear-gradient(transparent, rgba(18,12,6,.82))' }}>
                        {t(`reserveRooms.${room.id}`)} · {t('house.itemsHere', { count: items.length })}
                      </span>
                    </button>
                  );
                })}
                {rooms.length === 0 && (
                  <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{t('house.empty')}</div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </motion.div>
    </motion.div>
  );
}
