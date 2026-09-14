import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, getDoc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { BADGES, BADGE_ICONS } from '../data/badges';
import { useTranslation } from '../i18n';
import { reportSaveError } from '../lib/notify';

export default function UserProfileModal({ targetUid, targetPseudo, user, online=false, onClose, onOpenConv }) {
  const { t } = useTranslation();
  const [data, setData]         = useState(null);
  const [, setProfileDoc] = useState(null);
  const [lbData, setLbData]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [isFriend, setIsFriend] = useState(false);
  const [reqSent, setReqSent]   = useState(false);
  const [busy, setBusy]         = useState(false);
  const [expandedBadges, setExpandedBadges] = useState(false);
  const [selectedBadge, setSelectedBadge]   = useState(null);

  const isSelf = targetUid === user?.uid;
  const color  = `hsl(${(targetUid?.charCodeAt(0)*47||0)%360},60%,50%)`;

  useEffect(() => {
    if (!targetUid) return;
    Promise.all([
      getDoc(doc(db,'users',targetUid,'data','main')),
      getDoc(doc(db,'users',targetUid,'data','profile')),
      getDoc(doc(db,'leaderboard',targetUid)),
    ]).then(([mainSnap, profSnap, lbSnap]) => {
      if (mainSnap.exists()) setData(mainSnap.data());
      if (profSnap.exists()) setProfileDoc(profSnap.data());
      if (lbSnap.exists())   setLbData(lbSnap.data());
      setLoading(false);
    }).catch(()=>setLoading(false));
  }, [targetUid]);

  useEffect(() => {
    if (!user || !targetUid || isSelf) return;
    const unsub = onSnapshot(doc(db,'friends',user.uid,'list',targetUid), snap => setIsFriend(snap.exists()));
    return unsub;
  }, [user, targetUid, isSelf]);

  useEffect(() => {
    if (!user || !targetUid || isSelf) return;
    const unsub = onSnapshot(doc(db,'friendRequests',targetUid,'requests',user.uid), snap => setReqSent(snap.exists()));
    return unsub;
  }, [user, targetUid, isSelf]);

  async function sendRequest() {
    if (busy) return;
    setBusy(true);
    const myPseudo = user.displayName||user.email?.split('@')[0]||'Anonyme';
    try {
      await setDoc(doc(db,'friendRequests',targetUid,'requests',user.uid), {
        from:user.uid, fromPseudo:myPseudo, to:targetUid, toPseudo:targetPseudo,
        sentAt:new Date().toISOString(), status:'pending'
      });
    } catch(e){ reportSaveError(e); }
    setBusy(false);
  }

  async function cancelRequest() {
    if (busy) return;
    setBusy(true);
    try { await deleteDoc(doc(db,'friendRequests',targetUid,'requests',user.uid)); }
    catch(e){ reportSaveError(e); }
    setBusy(false);
  }

  const profile   = data?.profile || {};
  const privacy   = data?.profile?.privacy || {};
  const isPrivate = privacy.public === false; const onlineVisible = online && privacy.online !== false;
  const pseudo    = data?.profile?.pseudo || targetPseudo;
  const photo     = data?.photoURL;
  const xpTotal   = (lbData?.xp ?? data?.xp ?? 0);

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.82)',backdropFilter:'blur(16px)',
        zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem' }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <motion.div initial={{scale:.94,y:18}} animate={{scale:1,y:0}}
        style={{ background:'var(--bg-modal)',border:'1px solid var(--border-strong)',borderRadius:24,
          width:400,maxWidth:'100%',display:'flex',flexDirection:'column',
          maxHeight:'88vh',overflowY:'auto',overflowX:'hidden',boxShadow:'var(--card-shadow)' }}>

        {/* ── Bouton fermer ── */}
        <button aria-label="Fermer" onClick={onClose}
          style={{ position:'absolute', top:14, right:14, width:30, height:30, borderRadius:'50%',
            border:'1px solid var(--border)', background:'var(--bg-card)', color:'var(--text-muted)',
            fontSize:'1.1rem', cursor:'pointer', display:'flex', alignItems:'center',
            justifyContent:'center', zIndex:2 }}>×</button>

        <div style={{ padding:'1.6rem 1.5rem 1.5rem', display:'flex', flexDirection:'column', gap:14 }}>

          {/* Avatar + identité */}
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            {photo ? (
              <img src={photo} alt={pseudo}
                style={{ width:64,height:64,borderRadius:'50%',objectFit:'cover',flexShrink:0,
                  border:`2px solid ${color}`,boxShadow:`0 0 16px ${color}45` }} />
            ) : (
              <div style={{ width:64,height:64,borderRadius:'50%',flexShrink:0,
                background:`linear-gradient(135deg, ${color}, #9B59B6)`,
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:'1.6rem',fontWeight:800,color:'#fff',boxShadow:`0 0 16px ${color}45` }}>
                {(pseudo||'?')[0].toUpperCase()}
              </div>
            )}
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ fontSize:'1.15rem',fontWeight:800,color:'var(--text-primary)',marginBottom:3,
                lineHeight:1.2 }}>{pseudo}</div>
              <div style={{ display:'inline-flex',alignItems:'center',gap:5,padding:'2px 10px',borderRadius:20,
                background:onlineVisible?'rgba(39,174,96,.12)':'var(--bg-card)',
                border:`1px solid ${onlineVisible?'rgba(39,174,96,.3)':'var(--border)'}` }}>
                <div style={{ width:6,height:6,borderRadius:'50%',background:onlineVisible?'#27AE60':'var(--border-strong)',
                  boxShadow:onlineVisible?'0 0 6px #27AE60':'none' }} />
                <span style={{ fontSize:'.64rem',color:onlineVisible?'#27AE60':'var(--text-muted)',fontWeight:600 }}>
                  {onlineVisible?'En ligne':'Hors ligne'}
                </span>
              </div>
            </div>
          </div>

          {/* Infos école / filière mises en valeur */}
          {(profile.school || profile.studies || profile.year) && (
            <div style={{ display:'flex',flexDirection:'column',gap:7,padding:'12px 14px',borderRadius:14,
              background:'var(--bg-card)',border:'1px solid var(--border)' }}>
              {profile.school && (
                <div style={{ display:'flex',alignItems:'center',gap:9,fontSize:'.8rem',color:'var(--text-primary)' }}>
                  <span style={{ fontSize:'1rem' }}>🎓</span>
                  <span style={{ fontWeight:600 }}>{profile.school}</span>
                </div>
              )}
              {(profile.studies || profile.year) && (
                <div style={{ display:'flex',alignItems:'center',gap:9,fontSize:'.8rem',color:'var(--text-secondary)' }}>
                  <span style={{ fontSize:'1rem' }}>📖</span>
                  <span>{profile.studies}{profile.studies&&profile.year?' · ':''}
                    {profile.year && <span style={{ color:'var(--text-muted)' }}>{profile.year}</span>}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          {!isSelf && (
            <div style={{ display:'flex',gap:8 }}>
              {isFriend ? (
                <div style={{ flex:1,padding:'10px',borderRadius:12,textAlign:'center',
                  background:'rgba(39,174,96,.12)',border:'1px solid rgba(39,174,96,.3)',
                  color:'#27AE60',fontSize:'.82rem',fontWeight:700 }}>
                  ✓ Amis
                </div>
              ) : reqSent ? (
                <button onClick={cancelRequest} disabled={busy}
                  style={{ flex:1,padding:'10px',borderRadius:12,cursor:'pointer',
                    background:'transparent',border:'1px solid var(--border-strong)',
                    color:'var(--text-muted)',fontSize:'.8rem',fontWeight:600 }}>
                  ⏳ Demande envoyée · annuler
                </button>
              ) : (
                <motion.button whileHover={{scale:1.02}} whileTap={{scale:.98}}
                  onClick={sendRequest} disabled={busy}
                  style={{ flex:1,padding:'10px',borderRadius:12,cursor:'pointer',border:'none',
                    background:'linear-gradient(135deg,var(--accent),#6366f1)',
                    color:'#fff',fontSize:'.82rem',fontWeight:700,
                    boxShadow:'0 4px 14px var(--accent-glow)' }}>
                  + Ajouter en ami
                </motion.button>
              )}
              {isFriend && onOpenConv && (
                <motion.button whileHover={{scale:1.05}} whileTap={{scale:.95}}
                  onClick={()=>{ onClose(); onOpenConv({ uid:targetUid, pseudo, photoURL:photo||null }); }}
                  style={{ padding:'10px 16px',borderRadius:12,cursor:'pointer',
                    background:'var(--accent-subtle)',border:'1px solid var(--accent)',
                    color:'var(--accent)',fontSize:'.95rem',fontWeight:700 }}>
                  💬
                </motion.button>
              )}
            </div>
          )}

          {/* Bio */}
          {profile.bio && (
            <div style={{ position:'relative',padding:'14px 16px 14px 18px',borderRadius:14,
              background:'var(--accent-subtle)',border:'1px solid var(--accent)',
              fontSize:'.84rem',lineHeight:1.55,color:'var(--text-primary)' }}>
              <span style={{ position:'absolute',left:8,top:6,fontSize:'1.4rem',
                color:'var(--accent)',opacity:.5,fontFamily:'Georgia,serif',lineHeight:1 }}>“</span>
              <span style={{ fontStyle:'italic' }}>{profile.bio}</span>
            </div>
          )}

          {loading ? (
            <div style={{ textAlign:'center',color:'var(--text-muted)',fontSize:'.82rem',padding:'1rem' }}>Chargement…</div>
          ) : isPrivate ? (
            <div style={{ textAlign:'center',color:'var(--text-muted)',fontSize:'.85rem',padding:'1.5rem',
              background:'var(--bg-card)',borderRadius:14,border:'1px solid var(--border)' }}>
              🔒 Ce profil est privé
            </div>
          ) : (
            <>
              {/* Stats */}
              {privacy.stats !== false && (
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8 }}>
                  {[
                    {ico:'⚡', v:xpTotal.toLocaleString('fr-FR'), l:'XP total',     c:'var(--xp-color)'},
                    {ico:'🎮', v:data?.level||1,                  l:'Niveau',       c:'var(--accent)'},
                    {ico:'🔥', v:data?.streak||0,                 l:'Streak',       c:'#F1C40F'},
                    {ico:'⏱', v:Math.round((data?.totalFocusHours||0)*10)/10, l:'Heures focus', c:'#9B59B6'},
                  ].map((s,i)=>(
                    <div key={i} style={{ padding:'12px 10px',borderRadius:14,
                      background:'var(--bg-card-hover)',border:`1px solid ${s.c}25`,
                      display:'flex',alignItems:'center',gap:10 }}>
                      <span style={{ fontSize:'1.2rem' }}>{s.ico}</span>
                      <div>
                        <div style={{ fontSize:'1rem',fontWeight:900,color:s.c,lineHeight:1.1 }}>{s.v}</div>
                        <div style={{ fontSize:'.58rem',color:'var(--text-muted)' }}>{s.l}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Badges */}
              {privacy.badges !== false && data?.earnedBadges?.length > 0 && (() => {
                const earned = data.earnedBadges;
                const shown  = expandedBadges ? earned : earned.slice(0,12);
                return (
                  <div>
                    <div style={{ fontSize:'.7rem',fontWeight:700,color:'var(--text-muted)',
                      marginBottom:8,textTransform:'uppercase',letterSpacing:'.06em' }}>
                      🏆 Badges ({earned.length})
                    </div>
                    <div style={{ display:'flex',gap:7,flexWrap:'wrap' }}>
                      {shown.map((bid,i)=>{
                        const b = BADGES.find(x=>x.id===bid);
                        return (
                          <button key={i}
                            onClick={()=>setSelectedBadge(b||{ico:'🏅',name:t('badges.generic_name'),desc:t('badges.generic_desc')})}
                            title={b?t('badges.'+b.id+'_name'):''}
                            style={{ width:36,height:36,borderRadius:11,cursor:'pointer',padding:0,
                              background:'var(--accent-subtle)',border:'1px solid var(--accent)',
                              display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1rem',
                              transition:'transform .1s' }}
                            onMouseEnter={e=>e.currentTarget.style.transform='scale(1.14)'}
                            onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
                            {BADGE_ICONS[bid]||'🏅'}
                          </button>
                        );
                      })}
                      {!expandedBadges && earned.length>12 && (
                        <button onClick={()=>setExpandedBadges(true)}
                          style={{ width:36,height:36,borderRadius:11,background:'var(--bg-card)',cursor:'pointer',
                            border:'1px solid var(--border)',display:'flex',alignItems:'center',
                            justifyContent:'center',fontSize:'.62rem',color:'var(--text-muted)',fontWeight:700 }}>
                          +{earned.length-12}
                        </button>
                      )}
                      {expandedBadges && earned.length>12 && (
                        <button onClick={()=>setExpandedBadges(false)} title={t('stats.collapse')}
                          style={{ width:36,height:36,borderRadius:11,background:'var(--bg-card)',cursor:'pointer',
                            border:'1px solid var(--border)',display:'flex',alignItems:'center',
                            justifyContent:'center',fontSize:'.8rem',color:'var(--text-muted)',fontWeight:700 }}>
                          ▲
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Matières */}
              {data?.subjects?.length > 0 && (
                <div>
                  <div style={{ fontSize:'.7rem',fontWeight:700,color:'var(--text-muted)',
                    marginBottom:8,textTransform:'uppercase',letterSpacing:'.06em' }}>
                    📚 Matières ({data.subjects.length})
                  </div>
                  <div style={{ display:'flex',gap:6,flexWrap:'wrap',alignItems:'center' }}>
                    {data.subjects.map((s,i)=>(
                      <span key={i} style={{ display:'inline-flex',alignItems:'center',gap:5,
                        padding:'5px 12px',borderRadius:10,fontSize:'.72rem',
                        fontWeight:600,background:`${s.color}14`,color:s.color,
                        border:`1px solid ${s.color}35`,whiteSpace:'nowrap' }}>
                        <span style={{ width:7,height:7,borderRadius:'50%',background:s.color,flexShrink:0 }} />
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Fiche détail badge */}
        <AnimatePresence>
          {selectedBadge && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              onClick={()=>setSelectedBadge(null)}
              style={{ position:'fixed',inset:0,zIndex:2100,background:'rgba(0,0,0,.6)',
                backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem' }}>
              <motion.div initial={{scale:.9,y:10}} animate={{scale:1,y:0}} exit={{scale:.9,opacity:0}}
                onClick={e=>e.stopPropagation()}
                style={{ background:'var(--bg-modal)',border:'1px solid var(--border-strong)',borderRadius:20,
                  padding:'2rem',width:260,maxWidth:'90vw',textAlign:'center',boxShadow:'var(--card-shadow)' }}>
                <div style={{ fontSize:'3rem',marginBottom:10 }}>{selectedBadge.ico||'🏅'}</div>
                <div style={{ fontSize:'1.05rem',fontWeight:800,color:'var(--text-primary)',marginBottom:8 }}>{selectedBadge.id?t('badges.'+selectedBadge.id+'_name'):(selectedBadge.name||'')}</div>
                <div style={{ fontSize:'.82rem',color:'var(--text-secondary)',lineHeight:1.5 }}>{selectedBadge.id?t('badges.'+selectedBadge.id+'_desc'):(selectedBadge.desc||'')}</div>
                {selectedBadge.xp ? (
                  <div style={{ display:'inline-block',marginTop:12,padding:'5px 14px',borderRadius:10,
                    background:'var(--accent-subtle)',border:'1px solid var(--accent)',
                    color:'var(--xp-color)',fontWeight:700,fontSize:'.8rem' }}>
                    +{selectedBadge.xp} XP
                  </div>
                ) : null}
                <button onClick={()=>setSelectedBadge(null)}
                  style={{ marginTop:16,padding:'8px',borderRadius:10,width:'100%',
                    border:'1px solid var(--border)',background:'transparent',
                    color:'var(--text-muted)',cursor:'pointer',fontSize:'.8rem' }}>
                  Fermer
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}