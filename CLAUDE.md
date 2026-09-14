# CLAUDE.md — Working rules for Blokly Study

> This file is read automatically at the start of every Claude Code session.
> Read it fully before touching anything. These rules exist to protect a **live
> app with real users**. When in doubt, ask before acting — never guess.

---

## 1. What this project is

Blokly Study is a free web app that helps students organize revision:
weekly/month planner, Pomodoro focus timer, XP/levels/badges, flashcards with
spaced repetition, syntheses, study groups, journal, stats, themes, and a
nature feature ("Réserve"). Solo project, built by a student for students.

**Stack**
- React 19 + Vite 8 (`npm run dev` / `build` / `preview` / `lint`)
- Routing: react-router-dom 7
- Backend: Firebase 12 — Auth, Firestore, Realtime Database
- Animation/3D: `motion`, `gsap`, `three` + `@react-three/fiber` / `drei` /
  `rapier`, `ogl`, `meshline`
- Icons: `lucide-react` (+ an SVG sprite at `public/icons.svg`)
- i18n: custom single-file system at `src/i18n/index.js`
- Theming: CSS-variable design tokens in `src/themes/themes.js`

**Deploy:** GitHub Pages, served from the `dist/` build. The public URL lives on
a project subpath, so asset base paths are fragile (see guardrails).

---

## 2. NON-NEGOTIABLE guardrails (never break these)

1. **Never modify `src/firebase/config.js` values.** The API key, project id,
   auth domain, database URLs, and app id are correct and public-by-design
   (security is enforced by Firebase rules, not by hiding these). Changing any
   value breaks auth and every user's data access.
2. **Never change the Firestore / Realtime Database data shapes or paths.**
   Documents live under paths like `users/{uid}/data/main`,
   `users/{uid}/data/templates`, etc. Field names, structure, and the
   `localStorage` key `blokly-prefs-v3` are a contract with existing user data.
   Renaming a field silently corrupts real accounts. If a schema change is
   truly needed, stop and propose a migration plan first.
3. **Never touch the deploy/base configuration casually.** `vite.config.js`,
   the GitHub Pages subpath, `index.html` script/asset paths, and routing mode
   determine whether the live site loads at all. Do not change them unless the
   task is explicitly about deployment, and explain the impact before doing so.
4. **Never remove or disable a feature** to make a redesign easier. Visual work
   must preserve 100% of existing functionality and behavior.
5. **Preserve gamification logic exactly.** `src/data/levels.js`,
   `src/data/badges.js`, and all XP math are game balance. Restyle their
   presentation freely, but do not change thresholds, formulas, or unlock
   conditions.
6. **Do not add or remove npm dependencies** without asking first. The current
   set is intentional.
7. **Do not delete files, run destructive git commands, or force-push.** No
   `git reset --hard`, `git clean -f`, `rm -rf`, history rewrites, or branch
   deletion without explicit confirmation in the current session.

---

## 3. Golden workflow rules

- **Work incrementally, one concern at a time.** Never attempt a "big bang"
  rewrite of many files in one pass — that is the single most likely way to
  break the app. Small, verifiable steps.
- **Verify after each meaningful change:** run `npm run build` (and `npm run
  lint`) and confirm it passes before moving on. If a change touches a page,
  describe how to visually verify it.
- **Change only what the task asks for.** No opportunistic refactors,
  reformatting, or "while I'm here" edits to unrelated code.
- **Ask before anything destructive or irreversible** (deletions, schema
  changes, dependency changes, deploy changes).
- **Match the existing patterns** already present in the codebase rather than
  introducing a new paradigm.

---

## 4. Internationalization — ALL user-facing text goes through i18n

The app supports a language selector. **Every string a user can see must be
translatable — never hardcode display text in JSX.**

- Source of truth: `src/i18n/index.js`. Locales: `fr`, `en`, `es`, `de`
  (`fr` and `en` are complete; `es`/`de` fall back to French for missing keys).
- Usage in any page/component:
  ```jsx
  import { useTranslation } from '../i18n';
  const { t, formatDate, formatNumber } = useTranslation();
  t('common.save');                       // "Enregistrer"
  t('journal.charCount', { count: 42 });  // "42 caractères"
  ```
- **Adding new visible text:** add the key to the `fr` object AND the `en`
  object (same key path), then reference it with `t()`. One namespace per page
  + shared `common`. Never leave a raw string literal in the UI.
- **Editing existing text:** edit it in `src/i18n/index.js`, not inline in a
  page.
- `{token}` is interpolated; `{count}` is number-localized; pluralized keys end
  in `_one` / `_other`.

---

## 5. Content & positioning rules

The app has **international scope**. Apply these across the i18n dictionaries:

- **Remove all "100% free / free forever / gratuit pour toujours" messaging**
  (e.g. keys such as `freeForever`, `startFree`, `footerMade`, `tagline`,
  `heroSubtitle`, `createAccount`, `supportText`, `shareText`). Replace with
  neutral, value-first phrasing that doesn't hinge on the "free" claim.
- **Remove locality-specific framing.** Do not present the app as
  Belgium/France-specific.
- **Terminology:** use "examens" (exams), never "blocus", in user-facing
  French content — "blocus" is a Belgian term that narrows reach. (Exception:
  the origin-story text where the *name* is explained may reference it as
  heritage — flag such cases and ask rather than deleting blindly.)
- When rewording, keep the meaning intact and update **both** `fr` and `en`
  (and `es`/`de` if present for that key).

---

## 6. Code style

- **English only** for all code, comments, variable/function names, and commit
  messages.
- Write code that an **external developer could read and understand quickly**:
  clear names, small functions, meaningful comments where intent isn't obvious.
  Keep the existing JSDoc-style file headers up to date when you change a file's
  behavior.
- Prefer clarity over cleverness; optimize only where it matters.
- **Reality of the current styling:** the app uses inline `style={{}}` heavily
  (~2000+ occurrences) instead of CSS classes. The design-system work (section
  7) is about fixing this — but until a shared primitive exists, stay
  consistent with the file you're editing rather than introducing a third
  styling approach mid-file.

---

## 7. Design system & visual identity (the redesign)

**Goal:** give the app a real identity and warmth. Today it reads as generic —
dark, boxy, emoji-driven, "frames inside frames." The target is an app that
feels intentional, natural, and cohesive, with **no emojis** — replaced by a
single coherent set of clean, precise SVG icons/illustrations.

**Identity anchor:** the red panda (panda roux) + a calm, nature/forest,
conservation feeling. This is the app's soul — warm russet/amber tones, forest
greens, soft bark/cream neutrals, a cozy "focused study in the woods" mood. 

NOUS NE DEVONS PAS AVOIR UN RENDU AI FAIT AVEC UNIQUEMENT DES CADRE EMPILE, J'AIMERAIS UN RENDU AVEC UNE VRAIE IDENTITE VISUEL

**Do the redesign in phases, never all at once:**

- **Phase A — Foundation (no feature logic touched):**
  1. Refine the design tokens in `src/themes/themes.js` (color, spacing scale,
     radius, elevation/shadows, typography) into one coherent, warm, nature-led
     default identity. One card style, one radius scale, soft shadows,
     generous whitespace — hierarchy from spacing + type, not from nested
     borders.
  2. Choose characterful typography (heading display face + clean body) loaded
     via the existing Google Fonts loader in `ThemeProvider`.
  3. Build a small set of **shared, reusable primitives** (e.g. `Card`,
     `Section`, `Icon`, `Button`, `EmptyState`) that consume the tokens, so
     pages stop hand-rolling inline styles.
  4. Establish the **SVG icon system**: one consistent visual language
     (uniform stroke weight, rounded caps, 24px grid). Use `lucide-react` for
     standard glyphs and a few **custom SVGs** (panda roux, leaves, blocks) for
     hero / empty-state / reward moments. Extend `public/icons.svg` as needed.

- **Phase B — Migration (page by page, verify each):**
  Replace emojis with icons and swap inline-styled markup for the new
  primitives **one page at a time**, confirming the page still works and looks
  right before moving to the next. Never migrate many pages in a single pass.

**Constraints during redesign:**
- Preserve all functionality, data flow, and animations' purpose.
- Motion should be subtle and organic (ease, not everything moving at once).
- Keep it accessible: sufficient contrast, focus states, readable sizes.
- The redesign changes *presentation only* — never the logic underneath.

---

## 8. Commands

```bash
npm run dev      # local dev server (HMR)
npm run build    # production build — MUST pass before considering work done
npm run lint     # eslint
npm run preview  # preview the production build
```

---

## 9. Quick "do not touch without asking" list

- `src/firebase/config.js` (values)
- Firestore / RTDB paths & document field names; `blokly-prefs-v3` shape
- `vite.config.js`, deploy base path, `index.html` asset paths, routing mode
- XP/level/badge thresholds & formulas (`src/data/levels.js`, `badges.js`)
- `package.json` dependencies
- Any git history-altering or file-deleting command
