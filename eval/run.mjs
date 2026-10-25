// Scores keyword, embedding, hybrid (retrieval only) and the full hybrid pipeline on eval/queries.json.
//   node eval/run.mjs            -> deterministic demo-mode pipeline (rule-based understanding), no network
//   node eval/run.mjs --llm      -> also asks Claude (needs ANTHROPIC_API_KEY) to understand each query once, caches to eval/cache/
// Writes eval/results.json and eval/RESULTS.md. Nothing here is hand-edited.
import fs from "fs";
import path from "path";
import { loadIndex, readJSON, gradeProduct, ndcgAt, mean, ROOT } from "./lib.mjs";
import { keywordSearch, embeddingSearch, hybridRawSearch, search } from "../src/engine/search.js";
import { understand } from "../src/engine/understand.js";
import { llmUnderstand } from "../src/engine/llm.js";

const useLLM = process.argv.includes("--llm");
const cachePath = path.join(ROOT, "eval/cache/understanding.llm.json");
const { index, catalog } = loadIndex();
const spec = readJSON("eval/queries.json");
const queries = spec.queries;

let llmCache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};
if (useLLM) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { console.error("--llm needs ANTHROPIC_API_KEY in the environment"); process.exit(1); }
  const { fromLLM } = await import("../src/engine/llm.js");
  for (const q of queries) if (!llmCache[q.query]) { llmCache[q.query] = (await llmUnderstand(q.query, key)); }
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(llmCache, null, 1));
}

const METHODS = {
  keyword: (q) => keywordSearch(index, q.query, 10),
  embedding: (q) => embeddingSearch(index, q.query, 10),
  hybrid_retrieval: (q) => hybridRawSearch(index, q.query, 10),
  hybrid_full: (q, u) => search(index, q.query, { k: 10, understanding: u }).results,
};
if (Object.keys(llmCache).length) METHODS.hybrid_full_llm = (q) => search(index, q.query, { k: 10, understanding: llmCache[q.query] }).results;

const rows = [];
for (const q of queries) {
  const u = understand(q.query, index.ctx);
  const row = { id: q.id, type: q.type, query: q.query, expect: q.expect || "results", asked: !!u.clarify, clarify: u.clarify, understanding: u, methods: {} };
  for (const [name, fn] of Object.entries(METHODS)) {
    const res = fn(q, u);
    const viol = {};
    for (const r of res) { const { violation } = gradeProduct(r.p, q); if (violation) viol[violation] = (viol[violation] || 0) + 1; }
    row.methods[name] = { ndcg: ndcgAt(res, q, catalog), n: res.length, violations: viol, top: res.slice(0, 5).map((r) => ({ name: r.p.name, category: r.p.category, price: r.p.price, grade: gradeProduct(r.p, q).grade, violation: gradeProduct(r.p, q).violation })) };
  }
  rows.push(row);
}

const f3 = (x) => (x == null ? "n/a" : x.toFixed(3));
const types = [...new Set(queries.map((q) => q.type))];
const names = Object.keys(METHODS);

// NDCG: judged on the 42 queries where the right behaviour is to return results.
const answerable = rows.filter((r) => r.expect === "results");
const ndcgOf = (rs, m) => mean(rs.map((r) => r.methods[m].ndcg).filter((x) => x != null));
const overall = Object.fromEntries(names.map((m) => [m, ndcgOf(answerable, m)]));
const bySlice = {};
for (const t of types) bySlice[t] = Object.fromEntries(names.map((m) => [m, ndcgOf(rows.filter((r) => r.type === t), m)]));

const clarifyRows = rows.filter((r) => r.expect === "clarify");
const asked = rows.filter((r) => r.asked);
const clarify = {
  expected: clarifyRows.length,
  askedCorrectly: clarifyRows.filter((r) => r.asked).length,
  askedUnnecessarily: rows.filter((r) => r.asked && r.expect !== "clarify").map((r) => r.id),
  missed: clarifyRows.filter((r) => !r.asked).map((r) => r.id),
};
const sumViol = (m, rs) => { const o = {}; for (const r of rs) for (const [k, v] of Object.entries(r.methods[m].violations)) o[k] = (o[k] || 0) + v; return o; };
const violations = Object.fromEntries(names.map((m) => [m, sumViol(m, rows)]));
const zeroResult = Object.fromEntries(names.map((m) => [m, rows.filter((r) => r.methods[m].n === 0 && !(m === "hybrid_full" && r.asked)).length]));

// "hybrid_full" counts a clarifying question as a non-result; list queries where full pipeline < keyword.
const worse = answerable.filter((r) => (r.methods.hybrid_full.ndcg ?? 0) < (r.methods.keyword.ndcg ?? 0) - 1e-9).map((r) => r.id);
const failures = answerable.filter((r) => (r.methods.hybrid_full.ndcg ?? 1) < 0.7 || r.id && worse.includes(r.id));

const out = { generatedAt: new Date().toISOString(), mode: useLLM || Object.keys(llmCache).length ? "demo + cached LLM understanding" : "demo (deterministic rule-based understanding; no LLM calls)", catalog: { products: catalog.length, synthetic: catalog.filter((p) => p.synthetic).length }, k: 10, nQueries: queries.length, nAnswerable: answerable.length, overall, bySlice, clarify, violations, zeroResult, worseThanKeyword: worse, rows };
fs.writeFileSync(path.join(ROOT, "eval/results.json"), JSON.stringify(out, null, 1));

// ---------- markdown report ----------
const L = [];
L.push("# Eval results", "", `> **Synthetic catalog.** ${catalog.length} invented products and invented reviews; every number below is a measurement on that catalog, not on real shoppers or a real retailer.`, "", `Mode: **${out.mode}**. Generated by \`npm run eval\` on ${out.generatedAt.slice(0, 10)}. Labels: \`eval/queries.json\` (graded specs written for review).`, "");
L.push("## NDCG@10 (42 queries that should return results)", "", "| Method | NDCG@10 |", "|---|---|");
const label = { keyword: "Keyword (BM25, raw query)", embedding: "Embedding only (raw query)", hybrid_retrieval: "Hybrid retrieval only (keyword + embedding fused, raw query)", hybrid_full: "Full pipeline (understanding + constraints + hybrid + ranking)", hybrid_full_llm: "Full pipeline with cached Claude understanding" };
for (const m of names) L.push(`| ${label[m]} | ${f3(overall[m])} |`);
L.push("", "## NDCG@10 by query type", "", `| Type (n) | ${names.map((m) => label[m].split(" (")[0]).join(" | ")} |`, `|---|${names.map(() => "---").join("|")}|`);
for (const t of types) L.push(`| ${t} (${rows.filter((r) => r.type === t).length}) | ${names.map((m) => f3(bySlice[t][m])).join(" | ")} |`);
L.push("", "The `clarify` row scores the baselines only where gold labels exist; the full pipeline correctly returns a question instead of results there, so its NDCG is n/a or 0 by design.", "");
L.push("## Clarifying questions", "", `- Expected a question: ${clarify.expected}. Asked correctly: ${clarify.askedCorrectly}. Missed: ${clarify.missed.join(", ") || "none"}.`, `- Asked when it should have answered: ${clarify.askedUnnecessarily.join(", ") || "none"}.`, "");
L.push("## Constraint violations in the top 10 (judged against the gold spec)", "", "| Method | price | age | battery | allergen | small parts | excluded |", "|---|---|---|---|---|---|---|");
for (const m of names) { const v = violations[m]; L.push(`| ${label[m].split(" (")[0]} | ${v.price || 0} | ${v.age || 0} | ${v.battery || 0} | ${v.allergen || 0} | ${v.small_parts || 0} | ${v.excluded || 0} |`); }
L.push("", `Zero-result queries (of ${queries.length}): ${names.map((m) => `${label[m].split(" (")[0]} ${zeroResult[m]}`).join(", ")}.`, "");
L.push("## Failure gallery", "", "Queries where the full pipeline scored below 0.70 NDCG@10 or lost to plain keyword search. Grade shown per result: 0 = irrelevant or violates a constraint, 3 = ideal.", "");
for (const r of failures) {
  L.push(`### ${r.id} · ${r.type} · "${r.query}"`, "", `NDCG@10: keyword ${f3(r.methods.keyword.ndcg)}, embedding ${f3(r.methods.embedding.ndcg)}, full ${f3(r.methods.hybrid_full.ndcg)}. Understood as: recipient ${r.understanding.recipient ? r.understanding.recipient.label + ", age " + r.understanding.recipient.age : "none"}; interests ${r.understanding.interests.join(", ") || "none"}; budget ${r.understanding.budget ? JSON.stringify(r.understanding.budget) : "none"}.`, "");
  for (const m of ["keyword", "hybrid_full"]) { L.push(`- **${label[m].split(" (")[0]}** top 3: ${r.methods[m].top.slice(0, 3).map((t) => `${t.name} ($${t.price}, grade ${t.grade}${t.violation ? ", violates " + t.violation : ""})`).join("; ") || "(no results)"}`); }
  L.push("");
}
fs.writeFileSync(path.join(ROOT, "eval/RESULTS.md"), L.join("\n"));

console.log(`mode: ${out.mode}`);
console.log("NDCG@10 overall (42 answerable queries):"); for (const m of names) console.log(`  ${m.padEnd(18)} ${f3(overall[m])}`);
console.log("by type:"); for (const t of types) console.log(`  ${t.padEnd(11)}`, names.map((m) => `${m}=${f3(bySlice[t][m])}`).join("  "));
console.log("clarify:", JSON.stringify(clarify));
console.log("violations:", JSON.stringify(violations));
console.log("zero results:", JSON.stringify(zeroResult));
console.log("failures listed:", failures.map((r) => r.id).join(", "));
