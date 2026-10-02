/**
 * QCM import — turns text pasted from an external AI (ChatGPT, Gemini, …) or
 * written by hand into multiple-choice items { q, a, wrong }.
 * --------------------------------------------------------------------------
 * Pure and lenient: AIs rarely follow a format to the letter, so three shapes
 * are understood, in any language the labels below cover.
 *
 * 1. Labelled (the format our copyable prompt asks for):
 *      Q: question
 *      R: right answer          (also A:, Réponse:, Answer:, Correct:)
 *      F: wrong answer          (also W:, X:, Faux:, Wrong:, Incorrect:) ×3
 *
 * 2. Lettered options, the way AIs write a QCM on their own:
 *      1. question
 *      A) …   B) …   C) …   D) …        (also "A." or "A:")
 *      Réponse : B                      (or an option ending with ✓ / ✅ / * / (correct))
 *
 * 3. JSON: [{ q, a, wrong: [] }] — also question / answer / correct /
 *    distractors / incorrect, or { choices|options, correct: index|letter|text }.
 *
 * Markdown bold, bullets and code fences are ignored. Items are returned as
 * found; the caller keeps only the valid ones (lib/mcq.js sanitizeMcqItem).
 */

const Q_LABEL = /^(?:q|question)\s*\d*\s*[:.)-]\s*/i;
const ANSWER_LABEL = /^(?:r|réponse|reponse|bonne réponse|bonne reponse|answer|correct answer|right answer|correct|solution|respuesta|antwort)\s*[:=]\s*/i;
const WRONG_LABEL = /^(?:f|w|x|faux|fausse|mauvaise réponse|mauvaise reponse|wrong|wrong answer|incorrect|distracteur|distractor|falsch|incorrecta)\s*\d*\s*[:=]\s*/i;
const OPTION = /^\(?([a-e])\s*[).:]\s*(.*)$/i;
const CORRECT_MARK = /\s*(?:✓|✔|✅|\*|\((?:correct|bonne réponse|bonne reponse|vrai|true)\))\s*$/i;
const NUMBERING = /^\d+\s*[.)]\s+/;

/** Removes markdown noise around a line: bullets, bold, headings, quotes. */
function cleanLine(line) {
  return line
    .replace(/\*\*|__/g, '')
    .replace(/^\s*(?:[-•>#]+\s*)+/, '')
    .trim();
}

/** Tries the JSON shape. Returns an array of raw items, or null if it is not JSON. */
function parseJson(raw) {
  const text = raw.replace(/```(?:json)?/gi, '').trim();
  if (!/^[[{]/.test(text)) return null;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const list = Array.isArray(data) ? data : data.items || data.questions || data.qcm || data.quiz || [];
  if (!Array.isArray(list)) return null;
  return list.map(entry => {
    const q = entry?.q ?? entry?.question ?? '';
    const choices = entry?.choices || entry?.options;
    if (Array.isArray(choices)) {
      let index = -1;
      const c = entry.correct ?? entry.answer ?? entry.a;
      if (Number.isInteger(c)) index = c;
      else if (typeof c === 'string' && /^[a-e]$/i.test(c.trim())) index = c.trim().toLowerCase().charCodeAt(0) - 97;
      else if (typeof c === 'string') index = choices.findIndex(x => String(x).trim().toLowerCase() === c.trim().toLowerCase());
      if (index < 0 || index >= choices.length) return { q, a: '', wrong: [] };
      return { q, a: choices[index], wrong: choices.filter((_, i) => i !== index) };
    }
    const a = entry?.a ?? entry?.answer ?? entry?.correct ?? '';
    const wrong = entry?.wrong ?? entry?.wrongs ?? entry?.distractors ?? entry?.incorrect ?? entry?.incorrect_answers ?? [];
    return { q, a: String(a), wrong: Array.isArray(wrong) ? wrong.map(String) : [] };
  });
}

/** Turns one gathered question block into a raw item. */
function finishBlock(block) {
  const letters = Object.keys(block.options);
  // Lettered options: several of them, or a lone "A:" read as an answer label.
  const lettered = letters.length >= 2;
  if (!lettered) {
    const a = block.answer ?? block.options.a ?? '';
    return { q: block.q, a, wrong: block.wrong };
  }
  let key = block.marked;
  if (!key && block.answer) {
    const m = block.answer.match(/^\(?([a-e])\b\s*[).:]?/i);
    if (m && block.options[m[1].toLowerCase()] !== undefined) key = m[1].toLowerCase();
    else key = letters.find(l => block.options[l].toLowerCase() === block.answer.toLowerCase());
  }
  if (!key) return { q: block.q, a: '', wrong: [] };
  return { q: block.q, a: block.options[key], wrong: [...letters.filter(l => l !== key).map(l => block.options[l]), ...block.wrong] };
}

/**
 * @param {string} raw  the pasted text
 * @returns {{ items: { q, a, wrong }[], blocks: number }}
 *   `blocks` = how many questions were seen, valid or not (to tell the
 *   student how many were skipped).
 */
export function parseMcqImport(raw) {
  const text = String(raw || '');
  const fromJson = parseJson(text);
  if (fromJson) return { items: fromJson, blocks: fromJson.length };

  const items = [];
  let block = null;
  const newBlock = q => ({ q, answer: null, wrong: [], options: {}, marked: null });
  const close = () => { if (block && block.q) items.push(finishBlock(block)); block = null; };
  const complete = b => b && (b.answer !== null || b.wrong.length > 0 || Object.keys(b.options).length > 0);

  for (const rawLine of text.split(/\r?\n/)) {
    const line = cleanLine(rawLine);
    if (!line || /^```/.test(line)) continue;

    if (Q_LABEL.test(line)) {
      close();
      block = newBlock(line.replace(Q_LABEL, '').trim());
      continue;
    }
    if (block && WRONG_LABEL.test(line)) { block.wrong.push(line.replace(WRONG_LABEL, '').trim()); continue; }
    if (block && ANSWER_LABEL.test(line)) { block.answer = line.replace(ANSWER_LABEL, '').trim(); continue; }
    const opt = block && line.match(OPTION);
    if (opt && opt[2]) {
      const letter = opt[1].toLowerCase();
      let value = opt[2].trim();
      if (CORRECT_MARK.test(value)) {
        value = value.replace(CORRECT_MARK, '').trim();
        block.marked = letter;
      }
      block.options[letter] = value;
      continue;
    }
    // A numbered line always opens a question; text gathered before it with
    // no answers at all was an introduction ("Here is your quiz:"), dropped.
    if (NUMBERING.test(line)) {
      if (complete(block)) close();
      block = newBlock(line.replace(NUMBERING, '').trim());
      continue;
    }
    // Free text: a new question once the current one has its answers,
    // otherwise the continuation of the question.
    if (!block || complete(block)) {
      close();
      block = newBlock(line.replace(NUMBERING, '').trim());
    } else {
      block.q = `${block.q} ${line}`.trim();
    }
  }
  close();
  return { items, blocks: items.length };
}
