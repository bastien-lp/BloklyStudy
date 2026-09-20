/**
 * The house: its rooms and everything that can be put in them.
 * --------------------------------------------------------------------------
 * Data only — no React — so both the Réserve (where a student furnishes their
 * own house) and the visit screen (where they look at someone else's) read the
 * same catalogue. Item ids are stored in the accounts, so an id here is a
 * contract: rename one and existing houses lose the furniture.
 */

import { asset } from './assets';

export const ROOMS = [
  { id: 'piece',        image: asset('reserve/rooms/piece.jpg'),        unlockXp: 0,    unlockCoins: 0   },
  { id: 'bureau',       image: asset('reserve/rooms/bureau.jpg'),       unlockXp: 500,  unlockCoins: 150 },
  { id: 'cuisine',      image: asset('reserve/rooms/cuisine.jpg'),      unlockXp: 1500, unlockCoins: 300 },
  { id: 'salleDeBains', image: asset('reserve/rooms/salleDeBains.jpg'), unlockXp: 3000, unlockCoins: 500 },
];

const D = asset('reserve/deco/');

// size = taille de base relative (1 = standard). Ajuste ces valeurs au besoin.
export const SHOP_CATALOG = [
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
export const itemById = id => SHOP_CATALOG.find(i => i.id === id);

// Prix dynamique : +25% par exemplaire déjà possédé (offre/demande locale).
// Plus tu accumules le même objet, plus le suivant est cher.
const PRICE_STEP = 0.25;
export function dynamicPrice(item, owned = 0) {
  return Math.round(item.price * (1 + owned * PRICE_STEP));
}
