// Retrieval and ranking: keyword (BM25), embedding, and the hybrid pipeline
// with hard constraints and a transparent weighted score.
import { tokenize, stem, STOP } from "./text.js";
import { embed, cosine } from "./vectors.js";
import { understand, buildSpellVocab, EXCLUDE_SYNONYMS } from "./understand.js";

export const WEIGHTS = { relevance: 0.6, recipient: 0.15, quality: 0.15, occasion: 0.05, budget: 0.05 };
const FIELD_WEIGHT = { name: 3, category: 2, interests: 3, tags: 1, description: 1, recipients: 1, occasions: 1 };

function productFields(p) {
  return {
    name: p.name, category: p.category, interests: p.interests.join(" "), tags: p.tags.join(" "),
    description: p.description, recipients: p.recipients.join(" "), occasions: p.occasions.join(" "),
  };
}

export function buildIndex(catalog, table) {
  const docs = catalog.map((p) => {
    const f = productFields(p);
    const tf = new Map();
    let len = 0;
    for (const [field, text] of Object.entries(f)) {
      for (const t of tokenize(text)) {
        if (STOP.has(t)) continue;
        const st = stem(t);
        tf.set(st, (tf.get(st) || 0) + FIELD_WEIGHT[field]);
        len += FIELD_WEIGHT[field];
      }
    }
    const weights = new Map();
    for (const t of tokenize(p.name)) weights.set(t, 3);
    for (const t of tokenize(p.interests.join(" "))) weights.set(t, Math.max(weights.get(t) || 0, 2));
    const vec = embed(table, [...tokenize(p.name), ...tokenize(p.interests.join(" ")), ...tokenize(p.tags.join(" ")), ...tokenize(p.description)], weights);
    const stems = new Set([...tokenize(p.name), ...p.interests.flatMap(tokenize), ...p.tags.flatMap(tokenize), p.category].map(stem));
    return { p, tf, len, vec, stems };
  });
  const N = docs.length, df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const avgLen = docs.reduce((a, d) => a + d.len, 0) / N;
  const spellVocab = buildSpellVocab(catalog, table.words);
  const hasVector = (w) => table.index.has(w);
  return { docs, df, N, avgLen, table, spellVocab, ctx: { spellVocab, hasVector }, byId: new Map(catalog.map((p) => [p.id, p])) };
}

function bm25(index, doc, qStems) {
  const k1 = 1.2, b = 0.75;
  let s = 0;
  for (const t of qStems) {
    const f = doc.tf.get(t);
    if (!f) continue;
    const n = index.df.get(t) || 0;
    const idf = Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
    s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * doc.len) / index.avgLen)));
  }
  return s;
}

const queryStems = (text) => [...new Set(tokenize(text).filter((t) => !STOP.has(t) && t.length > 1).map(stem))];

/** The "old way": BM25 over the raw words, no spelling fix, no constraints. */
export function keywordSearch(index, text, k = 10) {
  const qs = queryStems(text);
  const scored = index.docs.map((d) => ({ p: d.p, score: bm25(index, d, qs) })).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || b.p.review_count - a.p.review_count);
  return scored.slice(0, k);
}

/** Embedding-only: cosine between mean word-vectors of the raw query and each product. */
export function embeddingSearch(index, text, k = 10) {
  const qv = embed(index.table, text);
  if (!qv) return [];
  const scored = index.docs.map((d) => ({ p: d.p, score: cosine(qv, d.vec) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

/** Hybrid retrieval only (no understanding, no constraints): fused keyword + embedding on the raw query. */
export function hybridRawSearch(index, text, k = 10) {
  const qs = queryStems(text);
  const qv = embed(index.table, text);
  const kw = index.docs.map((d) => bm25(index, d, qs));
  const em = index.docs.map((d) => (qv ? cosine(qv, d.vec) : 0));
  const kmax = Math.max(...kw) || 1;
  const eLo = Math.min(...em), eHi = Math.max(...em);
  const scored = index.docs.map((d, i) => ({ p: d.p, score: 0.5 * (kw[i] / kmax) + 0.5 * ((em[i] - eLo) / (eHi - eLo || 1)) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

// ---------- constraints ----------

function excludedBy(index, doc, u) {
  const terms = new Set();
  for (const w of u.constraints.exclude) {
    const syn = EXCLUDE_SYNONYMS[w];
    for (const x of syn || [w]) terms.add(stem(x));
  }
  for (const t of terms) if (doc.stems.has(t)) return t;
  return null;
}

/** Returns the first hard-constraint reason that rules the product out, or null. */
export function violation(index, doc, u) {
  const p = doc.p, c = u.constraints;
  if (u.budget?.max != null && p.price > u.budget.max) return { type: "budget", text: `costs $${p.price.toFixed(2)}, above your $${u.budget.max} limit` };
  if (u.budget?.min != null && p.price < u.budget.min) return { type: "budget", text: `costs $${p.price.toFixed(2)}, below your $${u.budget.min} minimum` };
  if (u.recipient) {
    const a = u.recipient.age;
    if (p.age_min > a) return { type: "age", text: `is for ages ${p.age_min}+ and the recipient is ${a}` };
    if (p.age_max < a) return { type: "age_fit", text: `is made for ages up to ${p.age_max}, and the recipient is ${a}` };
    if (a < 3 && p.small_parts) return { type: "age", text: "has small parts, a choking hazard under age 3" };
  }
  if (c.noBatteries && p.battery) return { type: "battery", text: "needs batteries or charging" };
  if (c.noSmallParts && p.small_parts) return { type: "small_parts", text: "has small parts" };
  for (const a of c.allergies) if (p.allergens.includes(a)) return { type: "allergy", text: `may contain ${a}` };
  if (c.allergySafe && p.allergens.length) return { type: "allergy", text: `may contain ${p.allergens.join(", ")}` };
  const ex = excludedBy(index, doc, u);
  if (ex) return { type: "excluded", text: `matches something you ruled out ("${ex}")` };
  return null;
}

// ---------- hybrid pipeline ----------

const RELATED_RECIPIENTS = { mom: ["grandparent", "friend", "sister", "teacher"], dad: ["grandparent", "friend", "brother"], grandparent: ["mom", "dad"], partner: ["friend"], sister: ["friend", "partner", "mom"], brother: ["friend", "dad", "partner"], friend: ["partner", "sister", "brother", "coworker"], coworker: ["friend", "teacher", "neighbor"], teacher: ["coworker"], neighbor: ["coworker", "friend"], kid: ["teen"], teen: ["kid", "friend"], baby: ["toddler"], toddler: ["baby", "kid"] };
const RECIPIENT_ALIASES = { kid: ["kid", "niece", "nephew", "child"], teen: ["teen", "graduate"], baby: ["baby"], toddler: ["toddler", "baby"] };

function recipientFit(p, u) {
  if (!u.recipient) return 0.5;
  const key = u.recipient.key;
  const mine = new Set([key, ...(RECIPIENT_ALIASES[key] || [])]);
  if (p.recipients.some((r) => mine.has(r))) return 1;
  if (p.recipients.some((r) => (RELATED_RECIPIENTS[key] || []).includes(r))) return 0.6;
  return 0.2;
}

export const bayesianRating = (p, m = 50, C = 4.0) => (p.review_count / (p.review_count + m)) * p.rating + (m / (p.review_count + m)) * C;

function budgetFit(p, u) {
  const max = u.budget?.max;
  if (max == null) return 0.5;
  return p.price >= 0.4 * max ? 1 : 0.6;
}

function retrievalQuery(u) {
  return [...u.interests].join(" ");
}

/**
 * Full product pipeline. `feedback` is {category: +1/-1 votes} from thumbs.
 * Returns {u, results, excludedCount, candidateCount}
 */
export function search(index, query, { k = 10, understanding = null, feedback = {}, perCategory = 3 } = {}) {
  const u = understanding || understand(query, index.ctx);
  if (u.clarify) return { u, results: [], excludedCount: 0, candidateCount: 0, needsClarification: true };

  const text = retrievalQuery(u);
  const qs = queryStems(text);
  const qv = embed(index.table, text);
  const cands = [];
  let excludedCount = 0;
  for (const d of index.docs) {
    if (violation(index, d, u)) { excludedCount++; continue; }
    cands.push(d);
  }
  const kw = cands.map((d) => bm25(index, d, qs));
  const em = cands.map((d) => (qv ? cosine(qv, d.vec) : 0));
  const kmax = Math.max(1e-9, ...kw);
  const ranked = cands.map((d, i) => {
    const kwN = kw[i] / kmax;
    const emN = Math.max(0, Math.min(1, (em[i] - 0.25) / 0.55));
    const rel = 0.5 * kwN + 0.5 * emN;
    const f = {
      relevance: rel,
      recipient: recipientFit(d.p, u),
      quality: Math.max(0, Math.min(1, (bayesianRating(d.p) - 3) / 2)),
      occasion: u.occasion ? (d.p.occasions.includes(u.occasion) ? 1 : 0) : 0.5,
      budget: budgetFit(d.p, u),
    };
    let score = 0;
    for (const key of Object.keys(WEIGHTS)) score += WEIGHTS[key] * f[key];
    const fb = feedback[d.p.category] || 0;
    const adj = Math.max(-0.2, Math.min(0.1, fb > 0 ? 0.04 * fb : 0.08 * fb));
    const matched = u.interests.filter((t) => d.stems.has(stem(t)));
    return { p: d.p, score: score + adj, matched, features: f, parts: { keyword: kwN, embedding: emN, cosine: em[i] }, weak: kw[i] === 0 && em[i] < 0.5, feedbackAdj: adj };
  });
  ranked.sort((a, b) => b.score - a.score || b.p.review_count - a.p.review_count);

  // diversity: at most `perCategory` per category in the page
  const out = [], per = {};
  for (const r of ranked) {
    if (out.length >= k) break;
    if ((per[r.p.category] = (per[r.p.category] || 0) + 1) > perCategory) continue;
    out.push(r);
  }
  out.forEach((r, i) => { r.rank = i + 1; r.reason = explain(r, u); });
  const weakAll = out.length > 0 && out.every((r) => r.weak);
  return { u, results: out, ranked, excludedCount, candidateCount: cands.length, needsClarification: false, weakAll };
}

// ---------- one-sentence explanations ----------

export function explain(r, u) {
  const p = r.p, f = r.features;
  const topic = u.interests.slice(0, 2).join(" + ");
  const bits = [];
  if (!topic) bits.push(`a ${p.category} pick`);
  else if (r.weak) bits.push(`only a loose guess for "${topic}" (${p.category})`);
  else if (r.matched.length && r.matched.length < u.interests.length) bits.push(`matches "${r.matched.join(" + ")}" (nothing here matches "${u.interests.filter((t) => !r.matched.includes(t)).join(" + ")}")`);
  else if (f.relevance >= 0.6) bits.push(r.matched.length ? `a direct match for "${topic}"` : `matches "${topic}" through ${p.category}`);
  else bits.push(`a looser match for "${topic}" (${p.category})`);
  if (u.recipient && f.recipient >= 1) bits.push(`suits ${u.recipient.label}`);
  if (u.budget?.max != null) bits.push(`$${p.price.toFixed(0)} is inside your $${u.budget.max} budget`);
  if (u.constraints.noBatteries) bits.push("needs no batteries");
  if (u.constraints.allergies.length) bits.push(`no ${u.constraints.allergies.join("/")} listed`);
  bits.push(`${p.rating.toFixed(1)}★ from ${p.review_count} reviews`);
  const s = bits.slice(0, 4).join("; ");
  return s[0].toUpperCase() + s.slice(1) + ".";
}

export function reviewQuote(p) {
  const r = p.reviews.find((x) => x.stars >= 4);
  return r ? r.text : null;
}

// ---------- "why not X?" ----------

export function whyNot(index, query, u, text, currentResults) {
  const t = tokenize(text).filter((x) => !STOP.has(x)).map(stem);
  if (!t.length) return { found: false, message: "Tell me a product or kind of gift to look up, for example \"espresso machine\"." };
  const matches = index.docs
    .map((d) => ({ d, hit: t.filter((x) => d.stems.has(x)).length }))
    .filter((x) => x.hit > 0)
    .sort((a, b) => b.hit - a.hit || b.d.p.review_count - a.d.p.review_count);
  if (!matches.length) return { found: false, message: `I could not find anything like "${text}" in this synthetic catalog.` };
  const top = matches[0].hit;
  const group = matches.filter((m) => m.hit === top);
  const full = search(index, query, { k: 600, understanding: u, perCategory: 600 });
  const rankOf = new Map((full.ranked || []).map((r, i) => [r.p.id, i + 1]));
  const reasons = new Map();
  let shown = 0, passed = 0;
  for (const { d } of group) {
    const v = violation(index, d, u);
    if (currentResults.some((r) => r.p.id === d.p.id)) { shown++; continue; }
    if (v) { const key = `${v.type}|${v.text.replace(/\$[\d.]+/g, "$")}`; if (!reasons.has(key)) reasons.set(key, { v, items: [] }); reasons.get(key).items.push(d.p); }
    else passed++;
  }
  const lines = [];
  for (const { v, items } of reasons.values()) lines.push(`${items.length === 1 ? items[0].name : items.length + " matching items"} ${v.text}.`);
  if (passed) {
    const best = group.filter(({ d }) => !violation(index, d, u)).map(({ d }) => ({ d, rank: rankOf.get(d.p.id) })).sort((a, b) => a.rank - b.rank)[0];
    lines.push(`${passed} matching item${passed > 1 ? "s" : ""} passed all your constraints but ranked lower; the best one, ${best.d.p.name}, is #${best.rank} of ${full.candidateCount}. It scored lower on relevance to what you asked for than the top picks.`);
  }
  if (shown && !lines.length) lines.push("It is already in your results.");
  return { found: true, label: group[0].d.p.name, lines, excluded: reasons.size > 0 };
}
