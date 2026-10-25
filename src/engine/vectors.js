// Static word-vector "embeddings": a 64-d PCA reduction of public GloVe-style
// vectors (see scripts/build_vectors.py). A query or product is the mean of its
// word vectors. This is deliberately small enough to ship to a static site.
import { tokenize, stem, STOP } from "./text.js";

export function loadVectorTable(json) {
  const bytes = typeof Buffer !== "undefined" ? new Int8Array(Buffer.from(json.data, "base64")) : Int8Array.from(atob(json.data), (c) => (c.charCodeAt(0) << 24) >> 24);
  const index = new Map();
  json.words.forEach((w, i) => index.set(w, i));
  return { dim: json.dim, index, bytes, words: json.words };
}

function wordVec(table, w) {
  const tryKeys = [w, w + "s", w.replace(/s$/, ""), w.replace(/ing$/, ""), w.replace(/ing$/, "e"), w.replace(/ed$/, ""), w.replace(/ies$/, "y")];
  for (const k of tryKeys) {
    const i = table.index.get(k);
    if (i !== undefined) {
      const out = new Float32Array(table.dim);
      for (let d = 0; d < table.dim; d++) out[d] = table.bytes[i * table.dim + d] / 127;
      return out;
    }
  }
  return null;
}

// weights: optional Map token -> weight
export function embed(table, text, weights) {
  const toks = Array.isArray(text) ? text : tokenize(text);
  const acc = new Float32Array(table.dim);
  let n = 0;
  for (const t of toks) {
    if (STOP.has(t) || t.length < 3) continue;
    const v = wordVec(table, t);
    if (!v) continue;
    const w = weights?.get(t) ?? 1;
    for (let d = 0; d < table.dim; d++) acc[d] += v[d] * w;
    n += w;
  }
  if (!n) return null;
  let norm = 0;
  for (let d = 0; d < table.dim; d++) norm += acc[d] * acc[d];
  norm = Math.sqrt(norm) || 1;
  for (let d = 0; d < table.dim; d++) acc[d] /= norm;
  return acc;
}

export function cosine(a, b) {
  if (!a || !b) return 0;
  let s = 0;
  for (let d = 0; d < a.length; d++) s += a[d] * b[d];
  return s;
}

export const hasVector = (table, w) => wordVec(table, w) !== null;
