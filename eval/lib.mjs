// Shared helpers: load the engine in Node, grade products against a query spec, score rankings.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadVectorTable } from "../src/engine/vectors.js";
import { buildIndex } from "../src/engine/search.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

export function loadIndex() {
  const catalog = readJSON("data/catalog.json");
  const table = loadVectorTable(readJSON("public/vectors.json"));
  return { index: buildIndex(catalog, table), catalog };
}

/** Returns {grade, violation|null}. Violations are judged against the GOLD spec, not the parser's output. */
export function gradeProduct(p, q) {
  const v = [];
  if (q.max_price != null && p.price > q.max_price) v.push("price");
  if (q.min_price != null && p.price < q.min_price) v.push("price");
  if (q.age != null && (p.age_min > q.age || (q.age < 3 && p.small_parts))) v.push("age");
  if (q.age != null && p.age_max < q.age) v.push("age_fit");
  if (q.no_battery && p.battery) v.push("battery");
  if (q.no_small_parts && p.small_parts) v.push("small_parts");
  if (q.allergen_free?.some((a) => p.allergens.includes(a))) v.push("allergen");
  if (q.exclude_categories?.includes(p.category)) v.push("excluded");
  if (q.exclude_name_words?.some((w) => p.name.toLowerCase().includes(w))) v.push("excluded");
  if (v.length) return { grade: 0, violation: v[0] };
  let g = q.grades?.[p.category] ?? 0;
  if (q.recipient_only && p.recipients.includes(q.recipient_only)) g = Math.max(g, 1);
  return { grade: g, violation: null };
}

export const gain = (g) => 2 ** g - 1;

export function ndcgAt(ranked, q, catalog, k = 10) {
  const all = catalog.map((p) => gradeProduct(p, q).grade).sort((a, b) => b - a);
  const ideal = all.slice(0, k).reduce((s, g, i) => s + gain(g) / Math.log2(i + 2), 0);
  if (ideal === 0) return null; // no labelled relevant items: skip
  const dcg = ranked.slice(0, k).reduce((s, r, i) => s + gain(gradeProduct(r.p, q).grade) / Math.log2(i + 2), 0);
  return dcg / ideal;
}

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
