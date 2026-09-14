import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sprout, Store, Home, Leaf, Scissors, Check, TrendingUp,
  ChevronLeft, ChevronRight, Lock, Unlock, RotateCw, Plus, Minus,
  ArrowUp, ArrowDown, Trash2, X,
} from 'lucide-react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useTranslation } from '../i18n';
import { GuidedTour, useGuidedTour, TourButton } from '../components/GuidedTour';
import { reportSaveError } from '../lib/notify';
import { asset } from '../lib/assets';

const BASE_GROWTH = 5;
const GROWTH_PER_LEVEL = 15;
const BASE_COINS = 10;
const COINS_PER_LEVEL = 5;
const BAMBOOS_PER_LEVEL = 3;

const growthTarget = lvl => BASE_GROWTH + (lvl - 1) * GROWTH_PER_LEVEL;
const coinValue    = lvl => BASE_COINS + (lvl - 1) * COINS_PER_LEVEL;

const ROOMS = [
  { id: 'piece',        image: asset('reserve/rooms/piece.jpg'),        unlockXp: 0,    unlockCoins: 0   },
  { id: 'bureau',       image: asset('reserve/rooms/bureau.jpg'),       unlockXp: 500,  unlockCoins: 150 },
  { id: 'cuisine',      image: asset('reserve/rooms/cuisine.jpg'),      unlockXp: 1500, unlockCoins: 300 },
  { id: 'salleDeBains', image: asset('reserve/rooms/salleDeBains.jpg'), unlockXp: 3000, unlockCoins: 500 },
];

const D = asset('reserve/deco/');

// size = taille de base relative (1 = standard). Ajuste ces valeurs au besoin.
const SHOP_CATALOG = [
  { id: 'armoire',    image: D + 'armoir.png',     name: 'Armoire',     cat: 'Meubles',     price: 120, type: 'sol',     size: 1.4 },
  { id: 'bureau',     image: D + 'bureau.png',     name: 'Bureau',      cat: 'Meubles',     price: 110, type: 'sol',     size: 1.3 },
  { id: 'cadre',      image: D + 'cadre.png',      name: 'Cadre',       cat: 'Peintures',   price: 40,  type: 'mur',     size: 0.8 },
  { id: 'chaise',     image: D + 'chaise.png',     name: 'Chaise',      cat: 'Meubles',     price: 60,  type: 'sol',     size: 1.0 },
  { id: 'commode',    image: D + 'commode.png',    name: 'Commode',     cat: 'Meubles',     price: 100, type: 'sol',     size: 1.2 },
  { id: 'gardeRobe',  image: D + 'gardeRobe.png',  name: 'Garde-robe',  cat: 'Meubles',     price: 130, type: 'sol',     size: 1.5 },
  { id: 'globe',      image: D + 'globe.png',      name: 'Globe',       cat: 'Décorations', price: 55,  type: 'surface', size: 0.6 },
  { id: 'hautVent',   image: D + 'HautVent.png',   name: 'Haut-vent',   cat: 'Meubles',     price: 90,  type: 'sol',     size: 1.2 },
  { id: 'lit',        image: D + 'lit.png',        name: 'Lit',         cat: 'Meubles',     price: 140, type: 'sol',     size: 1.6 },
  { id: 'livres',     image: D + 'livres.png',     name: 'Livres',      cat: 'Décorations', price: 45,  type: 'surface', size: 0.7 },
  { id: 'meubleTV',   image: D + 'meubleTV.png',   name: 'Meuble TV',   cat: 'Meubles',     price: 95,  type: 'sol',     size: 1.3 },
  { id: 'plante',     image: D + 'plante.png',     name: 'Plante',      cat: 'Plantes',     price: 40,  type: 'sol',     size: 0.9 },
  { id: 'siege',      image: D + 'siège.png',      name: 'Siège',       cat: 'Meubles',     price: 70,  type: 'sol',     size: 1.0 },
  { id: 'table',      image: D + 'table.png',      name: 'Table',       cat: 'Meubles',     price: 85,  type: 'sol',     size: 1.1 },
  { id: 'tablebasse', image: D + 'tablebasse.png', name: 'Table basse', cat: 'Meubles',     price: 75,  type: 'sol',     size: 0.9 },
  { id: 'tabouret',   image: D + 'tabouret.png',   name: 'Tabouret',    cat: 'Meubles',     price: 50,  type: 'sol',     size: 0.7 },
  { id: 'vase',           image: D + 'vase1.png',           name: 'Vase',             cat: 'Décorations', price: 35,  type: 'surface', size: 0.6 },
  { id: 'baignoire',      image: D + 'baignoire .png',      name: 'Baignoire',        cat: 'Meubles',     price: 130, type: 'sol',     size: 1.4 },
  { id: 'escabot',        image: D + 'escabot.png',         name: 'Escabeau',         cat: 'Meubles',     price: 45,  type: 'sol',     size: 0.7 },
  { id: 'etagere',        image: D + 'étagèreMurale.png',   name: 'Étagère murale',   cat: 'Meubles',     price: 80,  type: 'mur',     size: 1.1 },
  { id: 'evier',          image: D + 'évier.png',           name: 'Évier',            cat: 'Meubles',     price: 100, type: 'sol',     size: 1.2 },
  { id: 'meuble',         image: D + 'meuble.png',          name: 'Meuble',           cat: 'Meubles',     price: 70,  type: 'sol',     size: 1.1 },
  { id: 'miroire',        image: D + 'miroire.png',         name: 'Miroir',           cat: 'Décorations', price: 60,  type: 'mur',     size: 1.0 },
  { id: 'portePapier',    image: D + 'portePapier.png',     name: 'Porte-papier',     cat: 'Décorations', price: 25,  type: 'mur',     size: 0.5 },
  { id: 'porteServiette', image: D + 'porteServiette.png',  name: 'Porte-serviette',  cat: 'Décorations', price: 30,  type: 'mur',     size: 0.6 },
  { id: 'poubelle',       image: D + 'poubelle.png',        name: 'Poubelle',         cat: 'Décorations', price: 20,  type: 'sol',     size: 0.5 },
  { id: 'toilette',        image: D + 'toilette.png',          name: 'Toilettes',        cat: 'Meubles',     price: 90,  type: 'sol',     size: 1.0 },
  { id: '3sf',             image: D + '3sf.png',               name: 'Canapé 3 places',  cat: 'Meubles',     price: 150, type: 'sol',     size: 1.6 },
  { id: 'bougieEtagere',   image: D + 'bougieEtagere.png',     name: 'Bougies étagère',  cat: 'Décorations', price: 30,  type: 'surface', size: 0.6 },
  { id: 'cadre1',          image: D + 'cadre1.png',            name: 'Cadre montagne',   cat: 'Peintures',   price: 45,  type: 'mur',     size: 0.8 },
  { id: 'cadre2',          image: D + 'cadre2.png',            name: 'Cadre minimaliste',cat: 'Peintures',   price: 40,  type: 'mur',     size: 0.7 },
  { id: 'cadre3',          image: D + 'cadre3.png',            name: 'Cadre fruits',     cat: 'Peintures',   price: 40,  type: 'mur',     size: 0.7 },
  { id: 'coussins',        image: D + 'coussins.png',          name: 'Coussins',         cat: 'Décorations', price: 35,  type: 'surface', size: 0.7 },
  { id: 'couverture',      image: D + 'couverturePliee.png',        name: 'Couverture',       cat: 'Décorations', price: 30,  type: 'surface', size: 0.8 },
  { id: 'ensembleCadre',   image: D + 'ensembleCadre.png',     name: 'Ensemble cadres',  cat: 'Peintures',   price: 70,  type: 'mur',     size: 1.1 },
  { id: 'epices',          image: D + 'épices.png',            name: 'Épices',           cat: 'Décorations', price: 25,  type: 'surface', size: 0.6 },
  { id: 'etagere2',        image: D + 'étagère.png',           name: 'Étagère',          cat: 'Meubles',     price: 75,  type: 'mur',     size: 1.0 },
  { id: 'fleurs',          image: D + 'fleurs.png',            name: 'Fleurs',           cat: 'Plantes',     price: 40,  type: 'surface', size: 0.7 },
  { id: 'horlogeAncienne', image: D + 'horlogeAncienne.png',   name: 'Horloge ancienne', cat: 'Décorations', price: 80,  type: 'mur',     size: 0.9 },
  { id: 'lampe',           image: D + 'lampe.png',             name: 'Lampe de chevet',  cat: 'Meubles',     price: 55,  type: 'surface', size: 0.8 },
  { id: 'miroire2',        image: D + 'miroire2.png',          name: 'Grand miroir',     cat: 'Décorations', price: 90,  type: 'mur',     size: 1.2 },
  { id: 'petitLivre',      image: D + 'petitLivre.png',        name: 'Livres empilés',   cat: 'Décorations', price: 20,  type: 'surface', size: 0.5 },
  { id: 'plante2',         image: D + 'plante2.png',           name: 'Plante en pot',    cat: 'Plantes',     price: 45,  type: 'sol',     size: 0.9 },
  { id: 'planteHaute',     image: D + 'PlanteHaute.png',       name: 'Plante haute',     cat: 'Plantes',     price: 60,  type: 'sol',     size: 1.2 },
  { id: 'porteMenteau',    image: D + 'porteMenteau.png',      name: 'Porte-manteau',    cat: 'Meubles',     price: 50,  type: 'sol',     size: 1.1 },
  { id: 'savon',           image: D + 'savon.png',             name: 'Savon',            cat: 'Décorations', price: 10,  type: 'surface', size: 0.4 },
  { id: 'tapisenroule',    image: D + 'tapisenroule.png',      name: 'Tapis roulé',      cat: 'Décorations', price: 40,  type: 'sol',     size: 0.8 },
  { id: 'verre',           image: D + 'verre.png',             name: 'Verre',            cat: 'Décorations', price: 10,  type: 'surface', size: 0.4 },
];
const itemById = id => SHOP_CATALOG.find(i => i.id === id);

// Prix dynamique : +25% par exemplaire déjà possédé (offre/demande locale).
// Plus tu accumules le même objet, plus le suivant est cher.
const PRICE_STEP = 0.25;
function dynamicPrice(item, owned = 0) {
  return Math.round(item.price * (1 + owned * PRICE_STEP));
}

// Affiche soit l'image de l'objet, soit son emoji en repli
function ItemVisual({ item, size }) {
  if (item.image) {
    return <img src={item.image} alt={item.name}
      style={{ width: size, height: size, objectFit: 'contain', display: 'block' }} />;
  }
  return <span style={{ fontSize: size, lineHeight: 1 }}>{item.emoji}</span>;
}

// Emplacements de la pièce (v1 : une seule pièce)
// Plus d'emplacements fixes : placement libre.
// Chaque objet placé = { uid, itemId, x, y } en % de la pièce.
// La profondeur (qui passe devant) est déterminée par y : plus bas = devant.


function weekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${week}`;
}

function diversityBonus(count) {
  if (count >= 5) return 0.5;
  if (count >= 3) return 0.2;
  return 0;
}

/* ── Palette de la scène ──────────────────────────────────────────────────
   Le jardin et la boutique sont des décors illustrés : leurs couleurs sont
   fixes (matin brumeux, bois, verdure) et ne suivent pas le thème de l'app,
   exactement comme une illustration. Seule la couleur de la matière varie. */
const SCENE = {
  skyTop:    '#E8F1DF',
  skyMid:    '#F6EFE2',
  skyLow:    '#EFE2CB',
  soil:      '#A87C4F',
  soilDark:  '#7E5833',
  bark:      '#6B4A2F',
  barkLight: '#8C6440',
  cream:     '#FBF4E7',
  ink:       '#3B3226',
  inkSoft:   '#83705A',
  leaf:      '#4F7A38',
  leafDeep:  '#2F5223',
  amber:     '#E0A03C',
};

/** Pièce de bambou — la monnaie du jardin. */
function CoinIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill="#E9B44C" />
      <circle cx="12" cy="12" r="10" fill="none" stroke="#B07E28" strokeWidth="1.4" />
      <ellipse cx="9.5" cy="8" rx="4.5" ry="3" fill="#fff" opacity=".28" />
      <path d="M12 6.4v11.2" stroke="#8A5E18" strokeWidth="1.6" strokeLinecap="round" opacity=".75" />
      <path d="M9.4 9.2h5.2M9.4 14.8h5.2" stroke="#8A5E18" strokeWidth="1.3" strokeLinecap="round" opacity=".5" />
    </svg>
  );
}

/** Décor du jardin : halo de soleil et silhouettes de bambous lointains. */
function GardenBackdrop() {
  const distant = [6, 14, 23, 38, 52, 61, 74, 83, 92];
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <defs>
        <radialGradient id="rsvSun" cx="82%" cy="6%" r="55%">
          <stop offset="0%" stopColor="#FFE9B0" stopOpacity=".85" />
          <stop offset="100%" stopColor="#FFE9B0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rsvHaze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9FBE86" stopOpacity=".38" />
          <stop offset="100%" stopColor="#9FBE86" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#rsvSun)" />
      {/* bambous lointains : de simples traits verticaux fondus dans la brume */}
      {distant.map((x, i) => (
        <rect key={x} x={x} y={i % 2 ? 2 : 8} width={i % 3 ? 0.7 : 1.1} height={i % 2 ? 62 : 54}
          fill="url(#rsvHaze)" rx="0.4" />
      ))}
    </svg>
  );
}

const STALK_SEGMENTS = 6;
const SEGMENT_H = 19;      // hauteur d'un entre-nœud, en unités du viewBox
const SOIL_Y = 152;        // ligne de terre dans le viewBox

/** Une tige : entre-nœuds empilés, qui s'affine et s'incline vers le haut. */
function BambooStalk({ baseX, lean, depth, delay, grown, mature }) {
  // depth 0 = premier plan net, 1 = arrière-plan fondu dans la brume
  const scale = 1 - depth * 0.22;
  const tint = depth === 0 ? SCENE.leaf : '#7E9B6B';
  const edge = depth === 0 ? SCENE.leafDeep : '#5C7A4C';
  const nodes = Math.max(0, grown - depth);
  return (
    <motion.g
      animate={{ rotate: mature ? [0, 1.1, 0, -1.1, 0] : [0, 0.5, 0, -0.5, 0] }}
      transition={{ duration: 5.5 + delay, repeat: Infinity, ease: 'easeInOut', delay }}
      style={{ originX: `${baseX}px`, originY: `${SOIL_Y}px` }}
      opacity={depth === 0 ? 1 : 0.55}>
      {Array.from({ length: STALK_SEGMENTS }).map((_, i) => {
        const isGrown = i < nodes;
        const h = SEGMENT_H * scale;
        const yBottom = SOIL_Y - i * h;
        const yTop = yBottom - h + 2.5;              // le creux laissé = le nœud
        const xBottom = baseX + lean * i * 1.1;
        const xTop = baseX + lean * (i + 1) * 1.1;
        const wB = (5.4 - i * 0.42) * scale;
        const wT = (5.4 - (i + 1) * 0.42) * scale;
        const leafDir = i % 2 ? 1 : -1;
        return (
          <g key={i} style={{ opacity: isGrown ? 1 : 0.08, transition: 'opacity .5s ease' }}>
            <path
              d={`M${xBottom - wB} ${yBottom} L${xTop - wT} ${yTop} L${xTop + wT} ${yTop} L${xBottom + wB} ${yBottom} Z`}
              fill={tint} />
            {/* lumière rasante sur le flanc gauche de la tige */}
            <path
              d={`M${xBottom - wB} ${yBottom} L${xTop - wT} ${yTop} L${xTop - wT * 0.35} ${yTop} L${xBottom - wB * 0.35} ${yBottom} Z`}
              fill="#fff" opacity=".22" />
            <line x1={xTop - wT - 0.6} y1={yTop} x2={xTop + wT + 0.6} y2={yTop}
              stroke={edge} strokeWidth={1.3 * scale} strokeLinecap="round" />
            {/* feuilles, à partir du 2e entre-nœud */}
            {isGrown && i >= 1 && (
              <g fill={tint}>
                <path d={`M${xTop + wT * leafDir} ${yTop + 5}
                          Q${xTop + 17 * leafDir * scale} ${yTop - 4}
                           ${xTop + 12 * leafDir * scale} ${yTop + 8}
                          Q${xTop + 7 * leafDir * scale} ${yTop + 8} ${xTop + wT * leafDir} ${yTop + 5} Z`} />
                <path d={`M${xTop - wT * leafDir} ${yTop + 9}
                          Q${xTop - 13 * leafDir * scale} ${yTop + 2}
                           ${xTop - 9 * leafDir * scale} ${yTop + 13}
                          Q${xTop - 5 * leafDir * scale} ${yTop + 12} ${xTop - wT * leafDir} ${yTop + 9} Z`}
                  opacity=".82" />
              </g>
            )}
          </g>
        );
      })}
  </motion.g>
);
}

/**
 * Un bouquet de bambous poussant à même la terre.
 * `pct` (0 → 1) pilote le nombre d'entre-nœuds sortis ; à 1 la plante est mûre
 * et reçoit un halo chaud. `accent` est la couleur de la matière.
 */
function BambooPlant({ pct, accent }) {
  const mature = pct >= 1;
  const grown = Math.max(1, Math.round(pct * STALK_SEGMENTS));

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 132 }}>
      {/* halo de maturité : la plante est prête à être coupée */}
      <AnimatePresence>
        {mature && (
          <motion.div key="glow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: '-8% -16% 6%', borderRadius: '50%', pointerEvents: 'none',
              background: `radial-gradient(circle at 50% 55%, ${accent}2e 0%, rgba(255,220,140,.3) 38%, transparent 70%)` }} />
        )}
      </AnimatePresence>

      <svg viewBox="0 0 120 172" style={{ width: '100%', display: 'block', overflow: 'visible' }}>
        {/* lit de terre : une tache douce, surtout pas un cadre */}
        <ellipse cx="60" cy={SOIL_Y + 6} rx="46" ry="11" fill={SCENE.soil} opacity=".22" />
        {/* ombre portée du bouquet */}
        <ellipse cx="60" cy={SOIL_Y + 3} rx="27" ry="6" fill={SCENE.soilDark} opacity=".28" />

        {/* tiges : 2 en arrière-plan fondues, 3 au premier plan */}
        <BambooStalk baseX={48} lean={-1.5} depth={1} delay={1.1} grown={grown} mature={mature} />
        <BambooStalk baseX={73} lean={1.6} depth={1} delay={1.7} grown={grown} mature={mature} />
        <BambooStalk baseX={54} lean={-0.9} depth={0} delay={0} grown={grown} mature={mature} />
        <BambooStalk baseX={60} lean={0.25} depth={0} delay={0.6} grown={grown} mature={mature} />
        <BambooStalk baseX={67} lean={1.1} depth={0} delay={1.3} grown={grown} mature={mature} />

        {/* motte de terre et touffes d'herbe, par-dessus le pied des tiges */}
        <path d={`M28 ${SOIL_Y} Q60 ${SOIL_Y - 9} 92 ${SOIL_Y} Q60 ${SOIL_Y + 12} 28 ${SOIL_Y} Z`} fill={SCENE.soil} />
        <path d={`M28 ${SOIL_Y} Q60 ${SOIL_Y - 9} 92 ${SOIL_Y} Q60 ${SOIL_Y - 3} 28 ${SOIL_Y} Z`} fill={SCENE.soilDark} opacity=".45" />
        <g stroke={SCENE.leafDeep} strokeWidth="1.6" strokeLinecap="round" fill="none" opacity=".7">
          <path d={`M36 ${SOIL_Y} q-4 -6 -1 -10`} />
          <path d={`M41 ${SOIL_Y + 1} q3 -7 8 -9`} />
          <path d={`M80 ${SOIL_Y} q5 -6 2 -11`} />
          <path d={`M85 ${SOIL_Y + 1} q-3 -6 -8 -8`} />
        </g>

        {/* particules de lumière quand la plante est mûre */}
        {mature && [0, 1, 2].map(i => (
          <motion.circle key={i} cx={44 + i * 16} r={1.8} fill="#FFD98A"
            initial={{ cy: SOIL_Y - 20, opacity: 0 }}
            animate={{ cy: [SOIL_Y - 20, 34], opacity: [0, 0.9, 0] }}
            transition={{ duration: 3.4, repeat: Infinity, delay: i * 1.1, ease: 'easeOut' }} />
        ))}
      </svg>
    </div>
  );
}
export default function PageReserve({ user }) {
  const { t } = useTranslation();
  const tour = useGuidedTour('home');
  const [subjects, setSubjects] = useState([]);
  const [reserve, setReserve] = useState({
    studyTime: {}, harvested: {}, coins: 0,
    potLevels: {}, potProgress: {}, diversity: { week: '', subjects: [] },
    purchasedCounts: {}, placedItems: [],
  });
  const [tab, setTab] = useState('garden');
  const [activeRoomId, setActiveRoomId] = useState(null); // null = vue plan
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [selectedUid, setSelectedUid] = useState(null);
  const [userXp, setUserXp] = useState(0); // objet sélectionné (double-tap)
  const roomRef = useRef(null);
  const lastTapRef = useRef({ uid: null, time: 0 });

  // Détecte un double-tap manuellement (Motion intercepte onDoubleClick)
  function handleTap(uid) {
    const now = Date.now();
    if (lastTapRef.current.uid === uid && now - lastTapRef.current.time < 350) {
      setSelectedUid(uid);
      lastTapRef.current = { uid: null, time: 0 };
    } else {
      lastTapRef.current = { uid, time: now };
    }
  }
  const [roomSize, setRoomSize] = useState({ w: 0, h: 0 });

  // Mesure la pièce et la remesure dès qu'elle change de taille (resize, rotation…)
  useEffect(() => {
    if (!roomRef.current) return;
    const el = roomRef.current;
    function measure() {
      const r = el.getBoundingClientRect();
      if (r.width) setRoomSize({ w: r.width, h: r.height });
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [tab]);
  const [loading, setLoading] = useState(true);
  const [harvestFx, setHarvestFx] = useState(null);
  const [shopCat, setShopCat] = useState('Tout');
  const [buyFx, setBuyFx] = useState(null);
  const [shopMsg, setShopMsg] = useState(null); // bulle de dialogue de la marchande
 

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'data', 'main'), snap => {
      if (snap.exists()) {
        setSubjects(snap.data().subjects || []);
        setUserXp(snap.data().xp || 0);
      }
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'data', 'reserve'), snap => {
      if (snap.exists()) {
        const d = snap.data();
        setReserve({
          studyTime: d.studyTime || {},
          harvested: d.harvested || {},
          coins: d.coins || 0,
          potLevels: d.potLevels || {},
          potProgress: d.potProgress || {},
          diversity: d.diversity || { week: '', subjects: [] },
          purchasedCounts: d.purchasedCounts || {},
          rooms: d.rooms || {},
          unlockedRooms: d.unlockedRooms || ['piece'],
        });
      }
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const currentWeek = weekKey();
  const divSubjects = reserve.diversity.week === currentWeek ? reserve.diversity.subjects : [];
  const bonus = diversityBonus(divSubjects.length);

  // Inventaire disponible = acheté - placé
  function availableCount(itemId) {
    const owned = reserve.purchasedCounts[itemId] || 0;
    // compte dans toutes les pièces
    const placedTotal = Object.values(reserve.rooms || {})
      .flatMap(r => r.placedItems || [])
      .filter(p => p.itemId === itemId).length;
    return owned - placedTotal;
  }

  async function harvest(subjId) {
    const lvl = reserve.potLevels[subjId] || 1;
    const target = growthTarget(lvl);
    const total = reserve.studyTime[subjId] || 0;
    const harvested = reserve.harvested[subjId] || 0;
    const available = Math.max(0, total - harvested);
    const matureCount = Math.floor(available / target);
    if (matureCount < 1) return;

    const baseGain = matureCount * coinValue(lvl);
    const gained = Math.round(baseGain * (1 + bonus));

    let newLevel = lvl;
    let newProgress = (reserve.potProgress[subjId] || 0) + matureCount;
    while (newProgress >= BAMBOOS_PER_LEVEL) { newProgress -= BAMBOOS_PER_LEVEL; newLevel += 1; }

    let divList = reserve.diversity.week === currentWeek ? [...reserve.diversity.subjects] : [];
    if (!divList.includes(String(subjId))) divList.push(String(subjId));

    const newHarvested = { ...reserve.harvested, [subjId]: harvested + matureCount * target };
    const newCoins = (reserve.coins || 0) + gained;
    const newPotLevels = { ...reserve.potLevels, [subjId]: newLevel };
    const newPotProgress = { ...reserve.potProgress, [subjId]: newProgress };
    const newDiversity = { week: currentWeek, subjects: divList };

    setReserve(r => ({ ...r, harvested: newHarvested, coins: newCoins,
      potLevels: newPotLevels, potProgress: newPotProgress, diversity: newDiversity }));
    setHarvestFx({ subjId, coins: gained, levelUp: newLevel > lvl });
    setTimeout(() => setHarvestFx(null), 1600);

    try {
      await setDoc(doc(db, 'users', user.uid, 'data', 'reserve'), {
        harvested: newHarvested, coins: newCoins,
        potLevels: newPotLevels, potProgress: newPotProgress, diversity: newDiversity,
      }, { merge: true });
    } catch (e) { reportSaveError(e); }
  }

  // Répliques de la marchande selon le contexte
  function shopSay(text) {
    setShopMsg(text);
    clearTimeout(shopSay._t);
    shopSay._t = setTimeout(() => setShopMsg(null), 3500);
  }

  async function buy(item) {
    const owned = reserve.purchasedCounts[item.id] || 0;
    const price = dynamicPrice(item, owned);
    if ((reserve.coins || 0) < price) {
      shopSay('Reviens quand tu auras récolté un peu plus de bambou.');
      return;
    }
    if (price >= 120) shopSay('Une belle pièce, tu as l\'œil !');
    else if (owned >= 2) shopSay('Encore un ? Tu aimes vraiment celui-là, dis donc.');
    else shopSay('Et voilà, emballé c\'est pesé.');
    const newCoins = reserve.coins - price;
    const newCounts = { ...reserve.purchasedCounts, [item.id]: owned + 1 };
    setReserve(r => ({ ...r, coins: newCoins, purchasedCounts: newCounts }));
    setBuyFx(item.id);
    setTimeout(() => setBuyFx(null), 800);
    try {
      await setDoc(doc(db, 'users', user.uid, 'data', 'reserve'),
        { coins: newCoins, purchasedCounts: newCounts }, { merge: true });
    } catch (e) { reportSaveError(e); }
  }

  // Retourne les objets placés dans la pièce active
  function getPlacedItems() {
    if (!activeRoomId) return [];
    return reserve.rooms[activeRoomId]?.placedItems || [];
  }

  function persistPlaced(list) {
    if (!activeRoomId) return;
    const newRooms = { ...reserve.rooms, [activeRoomId]: { placedItems: list } };
    setReserve(r => ({ ...r, rooms: newRooms }));
    setDoc(doc(db, 'users', user.uid, 'data', 'reserve'), { rooms: newRooms }, { merge: true })
      .catch(e => reportSaveError(e));
  }

  function addObject(itemId) {
    const uid = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const placed = getPlacedItems();
    const maxZ = Math.max(0, ...placed.map(p => p.z || 0));
    const list = [...placed, { uid, itemId, x: 50, y: 75, rot: 0, scale: 1, z: maxZ + 1 }];
    persistPlaced(list);
    setAddPickerOpen(false);
    setSelectedUid(uid);
  }

  function moveObject(uid, x, y) {
    const list = getPlacedItems().map(p => p.uid === uid ? { ...p, x, y } : p);
    persistPlaced(list);
  }

  function removeObject(uid) {
    persistPlaced(getPlacedItems().filter(p => p.uid !== uid));
  }

  // Modifie une propriété d'un objet placé (rotation, échelle, ordre…)
  function updateObject(uid, changes) {
    const list = getPlacedItems().map(p => p.uid === uid ? { ...p, ...changes } : p);
    persistPlaced(list);
  }

  function bringFront(uid) {
    const placed = getPlacedItems();
    const maxZ = Math.max(0, ...placed.map(p => p.z || 0));
    updateObject(uid, { z: maxZ + 1 });
  }
  function sendBack(uid) {
    const placed = getPlacedItems();
    const minZ = Math.min(0, ...placed.map(p => p.z || 0));
    updateObject(uid, { z: minZ - 1 });
  }

  // Déverrouille une pièce
  async function unlockRoom(roomId, cost) {
    if (reserve.coins < cost) return;
    const newCoins = reserve.coins - cost;
    const newUnlocked = [...(reserve.unlockedRooms || ['piece']), roomId];
    setReserve(r => ({ ...r, coins: newCoins, unlockedRooms: newUnlocked }));
    try {
      await setDoc(doc(db, 'users', user.uid, 'data', 'reserve'),
        { coins: newCoins, unlockedRooms: newUnlocked }, { merge: true });
    } catch (e) { reportSaveError(e); }
  }

  



  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
      <motion.div animate={{ opacity: [.3, 1, .3] }} transition={{ duration: 1.5, repeat: Infinity }}
        style={{ color: 'var(--text-muted)' }}>Chargement…</motion.div>
    </div>
  );

  const cats = ['Tout', ...new Set(SHOP_CATALOG.map(i => i.cat))];
  const shopItems = shopCat === 'Tout' ? SHOP_CATALOG : SHOP_CATALOG.filter(i => i.cat === shopCat);

  // Objets disponibles compatibles avec l'emplacement en cours
  const addPickerOptions = SHOP_CATALOG.filter(i => availableCount(i.id) > 0);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{`
        @media (max-width: 600px) {
          .garden-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 22px 10px !important; }
          .shop-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .rooms-grid { gap: 10px !important; }
          .reserve-tabs button { padding: 7px 11px !important; font-size: .76rem !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: '1.4rem', fontWeight: 800,
          color: 'var(--text-primary)', margin: 0 }}>
          <Sprout size={22} strokeWidth={2.2} color={SCENE.leaf} />
          Home
        </h1>
        <div data-tour="tour-home-coins" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 15px', borderRadius: 22,
          background: 'rgba(233,180,76,.14)' }}>
          <CoinIcon size={17} />
          <span style={{ fontSize: '1rem', fontWeight: 800, color: '#D8A23C' }}>{reserve.coins}</span>
        </div>
      </div>

      {/* Onglets */}
      <TourButton onClick={tour.start} label={t('common.guidedTour')} />

      <div data-tour="tour-home-tabs" className="reserve-tabs" style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', padding: 4,
        borderRadius: 22, alignSelf: 'center', flexWrap: 'nowrap' }}>
        {[{ v: 'garden', l: 'Jardin', I: Sprout },
          { v: 'shop', l: 'Boutique', I: Store },
          { v: 'room', l: 'Ma maison', I: Home }].map(t => {
          const active = tab === t.v;
          return (
            <button key={t.v} onClick={() => setTab(t.v)}
              style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 17px', borderRadius: 18, border: 'none', cursor: 'pointer',
                background: 'transparent', fontSize: '.82rem', fontWeight: active ? 700 : 500,
                color: active ? '#fff' : 'var(--text-muted)', transition: 'color .2s' }}>
              {active && (
                <motion.span layoutId="reserveTabPill" transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  style={{ position: 'absolute', inset: 0, borderRadius: 18, background: 'var(--accent)',
                    boxShadow: '0 3px 10px -4px var(--accent-glow)' }} />
              )}
              <t.I size={15} strokeWidth={2.2} style={{ position: 'relative', flexShrink: 0 }} />
              <span style={{ position: 'relative' }}>{t.l}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">

        {/* ── JARDIN ── */}
        {tab === 'garden' && (
          <motion.div key="garden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Bandeau diversité — une ligne, pas une carte */}
            <div data-tour="tour-home-diversity" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 14,
              background: bonus > 0 ? 'rgba(79,122,56,.14)' : 'var(--bg-card)',
              border: `1px solid ${bonus > 0 ? 'rgba(79,122,56,.35)' : 'transparent'}` }}>
              <Leaf size={17} strokeWidth={2} color={bonus > 0 ? SCENE.leaf : 'var(--text-muted)'} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {divSubjects.length} matière{divSubjects.length > 1 ? 's' : ''} récoltée{divSubjects.length > 1 ? 's' : ''} cette semaine
                </div>
                <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>
                  {bonus > 0 ? 'Un jardin varié rapporte davantage' : 'Récolte 3 matières différentes pour +20 %'}
                </div>
              </div>
              {bonus > 0 && (
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '.74rem', fontWeight: 800,
                  background: 'rgba(79,122,56,.2)', color: SCENE.leaf, whiteSpace: 'nowrap' }}>
                  +{Math.round(bonus * 100)} %
                </span>
              )}
            </div>

            {subjects.length === 0 ? (
              <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, padding: '3.5rem 1.5rem',
                textAlign: 'center', background: `linear-gradient(180deg, ${SCENE.skyTop} 0%, ${SCENE.skyMid} 60%, ${SCENE.skyLow} 100%)` }}>
                <GardenBackdrop />
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 96 }}><BambooPlant pct={0.15} accent={SCENE.leaf} /></div>
                  <div style={{ fontSize: '.9rem', fontWeight: 800, color: SCENE.ink }}>Ton jardin attend ses premières pousses</div>
                  <div style={{ fontSize: '.76rem', color: SCENE.inkSoft, maxWidth: 300 }}>
                    Ajoute des matières : chaque minute de révision fait grandir un bambou.
                  </div>
                </div>
              </div>
            ) : (
              /* La bambouseraie : une seule scène, les plants partagent le même ciel */
              <div data-tour="tour-home-garden" style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, padding: '26px 18px 20px',
                background: `linear-gradient(180deg, ${SCENE.skyTop} 0%, ${SCENE.skyMid} 58%, ${SCENE.skyLow} 100%)`,
                boxShadow: 'inset 0 -30px 50px -30px rgba(126,88,51,.45)' }}>
                <GardenBackdrop />

                <div className="garden-grid" style={{ position: 'relative', display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill,minmax(168px,1fr))', gap: '28px 14px' }}>
                  {subjects.map(s => {
                    const lvl = reserve.potLevels[s.id] || 1;
                    const target = growthTarget(lvl);
                    const total = reserve.studyTime[s.id] || 0;
                    const harvested = reserve.harvested[s.id] || 0;
                    const available = Math.max(0, total - harvested);
                    const matureCount = Math.floor(available / target);
                    const inCurrentGrowth = available % target;
                    const pct = inCurrentGrowth / target;
                    const color = s.color || SCENE.leaf;
                    const canHarvest = matureCount >= 1;
                    const potProg = reserve.potProgress[s.id] || 0;
                    return (
                      <motion.div key={s.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: .45, ease: 'easeOut' }}
                        style={{ position: 'relative', display: 'flex', flexDirection: 'column',
                          alignItems: 'center', gap: 8 }}>

                        {/* Gain de pièces qui s'envole à la récolte */}
                        <AnimatePresence>
                          {harvestFx && harvestFx.subjId === s.id && (
                            <motion.div initial={{ opacity: 0, y: 10, scale: .7 }}
                              animate={{ opacity: 1, y: -34, scale: 1.1 }} exit={{ opacity: 0, y: -56 }}
                              style={{ position: 'absolute', top: 40, zIndex: 6, textAlign: 'center',
                                pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                                borderRadius: 20, background: SCENE.cream, color: '#8A5E18', fontWeight: 800,
                                fontSize: '.8rem', boxShadow: '0 4px 14px rgba(126,88,51,.3)' }}>
                                +{harvestFx.coins} <CoinIcon size={14} />
                              </span>
                              {harvestFx.levelUp && (
                                <span style={{ fontSize: '.62rem', fontWeight: 800, color: SCENE.leafDeep }}>
                                  Parcelle niveau supérieur
                                </span>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <BambooPlant pct={canHarvest ? 1 : pct} accent={color} />

                        {/* Plaquette de bois gravée : l'identité de la matière */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 11px',
                          borderRadius: 9, maxWidth: '100%',
                          background: `linear-gradient(180deg, ${SCENE.barkLight}, ${SCENE.bark})`,
                          boxShadow: '0 2px 6px rgba(62,42,26,.28), inset 0 1px 0 rgba(255,236,205,.28)' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0,
                            boxShadow: '0 0 0 2px rgba(255,244,231,.35)' }} />
                          <span style={{ fontSize: '.78rem', fontWeight: 700, color: SCENE.cream,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                          <span style={{ fontSize: '.62rem', fontWeight: 800, color: 'rgba(251,244,231,.62)',
                            whiteSpace: 'nowrap' }}>N{lvl}</span>
                        </div>

                        {canHarvest ? (
                          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: .95 }}
                            onClick={() => harvest(s.id)}
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                              padding: '8px 14px', borderRadius: 22, border: 'none', cursor: 'pointer',
                              background: SCENE.leafDeep, color: SCENE.cream, fontSize: '.75rem', fontWeight: 700,
                              boxShadow: '0 4px 12px rgba(47,82,35,.35)' }}>
                            <Scissors size={14} strokeWidth={2.2} />
                            Couper{matureCount > 1 ? ` ×${matureCount}` : ''}
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, opacity: .9 }}>
                              · {Math.round(matureCount * coinValue(lvl) * (1 + bonus))} <CoinIcon size={12} />
                            </span>
                          </motion.button>
                        ) : (
                          <div style={{ width: '100%', maxWidth: 132, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', gap: 5 }}>
                            <div style={{ width: '100%', height: 5, borderRadius: 10, overflow: 'hidden',
                              background: 'rgba(126,88,51,.18)' }}>
                              <motion.div animate={{ width: `${Math.max(3, pct * 100)}%` }}
                                transition={{ duration: .6, ease: 'easeOut' }}
                                style={{ height: '100%', borderRadius: 10, background: color }} />
                            </div>
                            <div style={{ fontSize: '.66rem', fontWeight: 600, color: SCENE.inkSoft }}>
                              {inCurrentGrowth} / {target} min
                            </div>
                          </div>
                        )}

                        {/* Progression vers le niveau suivant de la parcelle */}
                        <div style={{ display: 'flex', gap: 4 }}>
                          {Array.from({ length: BAMBOOS_PER_LEVEL }).map((_, i) => (
                            <span key={i} style={{ width: 14, height: 3, borderRadius: 3,
                              background: i < potProg ? color : 'rgba(126,88,51,.22)' }} />
                          ))}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ── BOUTIQUE ── */}
        {tab === 'shop' && (
          <motion.div key="shop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* L'étal de la Bamboutique — sur le fond du thème, réchauffé par
                la lanterne et posé sur une planche : le bois reste un accent,
                jamais un aplat qui jure avec le thème choisi. */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 12,
              padding: '14px 18px 18px 12px', borderRadius: 20, overflow: 'hidden',
              background: 'var(--bg-card)' }}>
              {/* lanterne chaude au-dessus de l'étal */}
              <div aria-hidden="true" style={{ position: 'absolute', top: -56, right: 4, width: 190, height: 190,
                pointerEvents: 'none', borderRadius: '50%', filter: 'blur(36px)', background: 'rgba(255,196,104,.26)' }} />
              {/* la planche de l'étal */}
              <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 5,
                pointerEvents: 'none', background: `linear-gradient(180deg, ${SCENE.barkLight}, ${SCENE.bark})` }} />

              <img src={asset('soso/bamboutiqueSF.png')} alt="La marchande de la Bamboutique"
                style={{ position: 'relative', width: 92, height: 92, objectFit: 'contain', flexShrink: 0,
                  filter: 'drop-shadow(0 6px 10px rgba(38,25,14,.4))' }} />

              <div style={{ position: 'relative', flex: 1, minWidth: 0, paddingBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Store size={15} strokeWidth={2.2} color="var(--text-muted)" />
                  <span style={{ fontSize: '.92rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '.01em' }}>
                    La Bamboutique
                  </span>
                </div>
                <AnimatePresence mode="wait">
                  <motion.div key={shopMsg || 'idle'}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    style={{ position: 'relative', display: 'inline-block', maxWidth: '100%',
                      background: 'var(--bg-card-hover)', borderRadius: 13, padding: '8px 13px',
                      fontSize: '.76rem', lineHeight: 1.45, color: 'var(--text-secondary)' }}>
                    {/* pointe de la bulle, orientée vers la marchande */}
                    <span aria-hidden="true" style={{ position: 'absolute', left: -4, bottom: 11, width: 12, height: 12,
                      background: 'var(--bg-card-hover)', transform: 'rotate(45deg)', borderRadius: 2 }} />
                    <span style={{ position: 'relative' }}>
                      {shopMsg || 'Bienvenue. Récolte du bambou et offre-toi de quoi habiller ta pièce.'}
                    </span>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Rayons de la boutique */}
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {cats.map(c => {
                const active = shopCat === c;
                return (
                  <button key={c} onClick={() => setShopCat(c)}
                    style={{ padding: '6px 15px', borderRadius: 20, cursor: 'pointer', fontSize: '.75rem',
                      fontWeight: active ? 700 : 500, border: 'none', transition: 'background .15s, color .15s',
                      background: active ? 'var(--accent-subtle)' : 'var(--bg-card)',
                      color: active ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {c}
                  </button>
                );
              })}
            </div>

            <div className="shop-grid" style={{ display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill,minmax(164px,1fr))', gap: 14 }}>
              {shopItems.map(item => {
                const owned = reserve.purchasedCounts[item.id] || 0;
                const price = dynamicPrice(item, owned);
                const canAfford = (reserve.coins || 0) >= price;
                const raised = price > item.price;
                return (
                  <motion.div key={item.id}
                    animate={buyFx === item.id ? { scale: [1, 1.05, 1] } : {}}
                    whileHover={{ y: -3 }} transition={{ duration: .25, ease: 'easeOut' }}
                    style={{ position: 'relative', display: 'flex', flexDirection: 'column',
                      borderRadius: 18, overflow: 'hidden', background: 'var(--bg-card)' }}>

                    {/* Vitrine : l'objet posé sur une étagère, éclairé par le haut */}
                    <div style={{ position: 'relative', height: 104, display: 'flex', alignItems: 'flex-end',
                      justifyContent: 'center', paddingBottom: 14,
                      background: 'radial-gradient(120% 85% at 50% -10%, rgba(255,214,140,.22) 0%, transparent 62%)' }}>
                      {/* ombre de l'objet sur la planche */}
                      <div aria-hidden="true" style={{ position: 'absolute', bottom: 12, width: 56, height: 9,
                        borderRadius: '50%', background: 'rgba(62,42,26,.3)', filter: 'blur(4px)' }} />
                      <div style={{ position: 'relative', opacity: canAfford ? 1 : .45,
                        filter: canAfford ? 'drop-shadow(0 3px 4px rgba(38,25,14,.3))' : 'grayscale(.7)',
                        transition: 'opacity .2s, filter .2s' }}>
                        <ItemVisual item={item} size={56} />
                      </div>
                      {/* la planche */}
                      <div aria-hidden="true" style={{ position: 'absolute', left: 12, right: 12, bottom: 8, height: 4,
                        borderRadius: 3, background: `linear-gradient(180deg, ${SCENE.barkLight}, ${SCENE.bark})`,
                        boxShadow: '0 2px 5px rgba(62,42,26,.3)' }} />
                    </div>

                    {/* Compteur d'exemplaires déjà possédés */}
                    {owned > 0 && (
                      <div style={{ position: 'absolute', top: 9, right: 9, display: 'inline-flex', alignItems: 'center',
                        gap: 3, padding: '2px 8px', borderRadius: 20, background: 'rgba(79,122,56,.18)',
                        color: SCENE.leaf, fontSize: '.62rem', fontWeight: 800 }}>
                        <Check size={10} strokeWidth={3} />{owned}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '2px 12px 12px' }}>
                      <div>
                        <div style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-primary)',
                          textAlign: 'center', lineHeight: 1.25 }}>{item.name}</div>
                        <div style={{ height: 15, marginTop: 2, fontSize: '.62rem', textAlign: 'center' }}>
                          {raised ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3,
                              color: SCENE.amber, fontWeight: 700 }}>
                              <TrendingUp size={10} strokeWidth={2.5} /> prix de base {item.price}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>{item.cat}</span>
                          )}
                        </div>
                      </div>
                      <motion.button whileHover={canAfford ? { scale: 1.03 } : {}} whileTap={canAfford ? { scale: .96 } : {}}
                        onClick={() => buy(item)} disabled={!canAfford}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                          width: '100%', padding: '9px', borderRadius: 12, border: 'none',
                          fontSize: '.78rem', fontWeight: 700,
                          cursor: canAfford ? 'pointer' : 'not-allowed',
                          background: canAfford ? 'var(--accent)' : 'transparent',
                          color: canAfford ? '#fff' : 'var(--text-muted)',
                          boxShadow: canAfford ? '0 4px 12px -6px var(--accent-glow)' : 'inset 0 0 0 1px var(--border)' }}>
                        {price} <CoinIcon size={14} />
                      </motion.button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── MA MAISON ── */}
        {tab === 'room' && (
          <motion.div key="room" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* VUE MAISON — si aucune pièce sélectionnée */}
          {!activeRoomId && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
                Choisis une pièce à aménager. Les suivantes s'ouvrent avec ton XP et tes pièces.
              </p>
              <div className="rooms-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14,
                maxWidth: 620, margin: '0 auto', width: '100%' }}>
                {ROOMS.map(room => {
                  const isUnlocked = (reserve.unlockedRooms || ['piece']).includes(room.id);
                  const canUnlock = userXp >= room.unlockXp && reserve.coins >= room.unlockCoins && !isUnlocked;
                  const xpOk = userXp >= room.unlockXp;
                  const coinsOk = reserve.coins >= room.unlockCoins;
                  const roomItems = reserve.rooms[room.id]?.placedItems || [];
                  /** Une condition de déverrouillage, remplie ou non. */
                  const requirement = (ok, label) => (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px',
                      borderRadius: 20, fontSize: '.63rem', fontWeight: 700, whiteSpace: 'nowrap',
                      background: ok ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.34)',
                      color: ok ? '#EAF6E4' : 'rgba(255,255,255,.62)' }}>
                      {ok ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}
                      {label}
                    </span>
                  );
                  return (
                    <motion.div key={room.id}
                      whileHover={isUnlocked ? { y: -3 } : {}} transition={{ duration: .22, ease: 'easeOut' }}
                      onClick={() => isUnlocked && setActiveRoomId(room.id)}
                      style={{ position: 'relative', borderRadius: 18, overflow: 'hidden',
                        background: 'var(--bg-card)', cursor: isUnlocked ? 'pointer' : 'default',
                        boxShadow: isUnlocked ? '0 8px 22px -14px rgba(0,0,0,.65)' : 'none' }}>
                      <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', containerType: 'inline-size' }}>
                        <img src={room.image} alt="" draggable={false}
                          style={{ width: '100%', height: '100%', objectFit: 'cover',
                            filter: isUnlocked ? 'none' : 'brightness(.3) saturate(.35)' }} />
                        {/* Miniatures des objets placés */}
                        {isUnlocked && [...roomItems].sort((a, b) => a.y - b.y).map(p => {
                          const it = itemById(p.itemId);
                          if (!it) return null;
                          const FLOOR_START = 68;
                          const sizePct = p.y <= FLOOR_START ? 16 : 16 + ((p.y - FLOOR_START) / (100 - FLOOR_START)) * 10;
                          const sz = sizePct * (p.scale ?? 1) * (it.size ?? 1);
                          return (
                            <div key={p.uid} style={{ position: 'absolute',
                              left: `${p.x}%`, top: `${p.y}%`,
                              width: `${sz}cqw`, height: `${sz}cqw`,
                              transform: `translate(-50%, -50%) rotate(${p.rot || 0}deg)`,
                              zIndex: p.z != null ? 200 + p.z : Math.round(p.y) }}>
                              {it.image
                                ? <img src={it.image} alt="" draggable={false}
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                : <span style={{ fontSize: `${sz * 0.8}cqw` }}>{it.emoji}</span>}
                            </div>
                          );
                        })}
                      </div>

                      {isUnlocked ? (
                        /* Bandeau du bas : nom de la pièce + nombre d'objets */
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 400,
                          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8,
                          padding: '30px 12px 11px', pointerEvents: 'none',
                          background: 'linear-gradient(transparent, rgba(18,12,6,.82))' }}>
                          <div style={{ minWidth: 0, fontSize: '.74rem', fontWeight: 700, color: '#fff',
                            textShadow: '0 1px 3px rgba(0,0,0,.5)' }}>
                            {roomItems.length === 0 ? 'Vide pour l\'instant'
                              : `${roomItems.length} objet${roomItems.length > 1 ? 's' : ''}`}
                          </div>
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                            background: 'rgba(255,255,255,.9)', color: SCENE.ink }}>
                            <ChevronRight size={15} strokeWidth={2.6} />
                          </span>
                        </div>
                      ) : (
                        /* Voile de verrouillage : conditions + action */
                        <div style={{ position: 'absolute', inset: 0, zIndex: 400, display: 'flex',
                          flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,.14)',
                            color: 'rgba(255,255,255,.82)' }}>
                            <Lock size={16} strokeWidth={2.2} />
                          </span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
                            {requirement(xpOk, `${room.unlockXp} XP`)}
                            {requirement(coinsOk, `${room.unlockCoins} pièces`)}
                          </div>
                          {/* Progression vers le palier d'XP, tant qu'il n'est pas atteint */}
                          {!xpOk && (
                            <div style={{ width: '70%', maxWidth: 130, height: 4, borderRadius: 10, overflow: 'hidden',
                              background: 'rgba(255,255,255,.16)' }}>
                              <div style={{ width: `${Math.min(100, (userXp / room.unlockXp) * 100)}%`, height: '100%',
                                borderRadius: 10, background: 'rgba(255,255,255,.75)' }} />
                            </div>
                          )}
                          {canUnlock && (
                            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: .95 }}
                              onClick={e => { e.stopPropagation(); unlockRoom(room.id, room.unlockCoins); }}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 2,
                                padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                                background: 'var(--accent)', color: '#fff', fontSize: '.72rem', fontWeight: 800 }}>
                              Débloquer · {room.unlockCoins} <CoinIcon size={13} />
                            </motion.button>
                          )}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VUE PIÈCE — si une pièce est sélectionnée */}
          {activeRoomId && (() => {
            const roomDef = ROOMS.find(r => r.id === activeRoomId);
            const placedItems = getPlacedItems();
            return (<>
            {/* Barre supérieure : retour + nom de la pièce + compteur */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <motion.button whileTap={{ scale: .95 }}
                onClick={() => { setActiveRoomId(null); setSelectedUid(null); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '7px 13px 7px 9px',
                  borderRadius: 20, border: 'none', background: 'var(--bg-card)', color: 'var(--text-secondary)',
                  fontSize: '.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                <ChevronLeft size={15} strokeWidth={2.4} />
                Ma maison
              </motion.button>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: '.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {placedItems.length} objet{placedItems.length > 1 ? 's' : ''}
              </span>
            </div>

            {/* La pièce */}
            <div ref={el => {
                roomRef.current = el;
                if (el) {
                  const r = el.getBoundingClientRect();
                  if (r.width && (r.width !== roomSize.w || r.height !== roomSize.h)) {
                    setRoomSize({ w: r.width, h: r.height });
                  }
                }
              }}
              onPointerDown={e => { if (e.target === e.currentTarget) setSelectedUid(null); }}
              style={{ position: 'relative', width: '100%', aspectRatio: '1024 / 768',
              maxWidth: 760, margin: '0 auto', borderRadius: 20, overflow: 'hidden',
              containerType: 'inline-size', isolation: 'isolate', zIndex: 0,
              background: 'var(--bg-card)',
              backgroundImage: `url(${roomDef?.image})`, backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
              boxShadow: '0 14px 34px -22px rgba(0,0,0,.75), inset 0 0 0 1px rgba(255,255,255,.05)',
              userSelect: 'none', WebkitUserSelect: 'none' }}>

              {/* Objets placés — positionnés 100% par Motion (x/y en pixels) */}
              {roomSize.w > 0 && [...placedItems].sort((a, b) => a.y - b.y).map(p => {
                const item = itemById(p.itemId);
                if (!item) return null;
                // Le sol commence vers 68% de la hauteur. Au-dessus (mur) = taille fixe.
                // En dessous (sol) = agrandissement selon la profondeur.
                const FLOOR_START = 68;
                const sizePct = p.y <= FLOOR_START
                  ? 16  // sur le mur : taille constante
                  : 16 + ((p.y - FLOOR_START) / (100 - FLOOR_START)) * 10; // sur le sol : 16 → 26
                const userScale = p.scale ?? 1;
                const baseSize = item.size ?? 1;  // taille propre à l'objet
                const sizePx = (sizePct / 100) * roomSize.w * userScale * baseSize;  // en pixels
                // position initiale en pixels (centre de l'objet)
                const px = (p.x / 100) * roomSize.w - sizePx / 2;
                const py = (p.y / 100) * roomSize.h - sizePx / 2;
                // ordre : manuel (z) si défini, sinon automatique par la hauteur
                const zOrder = p.z != null ? 200 + p.z : Math.round(p.y);
                const isSelected = selectedUid === p.uid;
                return (
                  <motion.div key={p.uid}
                    drag={!p.locked} dragMomentum={false} dragElastic={0}
                    dragConstraints={roomRef}
                    initial={false}
                    animate={{ x: px, y: py }}
                    transition={{ type: false }}
                    onTap={() => handleTap(p.uid)}
                    onDragEnd={(e, info) => {
                      const finalPx = px + info.offset.x + sizePx / 2;
                      const finalPy = py + info.offset.y + sizePx / 2;
                      const nx = (finalPx / roomSize.w) * 100;
                      const ny = (finalPy / roomSize.h) * 100;
                      moveObject(p.uid, Math.max(3, Math.min(97, nx)), Math.max(3, Math.min(97, ny)));
                    }}
                    whileDrag={{ scale: 1.08 }}
                    style={{ position: 'absolute', left: 0, top: 0,
                      width: sizePx, height: sizePx,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: p.locked ? 'default' : 'grab', touchAction: 'none', zIndex: zOrder,
                      borderRadius: 12,
                      outline: isSelected ? '2px solid var(--accent)' : 'none', outlineOffset: 4,
                      filter: isSelected
                        ? `drop-shadow(0 0 10px var(--accent-glow)) drop-shadow(0 5px 8px rgba(0,0,0,.4))`
                        : 'drop-shadow(0 3px 3px rgba(0,0,0,.28))' }}>
                    <div style={{ pointerEvents: 'none', width: '100%', height: '100%',
                      transform: `rotate(${p.rot || 0}deg)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {item.image
                        ? <img src={item.image} alt={item.name} draggable={false}
                            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block',
                              userSelect: 'none', WebkitUserSelect: 'none', pointerEvents: 'none' }} />
                        : <span style={{ fontSize: sizePx * 0.8, lineHeight: 1, userSelect: 'none' }}>{item.emoji}</span>}
                    </div>
                  </motion.div>
                );
              })}

              {/* Pièce vide : une invitation discrète, jamais un cadre */}
              {placedItems.length === 0 && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 500, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <span style={{ padding: '8px 16px', borderRadius: 20, fontSize: '.76rem', fontWeight: 600,
                    background: 'rgba(18,12,6,.6)', color: 'rgba(255,255,255,.9)', backdropFilter: 'blur(6px)' }}>
                    Cette pièce attend ses premiers meubles
                  </span>
                </div>
              )}
            </div>

            {/* Ajouter un objet */}
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: .96 }}
              onClick={() => setAddPickerOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'center',
                padding: '10px 20px', borderRadius: 22, border: 'none', cursor: 'pointer',
                background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: '.82rem',
                boxShadow: '0 6px 16px -8px var(--accent-glow)' }}>
              <Plus size={16} strokeWidth={2.6} />
              Ajouter un objet
            </motion.button>

            {/* Réglages de l'objet sélectionné — sous la pièce, pour ne pas la faire sauter */}
            <AnimatePresence>
              {selectedUid ? (() => {
                const sel = placedItems.find(p => p.uid === selectedUid);
                if (!sel) return null;
                const selItem = itemById(sel.itemId);
                /** Un bouton d'action du panneau : icône au-dessus, libellé en dessous. */
                const action = (label, Icon, onClick, tone) => (
                  <motion.button key={label} whileTap={{ scale: .92 }} onClick={onClick}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '9px 4px', borderRadius: 12, cursor: 'pointer', minWidth: 52, flex: 1,
                      border: 'none', transition: 'background .15s',
                      background: tone ? tone.bg : 'var(--bg-card-hover)',
                      color: tone ? tone.color : 'var(--text-secondary)' }}>
                    <Icon size={17} strokeWidth={2.1} />
                    <span style={{ fontSize: '.58rem', fontWeight: 600 }}>{label}</span>
                  </motion.button>
                );
                return (
                  <motion.div key="editor"
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: .22, ease: 'easeOut' }}
                    style={{ background: 'var(--bg-card)', borderRadius: 18, padding: 14,
                      display: 'flex', flexDirection: 'column', gap: 10,
                      boxShadow: '0 0 0 1px var(--accent-subtle), 0 10px 26px -20px rgba(0,0,0,.8)' }}>
                    {/* En-tête : aperçu de l'objet et son état */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <div style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, padding: 5,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'radial-gradient(120% 90% at 50% 0%, var(--accent-subtle) 0%, transparent 70%), var(--bg-input)' }}>
                        {selItem?.image
                          ? <img src={selItem.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          : <span style={{ fontSize: '1.6rem' }}>{selItem?.emoji}</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '.86rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {selItem?.name || 'Objet'}
                        </div>
                        <div style={{ fontSize: '.66rem', color: 'var(--text-muted)' }}>
                          Taille {Math.round((sel.scale || 1) * 100)} % · {sel.rot || 0}°{sel.locked ? ' · fixé' : ''}
                        </div>
                      </div>
                      <motion.button whileTap={{ scale: .9 }} onClick={() => setSelectedUid(null)}
                        aria-label={t('a11y.closeSettings')}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 30, height: 30, borderRadius: '50%', border: 'none', flexShrink: 0,
                          background: 'var(--bg-card-hover)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <X size={15} strokeWidth={2.4} />
                      </motion.button>
                    </div>
                    {/* Placement */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      {action('Tourner', RotateCw, () => updateObject(selectedUid, { rot: ((sel.rot || 0) + 15) % 360 }))}
                      {action('Agrandir', Plus, () => updateObject(selectedUid, { scale: Math.min(2.5, (sel.scale || 1) + 0.15) }))}
                      {action('Réduire', Minus, () => updateObject(selectedUid, { scale: Math.max(0.4, (sel.scale || 1) - 0.15) }))}
                      {action('Devant', ArrowUp, () => bringFront(selectedUid))}
                      {action('Derrière', ArrowDown, () => sendBack(selectedUid))}
                    </div>
                    {/* Verrouillage et retrait */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      {action(sel.locked ? 'Libérer' : 'Fixer', sel.locked ? Lock : Unlock,
                        () => updateObject(selectedUid, { locked: !sel.locked }),
                        sel.locked ? { bg: 'rgba(216,162,60,.14)', color: '#D8A23C' } : null)}
                      {action('Retirer', Trash2, () => { removeObject(selectedUid); setSelectedUid(null); },
                        { bg: 'rgba(231,76,60,.12)', color: 'var(--danger)' })}
                    </div>
                  </motion.div>
                );
              })() : (
                <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ margin: 0, textAlign: 'center', fontSize: '.7rem', color: 'var(--text-muted)' }}>
                  Glisse un objet pour le déplacer · double-clic pour le régler
                </motion.p>
              )}
            </AnimatePresence>
            </>);
          })()}
          </motion.div>
        )}

      </AnimatePresence>

      {/* Sélecteur d'objet à ajouter */}
      <AnimatePresence>
        {addPickerOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={e => e.target === e.currentTarget && setAddPickerOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(10px)',
              zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <motion.div initial={{ scale: .92, y: 20 }} animate={{ scale: 1, y: 0 }}
              style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 18,
                padding: '1.4rem', width: 400, maxWidth: '100%', maxHeight: '80vh', overflowY: 'auto',
                display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Ajouter un objet
                </h3>
                <button onClick={() => setAddPickerOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
              </div>
              {addPickerOptions.length === 0 ? (
                <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>
                  Aucun objet disponible.<br />Achètes-en dans la boutique !
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                  {addPickerOptions.map(item => (
                    <motion.button key={item.id} whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }}
                      onClick={() => addObject(item.id)}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        padding: '10px 6px', borderRadius: 12, border: '1px solid var(--border)',
                        background: 'var(--bg-card)', cursor: 'pointer' }}>
                      <ItemVisual item={item} size={32} />
                      <span style={{ fontSize: '.62rem', color: 'var(--text-secondary)', textAlign: 'center' }}>{item.name}</span>
                      <span style={{ fontSize: '.58rem', color: 'var(--text-muted)' }}>×{availableCount(item.id)}</span>
                    </motion.button>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <GuidedTour active={tour.active} step={tour.step} steps={tour.steps}
        onNext={tour.next} onPrev={tour.prev} onStop={tour.stop} />
    </div>
  );
}