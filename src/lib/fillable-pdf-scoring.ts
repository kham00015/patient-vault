/**
 * Auto-score helpers for NCCC scored fillable PDFs (CAT, ACT, Epworth, etc.).
 * Option fields: q{n}_opt_{score}  Item scores: q{n}_score  Total: total_score
 */

const OPT_RE = /^q(\d+)_opt_(\d+)$/;
const ITEM_SCORE_RE = /^q(\d+)_score$/;

export function isAutoScoreField(name: string) {
  return ITEM_SCORE_RE.test(name) || name === "total_score";
}

export function applyScoredCheckboxChange(
  values: Record<string, string | boolean>,
  fieldName: string,
  checked: boolean
): Record<string, string | boolean> {
  const match = OPT_RE.exec(fieldName);
  if (!match) {
    return { ...values, [fieldName]: checked };
  }

  const question = Number(match[1]);
  const score = Number(match[2]);
  const next: Record<string, string | boolean> = { ...values };

  // Radio behavior within the question row.
  for (const key of Object.keys(next)) {
    const m = OPT_RE.exec(key);
    if (m && Number(m[1]) === question) {
      next[key] = false;
    }
  }

  if (checked) {
    next[fieldName] = true;
    if (`q${question}_score` in next) {
      next[`q${question}_score`] = String(score);
    }
  } else {
    next[fieldName] = false;
    if (`q${question}_score` in next) {
      next[`q${question}_score`] = "";
    }
  }

  return applyTotalScore(next);
}

/** Sum selected option scores into total_score (and keep q*_score in sync). */
export function applyTotalScore(
  values: Record<string, string | boolean>
): Record<string, string | boolean> {
  if (!("total_score" in values)) return values;

  const selected = new Map<number, number>();
  for (const [key, value] of Object.entries(values)) {
    const m = OPT_RE.exec(key);
    if (!m || value !== true) continue;
    selected.set(Number(m[1]), Number(m[2]));
  }

  const next = { ...values };
  for (const [question, score] of selected) {
    const scoreKey = `q${question}_score`;
    if (scoreKey in next) next[scoreKey] = String(score);
  }

  if (selected.size === 0) {
    next.total_score = "";
    return next;
  }

  let total = 0;
  for (const score of selected.values()) total += score;
  next.total_score = String(total);
  return next;
}

/** True when this form uses qN_opt_* scoring options. */
export function formHasScoredOptions(values: Record<string, string | boolean>) {
  return Object.keys(values).some((k) => OPT_RE.test(k));
}
