// ── SYSTÈME DE THÈME BLOKLY v2 ──
import { xpForLevel } from '../data/levels';

export const THEMES = [
// ── DARK ──
  {
    id: 'nuit',
    name: 'Nuit profonde',
    emoji: '🌑',
    style: 'dark',
    desc: 'Le classique Blokly',
    unlockXp: 0,
    vars: {
      '--bg-base':         '#0a0a18',
      '--bg-card':         'rgba(255,255,255,.035)',
      '--bg-card-hover':   'rgba(255,255,255,.06)',
      '--bg-nav':          'rgba(10,10,24,.92)',
      '--bg-modal':        '#0f0f1f',
      '--bg-input':        'rgba(255,255,255,.07)',
      '--border':          'rgba(255,255,255,.07)',
      '--border-strong':   'rgba(255,255,255,.13)',
      '--text-primary':    '#ffffff',
      '--text-secondary':  'rgba(255,255,255,.6)',
      '--text-muted':      'rgba(255,255,255,.35)',
      '--text-placeholder':'rgba(255,255,255,.25)',
      '--accent':          '#4A90D9',
      '--accent-subtle':   'rgba(74,144,217,.15)',
      '--accent-glow':     'rgba(74,144,217,.35)',
      '--xp-color':        '#57FF2B',
      '--success':         '#27AE60',
      '--danger':          '#E74C3C',
      '--warning':         '#F1C40F',
      '--card-shadow':     '0 2px 16px rgba(0,0,0,.4)',
    },
  },
  {
    id: 'cendre',
    name: 'Cendre',
    emoji: '🪨',
    style: 'dark',
    desc: 'Gris anthracite minimaliste',
    unlockXp: 0,
    vars: {
      '--bg-base':         '#111114',
      '--bg-card':         'rgba(255,255,255,.04)',
      '--bg-card-hover':   'rgba(255,255,255,.07)',
      '--bg-nav':          'rgba(17,17,20,.95)',
      '--bg-modal':        '#18181c',
      '--bg-input':        'rgba(255,255,255,.07)',
      '--border':          'rgba(255,255,255,.08)',
      '--border-strong':   'rgba(255,255,255,.14)',
      '--text-primary':    '#f0f0f0',
      '--text-secondary':  'rgba(240,240,240,.6)',
      '--text-muted':      'rgba(240,240,240,.35)',
      '--text-placeholder':'rgba(240,240,240,.22)',
      '--accent':          '#a0a0b0',
      '--accent-subtle':   'rgba(160,160,176,.12)',
      '--accent-glow':     'rgba(160,160,176,.25)',
      '--xp-color':        '#c0c0d0',
      '--success':         '#4caf7d',
      '--danger':          '#e05555',
      '--warning':         '#e0b840',
      '--card-shadow':     '0 2px 16px rgba(0,0,0,.5)',
    },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    emoji: '🌌',
    style: 'dark',
    desc: 'Teal profond et mystérieux',
    unlockXp: 15000,
    vars: {
      '--bg-base':         '#020d0f',
      '--bg-card':         'rgba(0,220,180,.04)',
      '--bg-card-hover':   'rgba(0,220,180,.08)',
      '--bg-nav':          'rgba(2,13,15,.95)',
      '--bg-modal':        '#041518',
      '--bg-input':        'rgba(0,220,180,.07)',
      '--border':          'rgba(0,220,180,.1)',
      '--border-strong':   'rgba(0,220,180,.2)',
      '--text-primary':    '#e0fff8',
      '--text-secondary':  'rgba(224,255,248,.6)',
      '--text-muted':      'rgba(224,255,248,.35)',
      '--text-placeholder':'rgba(224,255,248,.22)',
      '--accent':          '#00dbb4',
      '--accent-subtle':   'rgba(0,219,180,.15)',
      '--accent-glow':     'rgba(0,219,180,.4)',
      '--xp-color':        '#00ffcc',
      '--success':         '#00c896',
      '--danger':          '#ff5566',
      '--warning':         '#ffcc00',
      '--card-shadow':     '0 2px 20px rgba(0,180,140,.15)',
    },
  },
  {
    id: 'sakura_night',
    name: 'Sakura Night',
    emoji: '🌸',
    style: 'dark',
    desc: 'Prune rosé sombre et élégant',
    unlockXp: 30000,
    vars: {
      '--bg-base':         '#12060e',
      '--bg-card':         'rgba(255,100,170,.04)',
      '--bg-card-hover':   'rgba(255,100,170,.08)',
      '--bg-nav':          'rgba(18,6,14,.95)',
      '--bg-modal':        '#1a0815',
      '--bg-input':        'rgba(255,100,170,.07)',
      '--border':          'rgba(255,100,170,.1)',
      '--border-strong':   'rgba(255,100,170,.2)',
      '--text-primary':    '#ffe0f0',
      '--text-secondary':  'rgba(255,224,240,.6)',
      '--text-muted':      'rgba(255,224,240,.35)',
      '--text-placeholder':'rgba(255,224,240,.22)',
      '--accent':          '#ff66aa',
      '--accent-subtle':   'rgba(255,102,170,.15)',
      '--accent-glow':     'rgba(255,102,170,.4)',
      '--xp-color':        '#ff99cc',
      '--success':         '#66cc88',
      '--danger':          '#ff4466',
      '--warning':         '#ffcc44',
      '--card-shadow':     '0 2px 20px rgba(200,50,120,.15)',
    },
  },
  {
    id: 'foret_noire',
    name: 'Forêt noire',
    emoji: '🌲',
    style: 'dark',
    desc: 'Vert naturel sombre et apaisant',
    unlockXp: 50000,
    vars: {
      '--bg-base':         '#050f08',
      '--bg-card':         'rgba(50,200,80,.04)',
      '--bg-card-hover':   'rgba(50,200,80,.08)',
      '--bg-nav':          'rgba(5,15,8,.95)',
      '--bg-modal':        '#081410',
      '--bg-input':        'rgba(50,200,80,.07)',
      '--border':          'rgba(50,200,80,.1)',
      '--border-strong':   'rgba(50,200,80,.2)',
      '--text-primary':    '#e0f5e8',
      '--text-secondary':  'rgba(224,245,232,.6)',
      '--text-muted':      'rgba(224,245,232,.35)',
      '--text-placeholder':'rgba(224,245,232,.22)',
      '--accent':          '#4caf6a',
      '--accent-subtle':   'rgba(76,175,106,.15)',
      '--accent-glow':     'rgba(76,175,106,.4)',
      '--xp-color':        '#a8ff78',
      '--success':         '#5dcc80',
      '--danger':          '#ff5544',
      '--warning':         '#ddbb33',
      '--card-shadow':     '0 2px 20px rgba(20,120,50,.15)',
    },
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    emoji: '⚡',
    style: 'dark',
    desc: 'Violet électrique intense',
    unlockXp: 80000,
    vars: {
      '--bg-base':         '#08000f',
      '--bg-card':         'rgba(180,0,255,.05)',
      '--bg-card-hover':   'rgba(180,0,255,.1)',
      '--bg-nav':          'rgba(8,0,15,.97)',
      '--bg-modal':        '#0e0018',
      '--bg-input':        'rgba(180,0,255,.08)',
      '--border':          'rgba(180,0,255,.12)',
      '--border-strong':   'rgba(180,0,255,.25)',
      '--text-primary':    '#f0e0ff',
      '--text-secondary':  'rgba(240,224,255,.6)',
      '--text-muted':      'rgba(240,224,255,.35)',
      '--text-placeholder':'rgba(240,224,255,.22)',
      '--accent':          '#bf00ff',
      '--accent-subtle':   'rgba(191,0,255,.15)',
      '--accent-glow':     'rgba(191,0,255,.45)',
      '--xp-color':        '#ff00ff',
      '--success':         '#00ff88',
      '--danger':          '#ff0055',
      '--warning':         '#ffff00',
      '--card-shadow':     '0 2px 24px rgba(150,0,220,.2)',
    },
  },
  {
    id: 'abyssal',
    name: 'Abyssal',
    emoji: '🔮',
    style: 'dark',
    desc: 'Noir absolu ultra minimaliste',
    unlockXp: 150000,
    vars: {
      '--bg-base':         '#000003',
      '--bg-card':         'rgba(255,255,255,.025)',
      '--bg-card-hover':   'rgba(255,255,255,.05)',
      '--bg-nav':          'rgba(0,0,3,.98)',
      '--bg-modal':        '#080810',
      '--bg-input':        'rgba(255,255,255,.05)',
      '--border':          'rgba(255,255,255,.05)',
      '--border-strong':   'rgba(255,255,255,.1)',
      '--text-primary':    '#e8e8f0',
      '--text-secondary':  'rgba(232,232,240,.55)',
      '--text-muted':      'rgba(232,232,240,.3)',
      '--text-placeholder':'rgba(232,232,240,.18)',
      '--accent':          '#7755ff',
      '--accent-subtle':   'rgba(119,85,255,.12)',
      '--accent-glow':     'rgba(119,85,255,.35)',
      '--xp-color':        '#aa88ff',
      '--success':         '#33cc77',
      '--danger':          '#cc3344',
      '--warning':         '#ccaa22',
      '--card-shadow':     '0 2px 24px rgba(0,0,0,.8)',
    },
  },
  {
    id: 'inferno',
    name: 'Inferno',
    emoji: '🔥',
    style: 'dark',
    desc: 'Rouge brique et braise incandescente',
    unlockXp: 35000,
    vars: {
      '--bg-base':         '#0f0500',
      '--bg-card':         'rgba(255,80,0,.04)',
      '--bg-card-hover':   'rgba(255,80,0,.09)',
      '--bg-nav':          'rgba(15,5,0,.97)',
      '--bg-modal':        '#1a0800',
      '--bg-input':        'rgba(255,80,0,.07)',
      '--border':          'rgba(255,80,0,.12)',
      '--border-strong':   'rgba(255,80,0,.25)',
      '--text-primary':    '#fff0e8',
      '--text-secondary':  'rgba(255,240,232,.6)',
      '--text-muted':      'rgba(255,240,232,.35)',
      '--text-placeholder':'rgba(255,240,232,.22)',
      '--accent':          '#ff5500',
      '--accent-subtle':   'rgba(255,85,0,.15)',
      '--accent-glow':     'rgba(255,85,0,.45)',
      '--xp-color':        '#ffaa00',
      '--success':         '#44dd66',
      '--danger':          '#ff2200',
      '--warning':         '#ffdd00',
      '--card-shadow':     '0 2px 20px rgba(220,60,0,.2)',
    },
  },
  {
    id: 'midnight_gold',
    name: 'Midnight Gold',
    emoji: '👑',
    style: 'dark',
    desc: 'Noir de luxe et or brillant',
    unlockXp: 100000,
    vars: {
      '--bg-base':         '#090700',
      '--bg-card':         'rgba(220,180,0,.04)',
      '--bg-card-hover':   'rgba(220,180,0,.08)',
      '--bg-nav':          'rgba(9,7,0,.97)',
      '--bg-modal':        '#130f00',
      '--bg-input':        'rgba(220,180,0,.06)',
      '--border':          'rgba(220,180,0,.12)',
      '--border-strong':   'rgba(220,180,0,.25)',
      '--text-primary':    '#fff8e8',
      '--text-secondary':  'rgba(255,248,232,.6)',
      '--text-muted':      'rgba(255,248,232,.35)',
      '--text-placeholder':'rgba(255,248,232,.22)',
      '--accent':          '#d4a800',
      '--accent-subtle':   'rgba(212,168,0,.15)',
      '--accent-glow':     'rgba(212,168,0,.45)',
      '--xp-color':        '#ffd700',
      '--success':         '#44cc77',
      '--danger':          '#ee3333',
      '--warning':         '#ffaa00',
      '--card-shadow':     '0 2px 24px rgba(200,150,0,.18)',
    },
  },
  {
    id: 'deep_space',
    name: 'Deep Space',
    emoji: '🚀',
    style: 'dark',
    desc: 'Cosmos bleu marine et étoiles',
    unlockXp: 120000,
    vars: {
      '--bg-base':         '#020610',
      '--bg-card':         'rgba(60,100,255,.04)',
      '--bg-card-hover':   'rgba(60,100,255,.08)',
      '--bg-nav':          'rgba(2,6,16,.97)',
      '--bg-modal':        '#050a1a',
      '--bg-input':        'rgba(60,100,255,.07)',
      '--border':          'rgba(60,100,255,.12)',
      '--border-strong':   'rgba(60,100,255,.22)',
      '--text-primary':    '#e8eeff',
      '--text-secondary':  'rgba(232,238,255,.6)',
      '--text-muted':      'rgba(232,238,255,.35)',
      '--text-placeholder':'rgba(232,238,255,.22)',
      '--accent':          '#4466ff',
      '--accent-subtle':   'rgba(68,102,255,.15)',
      '--accent-glow':     'rgba(68,102,255,.4)',
      '--xp-color':        '#88aaff',
      '--success':         '#00dd88',
      '--danger':          '#ff4455',
      '--warning':         '#ffcc00',
      '--card-shadow':     '0 2px 24px rgba(40,70,200,.18)',
    },
  },

  // ── FLUO ──
  {
    id: 'neon_rouge',
    name: 'Néon Rouge',
    emoji: '🔴',
    style: 'fluo',
    desc: 'Fond noir, rouge vif intense',
    unlockXp: 70000,
    vars: {
      '--bg-base':         '#0a0000',
      '--bg-card':         'rgba(255,0,50,.05)',
      '--bg-card-hover':   'rgba(255,0,50,.1)',
      '--bg-nav':          'rgba(10,0,0,.97)',
      '--bg-modal':        '#150005',
      '--bg-input':        'rgba(255,0,50,.08)',
      '--border':          'rgba(255,0,50,.15)',
      '--border-strong':   'rgba(255,0,50,.3)',
      '--text-primary':    '#fff0f0',
      '--text-secondary':  'rgba(255,240,240,.6)',
      '--text-muted':      'rgba(255,240,240,.35)',
      '--text-placeholder':'rgba(255,240,240,.22)',
      '--accent':          '#ff0033',
      '--accent-subtle':   'rgba(255,0,51,.15)',
      '--accent-glow':     'rgba(255,0,51,.5)',
      '--xp-color':        '#ff4466',
      '--success':         '#00ff66',
      '--danger':          '#ff0000',
      '--warning':         '#ffcc00',
      '--card-shadow':     '0 2px 24px rgba(255,0,40,.2)',
    },
  },
  {
    id: 'matrix',
    name: 'Matrix',
    emoji: '💚',
    style: 'fluo',
    desc: 'Fond noir, vert terminal',
    unlockXp: 100000,
    vars: {
      '--bg-base':         '#000a00',
      '--bg-card':         'rgba(0,255,65,.04)',
      '--bg-card-hover':   'rgba(0,255,65,.08)',
      '--bg-nav':          'rgba(0,10,0,.97)',
      '--bg-modal':        '#001500',
      '--bg-input':        'rgba(0,255,65,.07)',
      '--border':          'rgba(0,255,65,.12)',
      '--border-strong':   'rgba(0,255,65,.25)',
      '--text-primary':    '#e0ffe8',
      '--text-secondary':  'rgba(0,255,65,.7)',
      '--text-muted':      'rgba(0,255,65,.4)',
      '--text-placeholder':'rgba(0,255,65,.25)',
      '--accent':          '#00ff41',
      '--accent-subtle':   'rgba(0,255,65,.12)',
      '--accent-glow':     'rgba(0,255,65,.5)',
      '--xp-color':        '#00cc33',
      '--success':         '#00ff41',
      '--danger':          '#ff3300',
      '--warning':         '#ffff00',
      '--card-shadow':     '0 2px 24px rgba(0,220,50,.15)',
    },
  },
  {
    id: 'electric',
    name: 'Electric',
    emoji: '🔵',
    style: 'fluo',
    desc: 'Fond noir, cyan électrique',
    unlockXp: 120000,
    vars: {
      '--bg-base':         '#000a0f',
      '--bg-card':         'rgba(0,200,255,.04)',
      '--bg-card-hover':   'rgba(0,200,255,.08)',
      '--bg-nav':          'rgba(0,10,15,.97)',
      '--bg-modal':        '#001520',
      '--bg-input':        'rgba(0,200,255,.07)',
      '--border':          'rgba(0,200,255,.12)',
      '--border-strong':   'rgba(0,200,255,.25)',
      '--text-primary':    '#e0f8ff',
      '--text-secondary':  'rgba(0,200,255,.7)',
      '--text-muted':      'rgba(0,200,255,.4)',
      '--text-placeholder':'rgba(0,200,255,.25)',
      '--accent':          '#00ccff',
      '--accent-subtle':   'rgba(0,204,255,.12)',
      '--accent-glow':     'rgba(0,204,255,.5)',
      '--xp-color':        '#00aaee',
      '--success':         '#00ff88',
      '--danger':          '#ff3355',
      '--warning':         '#ffee00',
      '--card-shadow':     '0 2px 24px rgba(0,180,240,.18)',
    },
  },
  {
    id: 'neon_rose',
    name: 'Néon Rose',
    emoji: '🌺',
    style: 'fluo',
    desc: 'Fond noir, rose fuchsia fluo',
    unlockXp: 90000,
    vars: {
      '--bg-base':         '#0a0008',
      '--bg-card':         'rgba(255,0,180,.05)',
      '--bg-card-hover':   'rgba(255,0,180,.1)',
      '--bg-nav':          'rgba(10,0,8,.97)',
      '--bg-modal':        '#150010',
      '--bg-input':        'rgba(255,0,180,.08)',
      '--border':          'rgba(255,0,180,.15)',
      '--border-strong':   'rgba(255,0,180,.3)',
      '--text-primary':    '#fff0fc',
      '--text-secondary':  'rgba(255,240,252,.6)',
      '--text-muted':      'rgba(255,240,252,.35)',
      '--text-placeholder':'rgba(255,240,252,.22)',
      '--accent':          '#ff00bb',
      '--accent-subtle':   'rgba(255,0,187,.15)',
      '--accent-glow':     'rgba(255,0,187,.55)',
      '--xp-color':        '#ff44dd',
      '--success':         '#00ffaa',
      '--danger':          '#ff2200',
      '--warning':         '#ffcc00',
      '--card-shadow':     '0 2px 24px rgba(220,0,160,.22)',
    },
  },
  {
    id: 'arcade',
    name: 'Arcade',
    emoji: '🕹️',
    style: 'fluo',
    desc: 'Orange et violet — jeu vidéo retro',
    unlockXp: 140000,
    vars: {
      '--bg-base':         '#070010',
      '--bg-card':         'rgba(255,100,0,.05)',
      '--bg-card-hover':   'rgba(255,100,0,.1)',
      '--bg-nav':          'rgba(7,0,16,.97)',
      '--bg-modal':        '#100018',
      '--bg-input':        'rgba(255,100,0,.08)',
      '--border':          'rgba(255,100,0,.15)',
      '--border-strong':   'rgba(255,100,0,.28)',
      '--text-primary':    '#fff5e8',
      '--text-secondary':  'rgba(255,245,232,.6)',
      '--text-muted':      'rgba(255,245,232,.35)',
      '--text-placeholder':'rgba(255,245,232,.22)',
      '--accent':          '#ff6600',
      '--accent-subtle':   'rgba(255,102,0,.15)',
      '--accent-glow':     'rgba(255,102,0,.5)',
      '--xp-color':        '#cc00ff',
      '--success':         '#00ffcc',
      '--danger':          '#ff0044',
      '--warning':         '#ffff00',
      '--card-shadow':     '0 2px 28px rgba(200,60,0,.22)',
    },
  },

  // ── CLAIR ──
  // ── CLAIR ──
  {
    id: 'aube',
    name: 'Aube',
    emoji: '☀️',
    style: 'light',
    desc: 'Beige crème doux et chaud',
    unlockXp: 20000,
    vars: {
      '--bg-base':         '#faf8f3',
      '--bg-card':         'rgba(200,92,10,.08)',
      '--bg-card-hover':   'rgba(200,92,10,.14)',
      '--bg-nav':          'rgba(250,248,243,.95)',
      '--bg-modal':        '#ffffff',
      '--bg-input':        'rgba(0,0,0,.06)',
      '--border':          'rgba(150,90,20,.15)',
      '--border-strong':   'rgba(150,90,20,.28)',
      '--text-primary':    '#1a1612',
      '--text-secondary':  '#5a4020',
      '--text-muted':      '#8a7050',
      '--text-placeholder':'rgba(26,22,18,.32)',
      '--accent':          '#c85c0a',
      '--accent-subtle':   'rgba(200,92,10,.13)',
      '--accent-glow':     'rgba(200,92,10,.3)',
      '--xp-color':        '#a04808',
      '--success':         '#2e7d32',
      '--danger':          '#c62828',
      '--warning':         '#f57f17',
      '--card-shadow':     '0 2px 12px rgba(0,0,0,.09)',
    },
  },
  {
    id: 'petale',
    name: 'Pétale',
    emoji: '🌸',
    style: 'light',
    desc: 'Rose pastel léger et féminin',
    unlockXp: 40000,
    vars: {
      '--bg-base':         '#fff5f8',
      '--bg-card':         'rgba(200,40,90,.08)',
      '--bg-card-hover':   'rgba(200,40,90,.14)',
      '--bg-nav':          'rgba(255,245,248,.95)',
      '--bg-modal':        '#ffffff',
      '--bg-input':        'rgba(180,30,90,.06)',
      '--border':          'rgba(180,30,90,.15)',
      '--border-strong':   'rgba(180,30,90,.28)',
      '--text-primary':    '#2d0a1a',
      '--text-secondary':  '#6e2040',
      '--text-muted':      '#9e5070',
      '--text-placeholder':'rgba(45,10,26,.32)',
      '--accent':          '#c8285a',
      '--accent-subtle':   'rgba(200,40,90,.13)',
      '--accent-glow':     'rgba(200,40,90,.3)',
      '--xp-color':        '#a01845',
      '--success':         '#388e3c',
      '--danger':          '#d32f2f',
      '--warning':         '#f9a825',
      '--card-shadow':     '0 2px 12px rgba(180,30,90,.09)',
    },
  },
  {
    id: 'prairie',
    name: 'Prairie',
    emoji: '🌿',
    style: 'light',
    desc: 'Vert menthe frais et naturel',
    unlockXp: 60000,
    vars: {
      '--bg-base':         '#f2faf4',
      '--bg-card':         'rgba(46,125,79,.08)',
      '--bg-card-hover':   'rgba(46,125,79,.14)',
      '--bg-nav':          'rgba(242,250,244,.95)',
      '--bg-modal':        '#ffffff',
      '--bg-input':        'rgba(20,110,50,.06)',
      '--border':          'rgba(20,110,50,.15)',
      '--border-strong':   'rgba(20,110,50,.28)',
      '--text-primary':    '#0a2010',
      '--text-secondary':  '#2a6035',
      '--text-muted':      '#4a8055',
      '--text-placeholder':'rgba(10,32,16,.32)',
      '--accent':          '#2e7d4f',
      '--accent-subtle':   'rgba(46,125,79,.13)',
      '--accent-glow':     'rgba(46,125,79,.3)',
      '--xp-color':        '#1b5e30',
      '--success':         '#2e7d32',
      '--danger':          '#c62828',
      '--warning':         '#f57f17',
      '--card-shadow':     '0 2px 12px rgba(20,110,50,.09)',
    },
  },
  {
    id: 'nuage',
    name: 'Nuage',
    emoji: '☁️',
    style: 'light',
    desc: 'Blanc bleuté pur et aérien',
    unlockXp: 90000,
    vars: {
      '--bg-base':         '#f5f8ff',
      '--bg-card':         'rgba(40,85,204,.08)',
      '--bg-card-hover':   'rgba(40,85,204,.14)',
      '--bg-nav':          'rgba(245,248,255,.95)',
      '--bg-modal':        '#ffffff',
      '--bg-input':        'rgba(40,80,200,.06)',
      '--border':          'rgba(40,80,200,.15)',
      '--border-strong':   'rgba(40,80,200,.26)',
      '--text-primary':    '#0a0e2a',
      '--text-secondary':  '#2a3870',
      '--text-muted':      '#4a5898',
      '--text-placeholder':'rgba(10,14,42,.32)',
      '--accent':          '#2855cc',
      '--accent-subtle':   'rgba(40,85,204,.13)',
      '--accent-glow':     'rgba(40,85,204,.3)',
      '--xp-color':        '#1435aa',
      '--success':         '#2e7d32',
      '--danger':          '#c62828',
      '--warning':         '#f57f17',
      '--card-shadow':     '0 2px 12px rgba(40,80,200,.09)',
    },
  },
  {
    id: 'soleil',
    name: 'Soleil',
    emoji: '🌻',
    style: 'light',
    desc: 'Jaune moutarde chaud et vif',
    unlockXp: 110000,
    vars: {
      '--bg-base':         '#fffde7',
      '--bg-card':         'rgba(170,104,0,.08)',
      '--bg-card-hover':   'rgba(170,104,0,.14)',
      '--bg-nav':          'rgba(255,253,231,.95)',
      '--bg-modal':        '#ffffff',
      '--bg-input':        'rgba(140,100,0,.06)',
      '--border':          'rgba(140,100,0,.16)',
      '--border-strong':   'rgba(140,100,0,.28)',
      '--text-primary':    '#1a1400',
      '--text-secondary':  '#4a3800',
      '--text-muted':      '#7a6020',
      '--text-placeholder':'rgba(26,20,0,.32)',
      '--accent':          '#aa6800',
      '--accent-subtle':   'rgba(170,104,0,.13)',
      '--accent-glow':     'rgba(170,104,0,.3)',
      '--xp-color':        '#885000',
      '--success':         '#388e3c',
      '--danger':          '#d32f2f',
      '--warning':         '#f57f17',
      '--card-shadow':     '0 2px 12px rgba(140,100,0,.09)',
    },
  },
  {
    id: 'papier',
    name: 'Papier',
    emoji: '📄',
    style: 'light',
    desc: 'Blanc cassé — style notebook',
    unlockXp: 130000,
    vars: {
      '--bg-base':         '#f5f2ea',
      '--bg-card':         'rgba(58,95,160,.08)',
      '--bg-card-hover':   'rgba(58,95,160,.14)',
      '--bg-nav':          'rgba(245,242,234,.95)',
      '--bg-modal':        '#ffffff',
      '--bg-input':        'rgba(60,45,10,.06)',
      '--border':          'rgba(60,45,10,.15)',
      '--border-strong':   'rgba(60,45,10,.26)',
      '--text-primary':    '#1c1810',
      '--text-secondary':  '#4a4030',
      '--text-muted':      '#7a7060',
      '--text-placeholder':'rgba(28,24,16,.32)',
      '--accent':          '#3a5fa0',
      '--accent-subtle':   'rgba(58,95,160,.13)',
      '--accent-glow':     'rgba(58,95,160,.3)',
      '--xp-color':        '#264580',
      '--success':         '#2a6e28',
      '--danger':          '#aa2020',
      '--warning':         '#bb6600',
      '--card-shadow':     '0 2px 12px rgba(40,30,0,.09)',
    },
  },

  // ── PASTEL ──
  {
    id: 'lavande',
    name: 'Lavande',
    emoji: '🌙',
    style: 'pastel',
    desc: 'Violet pâle doux et reposant',
    unlockXp: 45000,
    vars: {
      '--bg-base':         '#f3f0ff',
      '--bg-card':         'rgba(96,48,184,.08)',
      '--bg-card-hover':   'rgba(96,48,184,.14)',
      '--bg-nav':          'rgba(243,240,255,.95)',
      '--bg-modal':        '#ffffff',
      '--bg-input':        'rgba(100,60,180,.06)',
      '--border':          'rgba(100,60,180,.15)',
      '--border-strong':   'rgba(100,60,180,.28)',
      '--text-primary':    '#1a0a30',
      '--text-secondary':  '#4a2870',
      '--text-muted':      '#7a50a0',
      '--text-placeholder':'rgba(26,10,48,.32)',
      '--accent':          '#6030b8',
      '--accent-subtle':   'rgba(96,48,184,.13)',
      '--accent-glow':     'rgba(96,48,184,.3)',
      '--xp-color':        '#4018a0',
      '--success':         '#388e3c',
      '--danger':          '#d32f2f',
      '--warning':         '#f9a825',
      '--card-shadow':     '0 2px 12px rgba(100,60,180,.09)',
    },
  },
  {
    id: 'peche',
    name: 'Pêche',
    emoji: '🍑',
    style: 'pastel',
    desc: 'Orange abricoté doux et chaleureux',
    unlockXp: 65000,
    vars: {
      '--bg-base':         '#fff8f2',
      '--bg-card':         'rgba(184,64,16,.08)',
      '--bg-card-hover':   'rgba(184,64,16,.14)',
      '--bg-nav':          'rgba(255,248,242,.95)',
      '--bg-modal':        '#ffffff',
      '--bg-input':        'rgba(180,80,20,.06)',
      '--border':          'rgba(180,80,20,.15)',
      '--border-strong':   'rgba(180,80,20,.26)',
      '--text-primary':    '#2a1000',
      '--text-secondary':  '#6a3010',
      '--text-muted':      '#9a5830',
      '--text-placeholder':'rgba(42,16,0,.32)',
      '--accent':          '#b84010',
      '--accent-subtle':   'rgba(184,64,16,.13)',
      '--accent-glow':     'rgba(184,64,16,.3)',
      '--xp-color':        '#902c00',
      '--success':         '#388e3c',
      '--danger':          '#d32f2f',
      '--warning':         '#f57f17',
      '--card-shadow':     '0 2px 12px rgba(180,80,20,.09)',
    },
  },
  {
    id: 'menthe',
    name: 'Menthe',
    emoji: '🍃',
    style: 'pastel',
    desc: 'Vert aqua frais et apaisant',
    unlockXp: 85000,
    vars: {
      '--bg-base':         '#f0faf7',
      '--bg-card':         'rgba(0,122,80,.08)',
      '--bg-card-hover':   'rgba(0,122,80,.14)',
      '--bg-nav':          'rgba(240,250,247,.95)',
      '--bg-modal':        '#ffffff',
      '--bg-input':        'rgba(0,120,80,.06)',
      '--border':          'rgba(0,120,80,.15)',
      '--border-strong':   'rgba(0,120,80,.26)',
      '--text-primary':    '#001a12',
      '--text-secondary':  '#0a5035',
      '--text-muted':      '#2a8058',
      '--text-placeholder':'rgba(0,26,18,.32)',
      '--accent':          '#007a50',
      '--accent-subtle':   'rgba(0,122,80,.13)',
      '--accent-glow':     'rgba(0,122,80,.3)',
      '--xp-color':        '#005535',
      '--success':         '#007a50',
      '--danger':          '#d32f2f',
      '--warning':         '#f57f17',
      '--card-shadow':     '0 2px 12px rgba(0,120,80,.09)',
    },
  },
  {
    id: 'ciel',
    name: 'Ciel',
    emoji: '🩵',
    style: 'pastel',
    desc: 'Bleu azur clair et serein',
    unlockXp: 105000,
    vars: {
      '--bg-base':         '#f0f8ff',
      '--bg-card':         'rgba(0,96,192,.08)',
      '--bg-card-hover':   'rgba(0,96,192,.14)',
      '--bg-nav':          'rgba(240,248,255,.95)',
      '--bg-modal':        '#ffffff',
      '--bg-input':        'rgba(0,100,180,.06)',
      '--border':          'rgba(0,100,180,.15)',
      '--border-strong':   'rgba(0,100,180,.26)',
      '--text-primary':    '#001428',
      '--text-secondary':  '#0a3a68',
      '--text-muted':      '#2a6098',
      '--text-placeholder':'rgba(0,20,40,.32)',
      '--accent':          '#0060c0',
      '--accent-subtle':   'rgba(0,96,192,.13)',
      '--accent-glow':     'rgba(0,96,192,.3)',
      '--xp-color':        '#003c90',
      '--success':         '#2e7d32',
      '--danger':          '#c62828',
      '--warning':         '#f57f17',
      '--card-shadow':     '0 2px 12px rgba(0,100,180,.09)',
    },
  },
  {
    id: 'candy',
    name: 'Candy',
    emoji: '🌈',
    style: 'pastel',
    desc: 'Rose violet bleu — ultra coloré',
    unlockXp: 200000,
    vars: {
      '--bg-base':         '#fff0fb',
      '--bg-card':         'rgba(170,34,204,.08)',
      '--bg-card-hover':   'rgba(170,34,204,.14)',
      '--bg-nav':          'rgba(255,240,251,.95)',
      '--bg-modal':        '#ffffff',
      '--bg-input':        'rgba(160,60,200,.06)',
      '--border':          'rgba(160,60,200,.15)',
      '--border-strong':   'rgba(160,60,200,.26)',
      '--text-primary':    '#1a0028',
      '--text-secondary':  '#500060',
      '--text-muted':      '#803080',
      '--text-placeholder':'rgba(26,0,40,.32)',
      '--accent':          '#aa22cc',
      '--accent-subtle':   'rgba(170,34,204,.13)',
      '--accent-glow':     'rgba(170,34,204,.32)',
      '--xp-color':        '#880aaa',
      '--success':         '#2a8040',
      '--danger':          '#cc2244',
      '--warning':         '#cc6600',
      '--card-shadow':     '0 2px 16px rgba(160,60,200,.09)',
    },
  },
  {
    id: 'bibliotheque',
    name: 'Bibliothèque',
    emoji: '📚',
    style: 'pastel',
    desc: 'Bois chaud — ambiance étude studieuse',
    unlockXp: 160000,
    vars: {
      '--bg-base':         '#faf4ea',
      '--bg-card':         'rgba(139,69,19,.08)',
      '--bg-card-hover':   'rgba(139,69,19,.14)',
      '--bg-nav':          'rgba(250,244,234,.95)',
      '--bg-modal':        '#ffffff',
      '--bg-input':        'rgba(100,55,10,.06)',
      '--border':          'rgba(100,55,10,.15)',
      '--border-strong':   'rgba(100,55,10,.26)',
      '--text-primary':    '#1c1000',
      '--text-secondary':  '#4a3010',
      '--text-muted':      '#7a5828',
      '--text-placeholder':'rgba(28,16,0,.32)',
      '--accent':          '#8b4513',
      '--accent-subtle':   'rgba(139,69,19,.13)',
      '--accent-glow':     'rgba(139,69,19,.3)',
      '--xp-color':        '#6b2e0a',
      '--success':         '#2a6e28',
      '--danger':          '#aa2020',
      '--warning':         '#bb6600',
      '--card-shadow':     '0 2px 12px rgba(100,55,10,.09)',
    },
  },
];

export const FONTS = [
  // --- Google Fonts (15) ---
  { id: 'inter',                 name: 'Inter',                 family: "'Inter', sans-serif",                unlockXp: 0,      premium: false },
  { id: 'righteous',             name: 'Righteous',             family: "'Righteous', cursive",               unlockXp: 5000,   premium: false },
  { id: 'comfortaa',             name: 'Comfortaa',             family: "'Comfortaa', sans-serif",            unlockXp: 10000,  premium: false },
  { id: 'caveat',                name: 'Caveat',                family: "'Caveat', cursive",                  unlockXp: 15000,  premium: false },
  { id: 'pacifico',              name: 'Pacifico',              family: "'Pacifico', cursive",                unlockXp: 20000,  premium: false },
  { id: 'amatic_sc',             name: 'Amatic SC',             family: "'Amatic SC', cursive",               unlockXp: 25000,  premium: false },
  { id: 'playwrite_it_moderna',  name: 'Playwrite IT Moderna',  family: "'Playwrite IT Moderna', cursive",    unlockXp: 30000,  premium: false },
  { id: 'playwrite_england_join',name: 'Playwrite England Joined',family: "'Playwrite England Joined', cursive",unlockXp: 35000,  premium: false },
  { id: 'shadows_into_light',    name: 'Shadows Into Light',    family: "'Shadows Into Light', cursive",      unlockXp: 40000,  premium: false },
  { id: 'patua_one',             name: 'Patua One',             family: "'Patua One', serif",                 unlockXp: 50000,  premium: false },
  { id: 'crafty_girls',          name: 'Crafty Girls',          family: "'Crafty Girls', cursive",            unlockXp: 60000,  premium: false },
  { id: 'jim_nightshade',        name: 'Jim Nightshade',        family: "'Jim Nightshade', cursive",          unlockXp: 70000,  premium: false },
  { id: 'fredoka',               name: 'Fredoka',               family: "'Fredoka', sans-serif",              unlockXp: 80000,  premium: false },
  { id: 'cormorant_garamond',    name: 'Cormorant Garamond',    family: "'Cormorant Garamond', serif",        unlockXp: 95000,  premium: false },
  { id: 'audiowide',             name: 'Audiowide',             family: "'Audiowide', cursive",               unlockXp: 110000, premium: false },

  // --- Polices Système (3) ---
  { id: 'trebuchet',             name: 'Trebuchet MS',          family: "'Trebuchet MS', Helvetica, sans-serif", unlockXp: 0,   premium: false },
  { id: 'impact',                name: 'Impact',                family: "Impact, Charcoal, sans-serif",       unlockXp: 15000,  premium: false },
  { id: 'arial',                 name: 'Arial',                 family: "Arial, Helvetica, sans-serif",       unlockXp: 0,      premium: false },

  // --- Display / Mono (2) ---
  { id: 'space_mono',            name: 'Space Mono',            family: "'Space Mono', monospace",            unlockXp: 50000,  premium: false },
  { id: 'bebas_neue',            name: 'Bebas Neue',            family: "'Bebas Neue', sans-serif",           unlockXp: 75000,  premium: false }
];

export const GOOGLE_FONTS_URL = "https://fonts.googleapis.com/css2?family=Amatic+SC:wght@400;700&family=Audiowide&family=Bebas+Neue&family=Caveat:wght@400..700&family=Comfortaa:wght@300..700&family=Cormorant+Garamond:ital,wght@0,300..700;1,300..700&family=Crafty+Girls&family=Fredoka:wght@300..700&family=Inter:wght@300..900&family=Jim+Nightshade&family=Pacifico&family=Patua+One&family=Playwrite+England+Joined:wght@100..400&family=Playwrite+IT+Moderna:wght@100..400&family=Righteous&family=Shadows+Into+Light&family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap";

export const RADIUS_STYLES = [
  { id:'sharp',  name:'Sharp',  emoji:'⬛', desc:'Coins carrés',      value:'4px',  unlockXp:0 },
  { id:'normal', name:'Normal', emoji:'▪️', desc:'Équilibré',         value:'10px', unlockXp:0 },
  { id:'bubbly', name:'Bubbly', emoji:'🫧', desc:'Très arrondi',      value:'20px', unlockXp:0 },
];

export const DENSITY_STYLES = [
  { id:'compact', name:'Compact', emoji:'▤', desc:'Plus dense',   unlockXp:0 },
  { id:'normal',  name:'Normal',  emoji:'▣', desc:'Équilibré',    unlockXp:0 },
  { id:'airy',    name:'Aéré',    emoji:'□', desc:'Plus espacé',  unlockXp:0 },
];

export const ANIMATION_STYLES = [
  { id:'vivid',  name:'Vives',  emoji:'⚡', desc:'Rapides et rebondissantes', unlockXp:0 },
  { id:'smooth', name:'Douces', emoji:'🌊', desc:'Fluides et lentes',         unlockXp:0 },
  { id:'none',   name:'Aucune', emoji:'⬜', desc:'Mode performance',           unlockXp:0 },
];


export const RING_STYLES = [
  { id:'default', name:'Classique',  emoji:'⭕', desc:'Arc continu équilibré' },
  { id:'thin',    name:'Fin',        emoji:'○',  desc:'Trait léger et élégant' },
  { id:'thick',   name:'Épais',      emoji:'🔵', desc:'Anneau large et fort' },
  { id:'glow',    name:'Glow',       emoji:'✨', desc:'Lueur intense autour' },
  { id:'dashes',  name:'Tirets',     emoji:'╌',  desc:'Arc en pointillés' },
  { id:'dots',    name:'Points',     emoji:'···',desc:'Arc en micro-points' },
];

// CSS colour variables a "custom theme" user can override one by one.
// Each entry: { key: CSS variable, label: French UI label }. --card-shadow is
// excluded on purpose (it is a shadow, not a plain colour).
export const THEME_EDITABLE_VARS = [
  { key: '--bg-base',          label: 'Fond principal' },
  { key: '--bg-nav',           label: 'Barres (navigation)' },
  { key: '--bg-modal',         label: 'Fenêtres / modales' },
  { key: '--bg-card',          label: 'Cartes' },
  { key: '--bg-card-hover',    label: 'Cartes (survol)' },
  { key: '--bg-input',         label: 'Champs de saisie' },
  { key: '--border',           label: 'Bordures' },
  { key: '--border-strong',    label: 'Bordures (renforcées)' },
  { key: '--text-primary',     label: 'Texte principal' },
  { key: '--text-secondary',   label: 'Texte secondaire' },
  { key: '--text-muted',       label: 'Texte atténué' },
  { key: '--text-placeholder', label: 'Texte des placeholders' },
  { key: '--accent',           label: "Couleur d'accent" },
  { key: '--accent-subtle',    label: 'Accent (léger)' },
  { key: '--accent-glow',      label: 'Accent (lueur)' },
  { key: '--xp-color',         label: 'Couleur XP' },
  { key: '--success',          label: 'Succès' },
  { key: '--danger',           label: 'Erreur / danger' },
  { key: '--warning',          label: 'Avertissement' },
];

export const DEFAULT_PREFERENCES = {
   lang:            'fr',
   themeId:         'nuit',
  fontId:          'inter',
  radius:          'normal',
  density:         'normal',
  animation:       'smooth',
  auroraIntensity: 35,
  mascot:          true,
  sounds:          false,
  blockOpacity:    0.87,
  cardOpacity:     0.5,
  cardBorderColor: 'accent',
  tabColorMode:    'accent',
  tabUniformColor: '#4A90D9',
  textColor:   'auto',  // 'auto' = suit le thème, ou '#hexcustom'
  borderWidth: 1,
  ringStyle:   'default',
  // Full per-variable colour overrides for authorized "custom theme" accounts.
  // null = off; otherwise a { '--css-var': '#hex' } map applied last in applyTheme.
  customVars:  null,
};

export function getTheme(themeId) {
  return THEMES.find(t => t.id === themeId) || THEMES[0];
}

export function getFont(fontId) {
  return FONTS.find(f => f.id === fontId) || FONTS[0];
}

// Niveau requis pour débloquer chaque thème / police (source : tableau Excel).
const UNLOCK_LEVEL = {
  nuit:1, cendre:30, aurora:20, aube:1, sakura_night:16, inferno:12, petale:4,
  lavande:32, foret_noire:26, prairie:6, peche:28, neon_rouge:36, cyberpunk:44,
  menthe:38, nuage:22, neon_rose:50, matrix:42, midnight_gold:48, ciel:14,
  soleil:34, deep_space:46, electric:34, papier:10, arcade:24, abyssal:4,
  bibliotheque:18, candy:40,
  arial:1, inter:1, trebuchet:1, righteous:5, comfortaa:11, caveat:9, impact:17,
  pacifico:21, amatic_sc:23, playwrite_it_moderna:15, playwrite_england_join:19,
  shadows_into_light:25, patua_one:27, space_mono:33, crafty_girls:39,
  jim_nightshade:7, bebas_neue:29, fredoka:35, cormorant_garamond:31, audiowide:37,
};

export const unlockLevelOf = (item) => UNLOCK_LEVEL[item.id] ?? 1;
export const unlockXpOf    = (item) => xpForLevel(unlockLevelOf(item));

export function isUnlocked(item, userXp) {
  return (userXp || 0) >= unlockXpOf(item);
}

// Compute the fully-resolved colour variables for a prefs object WITHOUT touching
// :root. Mirrors the colour logic of applyTheme (card tint, border colour, custom
// text colour, then customVars overrides) so the in-editor preview matches what
// applyTheme will produce on save. Returns a { '--var': value } map.
export function resolveThemeVars(prefs = {}) {
  const theme   = getTheme(prefs.themeId || 'nuit');
  const isLight = theme.style === 'light' || theme.style === 'pastel';
  const out     = { ...theme.vars };

  // Card tint derived from the theme accent + the card-opacity slider.
  const cardOpDefault = isLight ? 0 : 0.5;
  const op = prefs.cardOpacity ?? cardOpDefault;
  const accentHex = (theme.vars['--accent'] || '#4A90D9').replace('#', '');
  const ar = parseInt(accentHex.slice(0, 2), 16);
  const ag = parseInt(accentHex.slice(2, 4), 16);
  const ab = parseInt(accentHex.slice(4, 6), 16);
  const baseAlpha  = (isLight ? 0.06 : 0.04) + op * (isLight ? 0.18 : 0.14);
  const hoverAlpha = baseAlpha + (isLight ? 0.05 : 0.04);
  out['--bg-card']       = `rgba(${ar},${ag},${ab},${baseAlpha.toFixed(3)})`;
  out['--bg-card-hover'] = `rgba(${ar},${ag},${ab},${hoverAlpha.toFixed(3)})`;

  // Border colour mode.
  const borderMode = prefs.cardBorderColor || 'neutral';
  if (borderMode === 'accent') {
    const ac = theme.vars['--accent'] || '#4A90D9';
    out['--border'] = ac + '30';
    out['--border-strong'] = ac + '55';
  } else if (borderMode !== 'neutral' && borderMode.startsWith('#')) {
    out['--border'] = borderMode + '40';
    out['--border-strong'] = borderMode + '70';
  }

  // Custom text colour.
  if (prefs.textColor && prefs.textColor !== 'auto') {
    out['--text-primary'] = prefs.textColor;
    const hex = prefs.textColor.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    out['--text-secondary']   = `rgba(${r},${g},${b},.7)`;
    out['--text-muted']       = `rgba(${r},${g},${b},.45)`;
    out['--text-placeholder'] = `rgba(${r},${g},${b},.28)`;
  }

  // Custom theme overrides win over everything.
  if (prefs.customVars && typeof prefs.customVars === 'object') {
    Object.entries(prefs.customVars).forEach(([k, v]) => { if (v) out[k] = v; });
  }

  out['--font-family'] = getFont(prefs.fontId || 'inter').family;
  return out;
}

export function applyTheme(themeId, fontId, radiusId, userXp, prefs={}) {
  const theme  = getTheme(themeId);
  const font   = getFont(fontId);
  const radius = RADIUS_STYLES.find(r => r.id === radiusId) || RADIUS_STYLES[1];
  const root   = document.documentElement;
  const isLight = theme.style === 'light' || theme.style === 'pastel';

  // Valeurs par défaut adaptées au style du thème
  const auroraDefault    = isLight ? 0   : 35;
  const blockOpDefault   = isLight ? 1.0 : 0.87;
  const cardOpDefault    = isLight ? 0   : 0.5;

  const resolvedPrefs = {
    auroraIntensity: prefs.auroraIntensity ?? auroraDefault,
    blockOpacity:    prefs.blockOpacity    ?? blockOpDefault,
    cardOpacity:     prefs.cardOpacity     ?? cardOpDefault,
    ...prefs,
  };

  // Apply theme vars
  if (isUnlocked(theme, userXp)) {
    Object.entries(theme.vars).forEach(([k,v]) => root.style.setProperty(k, v));
  }

  // Apply font
  if (isUnlocked(font, userXp)) {
    root.style.setProperty('--font-family', font.family);
    document.body.style.fontFamily = font.family;
  }

  // Apply radius — valeurs plus contrastées entre les options
  const radiusMap = { sharp: '2px', normal: '10px', bubbly: '22px' };
  const radiusVal = radiusMap[radiusId] || radius.value;
  root.style.setProperty('--radius',    radiusVal);
  root.style.setProperty('--radius-sm', `calc(${radiusVal} * .5)`);
  root.style.setProperty('--radius-lg', `calc(${radiusVal} * 2)`);
  root.style.setProperty('--radius-xl', `calc(${radiusVal} * 3)`);
  // Classe sur body pour cibler en CSS
  document.body.classList.remove('radius-sharp','radius-normal','radius-bubbly');
  document.body.classList.add(`radius-${radiusId || 'normal'}`);

  // Apply density
  const densityMap = {
    compact: { space: '0.5rem', spaceLg: '0.75rem', cardPad: '0.6rem 0.8rem' },
    normal:  { space: '0.85rem', spaceLg: '1.2rem', cardPad: '1rem 1.1rem' },
    airy:    { space: '1.3rem', spaceLg: '1.8rem', cardPad: '1.5rem 1.4rem' },
  };
  const density = densityMap[prefs.density] || densityMap.normal;
  root.style.setProperty('--space',    density.space);
  root.style.setProperty('--space-lg', density.spaceLg);
  root.style.setProperty('--card-pad', density.cardPad);
  document.body.classList.remove('density-compact','density-normal','density-airy');
  document.body.classList.add(`density-${prefs.density || 'normal'}`);

  // Apply animation speed
  const animMap = {
    vivid:  { duration: '0.15s', ease: 'cubic-bezier(.34,1.56,.64,1)', scale: '1.05' },
    smooth: { duration: '0.3s',  ease: 'cubic-bezier(.4,0,.2,1)',       scale: '1.02' },
    none:   { duration: '0s',    ease: 'linear',                         scale: '1' },
  };
  const anim = animMap[prefs.animation] || animMap.smooth;
  root.style.setProperty('--anim-duration', anim.duration);
  root.style.setProperty('--anim-ease',     anim.ease);
  root.style.setProperty('--anim-scale',    anim.scale);
  document.body.classList.remove('anim-vivid','anim-smooth','anim-none');
  document.body.classList.add(`anim-${prefs.animation || 'smooth'}`);

  // Card opacity — teintée par la couleur d'accent du thème
  const op = resolvedPrefs.cardOpacity;

  // Extraire les composantes RGB de l'accent du thème
  const accentHex = (theme.vars['--accent'] || '#4A90D9').replace('#','');
  const ar = parseInt(accentHex.slice(0,2),16);
  const ag = parseInt(accentHex.slice(2,4),16);
  const ab = parseInt(accentHex.slice(4,6),16);

  if (isLight) {
    // Thèmes clairs/pastels : fond teinté par l'accent, alpha faible mais visible
    const baseAlpha  = 0.06 + op * 0.18;   // 0.06 → 0.24 selon le slider
    const hoverAlpha = baseAlpha + 0.05;
    root.style.setProperty('--bg-card',       `rgba(${ar},${ag},${ab},${baseAlpha.toFixed(3)})`);
    root.style.setProperty('--bg-card-hover', `rgba(${ar},${ag},${ab},${hoverAlpha.toFixed(3)})`);
  } else {
    // Thèmes sombres/fluo : légère teinte accent sur fond noir
    const baseAlpha  = 0.04 + op * 0.14;
    const hoverAlpha = baseAlpha + 0.04;
    root.style.setProperty('--bg-card',       `rgba(${ar},${ag},${ab},${baseAlpha.toFixed(3)})`);
    root.style.setProperty('--bg-card-hover', `rgba(${ar},${ag},${ab},${hoverAlpha.toFixed(3)})`);
  }

  // Block opacity (nav, sidebars, panels)
  const blockOp = resolvedPrefs.blockOpacity;
  root.style.setProperty('--block-opacity', String(blockOp));

  // Card border color
  const borderMode = prefs.cardBorderColor || 'neutral';
  if (borderMode === 'accent') {
    const accentColor = theme.vars['--accent'] || '#4A90D9';
    root.style.setProperty('--border',        accentColor + '30');
    root.style.setProperty('--border-strong', accentColor + '55');
  } else if (borderMode !== 'neutral' && borderMode.startsWith('#')) {
    root.style.setProperty('--border',        borderMode + '40');
    root.style.setProperty('--border-strong', borderMode + '70');
  }
  // 'neutral' = keep theme defaults

  // Border width — injection dynamique pour couvrir les inline styles React
  const bw = prefs.borderWidth ?? 1;
  root.style.setProperty('--border-width', `${bw}px`);

  const styleId = 'blokly-border-override';
  let bStyle = document.getElementById(styleId) || document.createElement('style');
  bStyle.id = styleId;
  if (bw === 0) {
    bStyle.textContent = `
      * { border-width: 0px !important; outline-width: 0px !important; }
    `;
  } else {
    bStyle.textContent = `
      div[style*="border:"], div[style*="border "],
      button[style*="border:"], button[style*="border "],
      input[style*="border:"], input[style*="border "],
      textarea[style*="border:"], select[style*="border:"] {
        border-width: ${bw}px !important;
      }
      div[style*="outline:"], div[style*="outline "],
      button[style*="outline:"], button[style*="outline "] {
        outline-width: ${bw}px !important;
      }
      div[style*="1px solid"], button[style*="1px solid"],
      input[style*="1px solid"], textarea[style*="1px solid"] {
        border-width: ${bw}px !important;
      }
      div[style*="2px solid"], button[style*="2px solid"] {
        outline-width: ${bw}px !important;
      }
    `;
  }
  if (!document.getElementById(styleId)) document.head.appendChild(bStyle);

  // Custom text color — appliqué EN DERNIER pour ne pas être écrasé
  if (prefs.textColor && prefs.textColor !== 'auto') {
    root.style.setProperty('--text-primary',   prefs.textColor);
    const hex = prefs.textColor.replace('#','');
    const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
    root.style.setProperty('--text-secondary', `rgba(${r},${g},${b},.7)`);
    root.style.setProperty('--text-muted',     `rgba(${r},${g},${b},.45)`);
    root.style.setProperty('--text-placeholder',`rgba(${r},${g},${b},.28)`);
  }

  // Custom theme overrides (authorized accounts). Applied LAST so they take
  // precedence over the base theme and every derived value computed above.
  // Each entry is a raw CSS colour written straight onto :root.
  if (prefs.customVars && typeof prefs.customVars === 'object') {
    Object.entries(prefs.customVars).forEach(([k, v]) => {
      if (v) root.style.setProperty(k, v);
    });
  }
}