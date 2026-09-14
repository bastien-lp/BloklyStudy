/**
 * showcaseData — constants shared by the landing page's product shots.
 *
 * Kept apart from the JSX so <AppShowcase/> and its screens can both read the
 * app's real design tokens, tab list and sample account without either file
 * mixing component and value exports.
 */

import {
  CalendarDays, Users, Play, CheckSquare, TrendingUp, Star, FileText, Layers,
  RefreshCw, CalendarClock, BarChart2, TreePine, BookOpen, HandMetal,
} from 'lucide-react';
import { getTheme, getFont } from '../themes/themes';

/** Logical size every screen is drawn at, before the frame scales it down. */
export const VIEWPORT = { w: 1280, h: 800 };

/** The default theme's tokens, so the shots match a brand-new account. */
export const THEME_VARS = {
  ...getTheme('nuit').vars,
  '--font-family': getFont('inter').family,
};

/** The real tab bar, in the real order. */
export const APP_TABS = [
  { id: 'planning', Icon: CalendarDays, labelKey: 'app.tabPlanning' },
  { id: 'todo', Icon: CheckSquare, labelKey: 'app.tabTodo' },
  { id: 'progress', Icon: TrendingUp, labelKey: 'app.tabProgress' },
  { id: 'confidence', Icon: Star, labelKey: 'app.tabConfidence' },
  { id: 'syntheses', Icon: FileText, labelKey: 'app.tabSyntheses' },
  { id: 'flashcards', Icon: Layers, labelKey: 'app.tabFlashcards' },
  { id: 'repetition', Icon: RefreshCw, labelKey: 'app.tabRepetition' },
  { id: 'exams', Icon: CalendarClock, labelKey: 'app.tabExams' },
  { id: 'stats', Icon: BarChart2, labelKey: 'app.tabStats' },
  { id: 'reserve', Icon: TreePine, labelKey: 'app.tabReserve' },
  { id: 'groups', Icon: Users, labelKey: 'app.tabGroups' },
  { id: 'journal', Icon: BookOpen, labelKey: 'app.tabJournal' },
  { id: 'whoarewe', Icon: HandMetal, labelKey: 'app.tabWhoarewe' },
];

/** Sample account — level 11 of the real XP table ("Appliqué", 12 000 XP). */
export const ACCOUNT = {
  level: 11, title: 'Appliqué', color: '#2ECC71',
  xp: 13420, xpIn: 1420, xpNeed: 3000, nextTitle: 'Sérieux',
};

/** The hues the app assigns to new subjects. */
export const SUBJECT_COLORS = ['#4A90D9', '#9B59B6', '#27AE60', '#E74C3C', '#F1C40F'];

/** Sample subjects, named through i18n so the shots follow the language. */
export function subjectsOf(t) {
  return t('showcase.subjects').split(',').map((name, i) => ({
    id: i, name, color: SUBJECT_COLORS[i % SUBJECT_COLORS.length],
  }));
}

/**
 * Which screens the showcase offers, in display order. `tab` is the app tab
 * highlighted in the mocked tab bar — null for the focus timer, which opens
 * from the dock instead of a tab.
 */
export const SCREEN_META = [
  { id: 'planning', tab: 'planning', Icon: CalendarDays, color: '#4A90D9' },
  { id: 'study', tab: null, Icon: Play, color: '#4A90D9' },
  { id: 'todo', tab: 'todo', Icon: CheckSquare, color: '#27AE60' },
  { id: 'progress', tab: 'progress', Icon: TrendingUp, color: '#9B59B6' },
  { id: 'confidence', tab: 'confidence', Icon: Star, color: '#F1C40F' },
  { id: 'syntheses', tab: 'syntheses', Icon: FileText, color: '#4A90D9' },
  { id: 'flashcards', tab: 'flashcards', Icon: Layers, color: '#9B59B6' },
  { id: 'repetition', tab: 'repetition', Icon: RefreshCw, color: '#E74C3C' },
  { id: 'exams', tab: 'exams', Icon: CalendarClock, color: '#E74C3C' },
  { id: 'stats', tab: 'stats', Icon: BarChart2, color: '#E74C3C' },
  { id: 'reserve', tab: 'reserve', Icon: TreePine, color: '#27AE60' },
  { id: 'groups', tab: 'groups', Icon: Users, color: '#27AE60' },
  { id: 'journal', tab: 'journal', Icon: BookOpen, color: '#E67E22' },
  { id: 'whoarewe', tab: 'whoarewe', Icon: HandMetal, color: '#4A90D9' },
];
