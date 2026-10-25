import "./style.css";
import catalog from "../data/catalog.json";
import { loadVectorTable } from "./engine/vectors.js";
import { buildIndex, search, keywordSearch, whyNot, checkProduct, reviewQuote, WEIGHTS } from "./engine/search.js";
import { understand, describeUnderstanding } from "./engine/understand.js";
import { llmUnderstand, LLM_MODEL } from "./engine/llm.js";

const EXAMPLES = [
  "gift for my dad who loves hiking, under $50",
  "something for my 8 year old niece who likes science, no batteries",
  "birthday present for mom, she is allergic to nuts and loves baking",
  "gardning gift for grandma",
  "cozy gift for a friend, nothing with candles, around $30",
  "something nice for my mom",
];

const state = {
  ready: false, index: null, query: "", u: null, run: null, loading: false, error: null,
  compare: false, votes: {}, feedback: {}, wish: new Set(), whyNot: null, toast: "", searches: 0,
  apiKey: "", mode: "demo", events: [], sessionId: Math.random().toString(36).slice(2, 10),
};

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => `$${n.toFixed(2)}`;

function track(name, props = {}) {
  const e = { event: name, ts: new Date().toISOString(), session_id: state.sessionId, mode: state.mode, ...props };
  state.events.push(e);
  if (location.search.includes("debug")) console.log("[event]", e);
}

function toast(msg) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast"; el.setAttribute("role", "status"); el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.remove(), 2600);
}

// ---------- data ----------
async function init() {
  render();
  const res = await fetch(`${import.meta.env.BASE_URL}vectors.json`);
  const table = loadVectorTable(await res.json());
  state.index = buildIndex(catalog, table);
  state.ready = true;
  const q = new URLSearchParams(location.search).get("q");
  render();
  if (q) runQuery(q);
}

// ---------- search flow ----------
async function runQuery(q, { isReformulation } = {}) {
  q = q.trim();
  if (!q || !state.ready) return;
  const reform = state.searches > 0 && q !== state.query;
  state.query = q; state.searches++; state.loading = true; state.error = null; state.whyNot = null;
  track("search_submitted", { query_length: q.length, is_reformulation: reform });
  render();
  let u;
  if (state.mode === "claude" && state.apiKey) {
    try { u = await llmUnderstand(q, state.apiKey); }
    catch (e) { state.error = `${e.message} Showing demo-mode understanding instead.`; u = understand(q, state.index.ctx); }
  } else {
    await new Promise((r) => setTimeout(r, 120)); // brief, so the loading state is visible and announced
    u = understand(q, state.index.ctx);
  }
  state.u = u;
  state.loading = false;
  execute();
}

function execute() {
  state.run = search(state.index, state.u.raw, { k: 10, understanding: state.u, feedback: state.feedback });
  const r = state.run;
  track("results_shown", { result_count: r.results.length, zero_results: !r.needsClarification && r.results.length === 0, asked_clarifying_question: !!r.needsClarification, confidence: state.u.level, weak: !!r.weakAll });
  render();
}

function editUnderstanding(mutator, what) {
  mutator(state.u);
  state.u.clarify = null;
  track("understanding_edited", { what });
  execute();
}

// ---------- rendering ----------
function render() {
  const app = $("#app");
  const keep = document.activeElement?.id;
  app.innerHTML = `
    <div class="wrap">
      <header class="top">
        <div class="brand"><span aria-hidden="true">🎁</span> Ask for a Gift</div>
        <span class="pill ${state.mode === "claude" ? "live" : ""}" id="modepill">${state.mode === "claude" ? `Claude mode · ${esc(LLM_MODEL)}` : "Demo mode · runs in your browser"}</span>
      </header>
      <main>
        <h1>Describe who it's for. We'll figure out the rest.</h1>
        <p class="sub">No keywords needed. Say who it's for, what they like, and anything to avoid, like <em>"no batteries"</em> or <em>"allergic to nuts"</em>. You can fix anything we misunderstood.</p>
        <form class="searchbox" role="search" id="searchform">
          <label class="sr" for="q">Describe the gift you need</label>
          <input id="q" type="search" autocomplete="off" placeholder="e.g. gift for my dad who loves hiking, under $50" value="${esc(state.query)}" ${state.ready ? "" : "disabled"} />
          <button class="btn" type="submit" ${state.ready && !state.loading ? "" : "disabled"}>${state.loading ? "Thinking…" : "Find gifts"}</button>
        </form>
        <div class="examples" aria-label="Example requests">${EXAMPLES.map((e, i) => `<button class="ex" data-ex="${i}">${esc(e)}</button>`).join("")}</div>
        ${privacyBlock()}
        <div id="results" tabindex="-1" aria-live="polite">${resultsBlock()}</div>
      </main>
      <footer>
        <p><strong>This is a demo on a synthetic catalog.</strong> All ${catalog.length} products, prices, ratings and reviews are invented by a script (<a href="https://github.com/Yutika-agarwal/ask-for-a-gift/blob/main/scripts/gen_catalog.py">scripts/gen_catalog.py</a>); nothing here is for sale and no real people's data is used. See the <a href="https://github.com/Yutika-agarwal/ask-for-a-gift#readme">README</a> for the design, the eval, and its limits.</p>
        <details><summary>Session event log (${state.events.length})</summary><pre class="log">${esc(state.events.slice(-30).map((e) => JSON.stringify(e)).join("\n") || "No events yet.")}</pre></details>
      </footer>
    </div>
    `;
  bind();
  if (keep) { const el = document.getElementById(keep); if (el && keep !== "q") el.focus?.(); }
}

function privacyBlock() {
  return `<div class="privacy">
    <span aria-hidden="true">🔒</span> <strong>Privacy:</strong> in demo mode your text never leaves this page. The search runs in your browser.
    <details ${state.mode === "claude" ? "open" : ""}><summary>Optional: use your own Anthropic API key</summary>
      <p>With a key, <em>only the sentence you type</em> is sent, directly from your browser to <code>api.anthropic.com</code> so Claude (${esc(LLM_MODEL)}) can read it. Your key stays in this page's memory: it isn't saved, isn't sent to any server of ours (there isn't one), and disappears when you close or reload the tab. Anthropic's terms apply to what you send. Use a key with a low spending limit.</p>
      <div class="keyrow">
        <label class="sr" for="apikey">Anthropic API key</label>
        <input id="apikey" type="password" autocomplete="off" placeholder="sk-ant-…" value="${esc(state.apiKey)}" />
        <button class="btn small" id="usekey" type="button">${state.mode === "claude" ? "Update key" : "Use my key"}</button>
        ${state.mode === "claude" ? `<button class="btn small ghost" id="dropkey" type="button">Back to demo mode</button>` : ""}
      </div>
    </details>
  </div>`;
}

function resultsBlock() {
  if (!state.ready) return `<div class="skeleton" style="margin-top:24px"></div>`;
  if (state.loading) return `<div style="margin-top:24px;display:grid;gap:12px"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>`;
  if (!state.u) return `<div class="card empty" style="margin-top:24px"><strong>Try one of the examples above</strong>or type your own. Mention who it's for, what they enjoy, a budget, or things to avoid.</div>`;
  const u = state.u, r = state.run;
  let h = `<section class="card understood" aria-labelledby="uh"><h2 id="uh">Here's what I understood <small style="font-weight:400;color:var(--muted)">(tap × to remove, or add your own)</small></h2>`;
  if (state.error) h += `<div class="note err" role="alert">${esc(state.error)}</div>`;
  h += `<div class="chips">${chipsHTML(u)}${addChipHTML()}</div>`;
  h += `<div class="meta"><span class="conf ${u.level}" title="How sure the parser is. Low means it needs more information."><span>Confidence: <strong>${u.level}</strong></span><span class="bar" aria-hidden="true"><i style="width:${Math.round(u.confidence * 100)}%"></i></span></span>`;
  if (u.corrections.length) h += `<span>Showing results for ${u.corrections.map((c) => `<strong>${esc(c.to)}</strong> <span>(you typed “${esc(c.from)}”)</span>`).join(", ")}</span>`;
  h += `</div>`;
  for (const n of u.notes || []) h += `<div class="note">${esc(n)}</div>`;
  h += `</section>`;

  if (r.needsClarification) {
    h += `<section class="card clarify" aria-labelledby="ch"><h2 id="ch" class="section-title">I need one more detail</h2><p style="margin:0">${esc(u.clarify)}</p>
      <form id="clarifyform"><label class="sr" for="clarifyin">Your answer</label><input id="clarifyin" placeholder="e.g. loves gardening" /><button class="btn small" type="submit">Continue</button></form>
      <p class="privacy">I'd rather ask than guess and show you ten wrong gifts.</p></section>`;
    return h;
  }

  const shown = r.results;
  h += `<div class="toolbar"><div><span class="section-title">${shown.length} ideas</span> <span class="pill">${r.excludedCount} of ${catalog.length} ruled out by your constraints</span></div>
    <label class="toggle"><input type="checkbox" id="compare" ${state.compare ? "checked" : ""} /> Compare with plain keyword search</label></div>`;
  h += `<form class="whynot" id="whynotform"><label class="sr" for="whynotin">Ask why something is not in the list</label><input id="whynotin" placeholder="Why not… e.g. espresso machine" /><button class="btn small ghost" type="submit">Why not?</button></form><div style="height:12px"></div>`;
  if (state.whyNot) h += whyNotHTML(state.whyNot);
  if (r.weakAll) h += `<div class="note" role="status"><strong>Not enough to go on.</strong> Nothing in this catalog matches that well, so these are just the closest guesses. Try another word for what they like.</div><div style="height:12px"></div>`;
  if (!shown.length) {
    h += `<div class="card empty"><strong>No gifts fit all of that</strong>${r.excludedCount} items were ruled out by your constraints. Remove a chip, such as the budget, to widen the search.</div>`;
  } else {
    h += `<div class="cols ${state.compare ? "two" : ""}"><div><p class="colhead">${state.compare ? `This product <small>understands the request</small>` : ""}</p><ol class="results">${shown.map((x) => itemHTML(x)).join("")}</ol></div>`;
    if (state.compare) h += `<div><p class="colhead">Plain keyword search <small>the old way</small></p>${keywordColumn()}</div>`;
    h += `</div>`;
  }
  if (state.wish.size) h += `<section class="card wish" aria-label="Wishlist"><h2 class="section-title">Wishlist (${state.wish.size})</h2><ul>${[...state.wish].map((id) => { const p = state.index.byId.get(id); return `<li>${esc(p.name)} · ${money(p.price)}</li>`; }).join("")}</ul></section>`;
  return h;
}

function chipsHTML(u) {
  const chips = describeUnderstanding(u);
  if (!chips.length) return `<span style="color:var(--muted)">Nothing recognised yet.</span>`;
  return chips.map((c, i) => `<span class="chip ${c.kind}"><span class="k">${esc(c.kind === "exclude" ? "avoid" : c.kind)}</span> ${esc(c.label)}<button data-chip="${i}" aria-label="Remove ${esc(c.label)}">×</button></span>`).join("");
}

function addChipHTML() {
  return `<form class="addchip" id="addchip"><label class="sr" for="addkind">Add a detail</label>
    <select id="addkind"><option value="interest">+ interest</option><option value="budget">+ max budget ($)</option><option value="age">+ age</option><option value="exclude">+ avoid</option><option value="batteries">no batteries</option></select>
    <input id="addval" placeholder="value" aria-label="Value" /><button class="btn small ghost" type="submit">Add</button></form>`;
}

function stars(p) {
  return `<span class="stars" aria-label="${p.rating} out of 5 from ${p.review_count} synthetic reviews">${"★".repeat(Math.round(p.rating))}${"☆".repeat(5 - Math.round(p.rating))} <span>${p.rating.toFixed(1)} (${p.review_count})</span></span>`;
}

function itemHTML(x) {
  const p = x.p, v = state.votes[p.id] || 0, w = state.wish.has(p.id);
  const q = reviewQuote(p);
  const f = x.features;
  const bar = (label, val, wt) => `<span>${label} <small>×${wt}</small></span><span class="b"><i style="width:${Math.round(val * 100)}%"></i></span><span>${val.toFixed(2)}</span>`;
  return `<li class="card item"><div class="rank" aria-hidden="true">${x.rank}</div><div>
    <div class="row"><h3>${esc(p.name)}</h3><span class="price">${money(p.price)}</span></div>
    <div>${stars(p)}</div>
    <p class="reason">${esc(x.reason)}</p>
    ${x.weak ? `<div class="badges"><span class="badge warn">Loose match</span></div>` : ""}
    ${q ? `<p class="quote">“${esc(q)}” <small>(synthetic review)</small></p>` : ""}
    <div class="actions">
      <button class="iconbtn" data-up="${p.id}" aria-pressed="${v === 1}" aria-label="Good suggestion: ${esc(p.name)}">👍${v === 1 ? " Liked" : ""}</button>
      <button class="iconbtn" data-down="${p.id}" aria-pressed="${v === -1}" aria-label="Bad suggestion: ${esc(p.name)}">👎${v === -1 ? " Not for them" : ""}</button>
      <button class="iconbtn" data-wish="${p.id}" aria-pressed="${w}">${w ? "♥ Saved" : "♡ Save"}</button>
    </div>
    <details class="how"><summary>How this was scored (${x.score.toFixed(2)})</summary><div class="scorebars">
      ${bar("Relevance", f.relevance, WEIGHTS.relevance)}${bar("Suits recipient", f.recipient, WEIGHTS.recipient)}${bar("Review quality", f.quality, WEIGHTS.quality)}${bar("Occasion", f.occasion, WEIGHTS.occasion)}${bar("Budget fit", f.budget, WEIGHTS.budget)}</div>
      <p>Score = Σ weight × signal. Review quality is a Bayesian average, so a 5.0 from 3 reviews doesn't beat a 4.6 from 900.${x.feedbackAdj ? ` Your thumbs adjusted this by ${x.feedbackAdj > 0 ? "+" : ""}${x.feedbackAdj.toFixed(2)}.` : ""}</p></details>
  </div></li>`;
}

function keywordColumn() {
  const u = state.u;
  const res = keywordSearch(state.index, state.query, 10);
  if (!res.length) return `<div class="card empty"><strong>0 results</strong>Plain keyword search finds nothing because it needs the exact words.</div>`;
  return `<ol class="results">${res.map((x, i) => {
    const bad = checkProduct(state.index, x.p, u);
    return `<li class="card item"><div class="rank" aria-hidden="true">${i + 1}</div><div><div class="row"><h3>${esc(x.p.name)}</h3><span class="price">${money(x.p.price)}</span></div><div>${stars(x.p)}</div>
      <div class="badges">${bad ? `<span class="badge bad">Breaks your request: ${esc(bad.text)}</span>` : `<span class="badge ok">Fits your constraints</span>`}</div></div></li>`;
  }).join("")}</ol>`;
}

function whyNotHTML(w) {
  if (!w.found) return `<div class="card answer" role="status"><strong>Why not?</strong><p style="margin:4px 0 0">${esc(w.message)}</p></div>`;
  return `<div class="card answer" role="status"><strong>Why not “${esc(w.query)}”?</strong><ul>${w.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>`;
}

// ---------- events ----------
function bind() {
  $("#searchform")?.addEventListener("submit", (e) => { e.preventDefault(); runQuery($("#q").value); });
  document.querySelectorAll("[data-ex]").forEach((b) => b.addEventListener("click", () => { track("example_clicked", { index: +b.dataset.ex }); runQuery(EXAMPLES[+b.dataset.ex]); }));
  $("#usekey")?.addEventListener("click", () => {
    const k = $("#apikey").value.trim();
    if (!k.startsWith("sk-ant-")) { state.error = "That doesn't look like an Anthropic API key (it should start with sk-ant-)."; state.u ||= null; toast(state.error); state.error = null; return; }
    state.apiKey = k; state.mode = "claude"; track("byok_enabled"); toast("Claude mode on. Your key stays in this tab only.");
  });
  $("#dropkey")?.addEventListener("click", () => { state.apiKey = ""; state.mode = "demo"; render(); });
  $("#compare")?.addEventListener("change", (e) => { state.compare = e.target.checked; track("compare_toggled", { on: state.compare }); render(); });
  document.querySelectorAll("[data-chip]").forEach((b) => b.addEventListener("click", () => removeChip(+b.dataset.chip)));
  $("#addchip")?.addEventListener("submit", (e) => { e.preventDefault(); addChip($("#addkind").value, $("#addval").value.trim()); });
  $("#clarifyform")?.addEventListener("submit", (e) => { e.preventDefault(); const a = $("#clarifyin").value.trim(); if (a) { track("clarification_answered"); runQuery(`${state.query} ${a}`.replace(/\s+/g, " ")); } });
  $("#whynotform")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const t = $("#whynotin").value.trim(); if (!t) return;
    state.whyNot = { ...whyNot(state.index, state.query, state.u, t, state.run.results), query: t };
    track("why_not_asked", { found: state.whyNot.found });
    render();
  });
  document.querySelectorAll("[data-up]").forEach((b) => b.addEventListener("click", () => vote(b.dataset.up, 1)));
  document.querySelectorAll("[data-down]").forEach((b) => b.addEventListener("click", () => vote(b.dataset.down, -1)));
  document.querySelectorAll("[data-wish]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.wish;
    if (state.wish.has(id)) state.wish.delete(id); else { state.wish.add(id); track("wishlist_added", { product_id: id }); }
    render();
  }));
}

function vote(id, v) {
  const p = state.index.byId.get(id);
  const cur = state.votes[id] || 0;
  state.votes[id] = cur === v ? 0 : v;
  state.feedback = {};
  for (const [pid, val] of Object.entries(state.votes)) { const cat = state.index.byId.get(pid).category; state.feedback[cat] = (state.feedback[cat] || 0) + val; }
  track("feedback_given", { product_id: id, vote: state.votes[id] });
  if (state.votes[id]) toast(v > 0 ? `Got it: showing more like ${p.category}.` : `Got it: showing fewer ${p.category} ideas.`);
  execute();
}

function removeChip(i) {
  const chips = describeUnderstanding(state.u);
  const c = chips[i];
  editUnderstanding((u) => {
    if (c.kind === "interest") u.interests = u.interests.filter((x) => x !== c.label);
    else if (c.kind === "budget") u.budget = null;
    else if (c.kind === "age" || c.kind === "recipient") { u.recipient = null; }
    else if (c.kind === "occasion") u.occasion = null;
    else if (c.kind === "exclude") u.constraints.exclude = u.constraints.exclude.filter((x) => `not ${x}` !== c.label);
    else if (c.label === "no batteries") u.constraints.noBatteries = false;
    else if (c.label === "no small parts") u.constraints.noSmallParts = false;
    else if (c.label === "allergy-safe") u.constraints.allergySafe = false;
    else if (c.label.endsWith("-free")) u.constraints.allergies = u.constraints.allergies.filter((a) => `${a}-free` !== c.label);
  }, `remove_${c.kind}`);
}

function addChip(kind, val) {
  if (kind !== "batteries" && !val) return;
  editUnderstanding((u) => {
    if (kind === "interest") u.interests = [...new Set([...u.interests, val.toLowerCase()])];
    else if (kind === "budget") { const n = parseFloat(val.replace(/[^0-9.]/g, "")); if (n > 0) u.budget = { min: u.budget?.min ?? null, max: n }; }
    else if (kind === "age") { const n = parseInt(val, 10); if (n >= 0 && n < 110) u.recipient = { key: n <= 1 ? "baby" : n <= 4 ? "toddler" : n <= 12 ? "kid" : n <= 19 ? "teen" : "friend", label: "recipient", age: n, ageAssumed: false }; }
    else if (kind === "exclude") u.constraints.exclude = [...new Set([...u.constraints.exclude, val.toLowerCase()])];
    else if (kind === "batteries") u.constraints.noBatteries = true;
  }, `add_${kind}`);
}

init();
