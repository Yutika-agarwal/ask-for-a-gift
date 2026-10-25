// Turns a free-text gift request into a structured, editable "understanding".
// This is the deterministic (demo-mode) parser. src/engine/llm.js produces the
// same shape with Claude when the visitor brings their own API key.
import { normalize, tokenize, stem, editDistance, STOP } from "./text.js";

const RECIPIENTS = {
  mom: ["mom", "mum", "mother", "mama", "mommy", "stepmom"], dad: ["dad", "father", "papa", "daddy", "stepdad"],
  grandparent: ["grandma", "grandmother", "grandpa", "grandfather", "nana", "granny", "grandparent", "grandparents", "grandad", "nan"],
  partner: ["wife", "husband", "girlfriend", "boyfriend", "partner", "fiance", "fiancee", "spouse"],
  sister: ["sister", "sis"], brother: ["brother", "bro"], friend: ["friend", "buddy", "bff", "roommate"],
  teacher: ["teacher", "professor", "tutor", "mentor"], coworker: ["coworker", "colleague", "boss", "manager", "coworkers"],
  neighbor: ["neighbor", "neighbour"], baby: ["baby", "newborn", "infant"], toddler: ["toddler"],
  kid: ["kid", "kids", "child", "children", "son", "daughter", "nephew", "niece", "grandson", "granddaughter", "boy", "girl", "grandkid", "grandkids"],
  teen: ["teen", "teenager", "teens", "teenage"],
};
const DEFAULT_AGE = { baby: 0, toddler: 2, kid: 7, teen: 15, mom: 45, dad: 47, grandparent: 72, partner: 32, sister: 28, brother: 28, friend: 30, teacher: 40, coworker: 35, neighbor: 45 };
const RECIP_LOOKUP = new Map();
for (const [k, ws] of Object.entries(RECIPIENTS)) for (const w of ws) RECIP_LOOKUP.set(w, k);

const OCCASIONS = {
  birthday: ["birthday", "bday"], christmas: ["christmas", "xmas", "holiday", "holidays"], "mother's day": ["mothers"], "father's day": ["fathers"],
  wedding: ["wedding", "bridal"], anniversary: ["anniversary"], graduation: ["graduation", "graduate", "graduating"], housewarming: ["housewarming"],
  "thank you": ["thanks", "thankyou", "appreciation"], "baby shower": ["shower"], "get well": ["recovery", "surgery", "sick"], retirement: ["retirement", "retiring"],
  "valentine's day": ["valentines", "valentine"], "new year": [],
};
const OCC_LOOKUP = new Map();
for (const [k, ws] of Object.entries(OCCASIONS)) for (const w of ws) OCC_LOOKUP.set(w, k);

const ALLERGEN_WORDS = { nuts: ["nut", "nuts", "peanut", "peanuts", "almond", "almonds", "walnut", "walnuts", "cashew", "cashews"], gluten: ["gluten", "wheat", "celiac", "coeliac"], dairy: ["dairy", "lactose", "milk"], fragrance: ["fragrance", "scent", "scents", "scented", "perfume", "perfumes"] };
const ALLERGEN_LOOKUP = new Map();
for (const [k, ws] of Object.entries(ALLERGEN_WORDS)) for (const w of ws) ALLERGEN_LOOKUP.set(w, k);

// Words that, when negated, mean something other than "exclude this topic".
const BATTERY_WORDS = new Set(["battery", "batteries", "batterie", "electronic", "electronics", "electric", "rechargeable", "charging", "plug", "plugs"]);
// Negated word -> catalog terms to exclude (stems matched against name/category/interests/tags).
const EXCLUDE_SYNONYMS = { alcohol: ["cocktail", "wine", "bar", "alcohol"], booze: ["cocktail", "wine", "bar"], sweets: ["snack", "chocolate", "sweet"], candy: ["snack", "chocolate", "sweet"], sugar: ["snack", "chocolate", "sweet"], screens: ["screen", "gaming", "video"], screen: ["screen", "gaming", "video"], tech: ["tech", "gadget", "electronic"], gadgets: ["tech", "gadget"], clutter: ["decor", "home"], toys: ["toy", "plush", "building"], books: ["book", "reading", "novel"], candles: ["candle"], games: ["game", "gaming"], violence: ["gaming"] };

const NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };

function numWordsToDigits(s) {
  return s.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)(?=[ -]?(?:year|yr|yo\b))/g, (m) => NUM_WORDS[m]);
}

/** Vocabulary used for spelling correction: stems of everything searchable plus parser words. */
export function buildSpellVocab(catalog, extra = []) {
  const stemSet = new Set();
  const words = new Map(); // word -> weight
  const add = (w, wt = 1) => { if (w.length > 2) words.set(w, (words.get(w) || 0) + wt); };
  for (const p of catalog) {
    for (const t of tokenize(p.name)) add(t, 3);
    for (const i of p.interests) for (const t of tokenize(i)) add(t, 4);
    for (const t of p.tags) for (const x of tokenize(t)) add(x, 1);
    for (const t of tokenize(p.description)) add(t, 0.2);
  }
  for (const w of extra) add(w, 0.5);
  for (const w of [...RECIP_LOOKUP.keys(), ...OCC_LOOKUP.keys(), ...ALLERGEN_LOOKUP.keys(), ...BATTERY_WORDS]) add(w, 5);
  for (const w of words.keys()) stemSet.add(stem(w));
  words.stemSet = stemSet;
  return words;
}

function correctWord(w, vocab, known, ctx) {
  if (w.length < 4 || vocab.has(w) || known.has(w) || /\d/.test(w) || ctx.hasVector?.(w)) return null;
  if (ctx.stemSet?.has(stem(w))) return null;
  const max = w.length <= 5 ? 1 : 2;
  let best = null;
  for (const [cand, wt] of vocab) {
    if (Math.abs(cand.length - w.length) > max) continue;
    if (cand[0] !== w[0] && cand[1] !== w[1]) continue; // keep this cheap and precise
    const d = editDistance(w, cand, max);
    if (d > max) continue;
    const score = d * 10 - Math.log(1 + wt);
    if (!best || score < best.score) best = { cand, score, d };
  }
  return best ? best.cand : null;
}

function parseBudget(s) {
  let min = null, max = null, m;
  const money = "(?:[$€£]\\s*)?(\\d+(?:[.,]\\d+)?)";
  const unit = "(?:\\s*(?:dollars?|bucks?|usd|eur|euros?|pounds?|gbp|quid))?";
  if ((m = s.match(new RegExp(`(?:between\\s+)?${money}${unit}\\s*(?:-|–|to|and)\\s*[$€£]?\\s*(\\d+(?:[.,]\\d+)?)${unit}`))) && /[$€£]|dollar|buck|usd|between|budget|spend|price|eur|pound/.test(s)) {
    min = parseFloat(m[1]); max = parseFloat(m[2]);
    if (min > max) [min, max] = [max, min];
  } else if ((m = s.match(new RegExp(`(?:under|below|less than|up to|upto|max(?:imum)?(?: of)?|no more than|at most|within|not more than|cheaper than|budget(?: of| is)?|spend(?:ing)?(?: up to| around| about)?)\\s*(?:about|around)?\\s*${money}${unit}`)))) {
    max = parseFloat(m[1]);
  } else if ((m = s.match(new RegExp(`(?:over|above|more than|at least|minimum|min)\\s*${money}${unit}`)))) {
    min = parseFloat(m[1]);
  } else if ((m = s.match(new RegExp(`(?:around|about|roughly|approximately|~)\\s*${money}${unit}`)))) {
    const v = parseFloat(m[1]); min = Math.round(v * 0.6); max = Math.round(v * 1.25);
  } else if ((m = s.match(new RegExp(`[$€£]\\s*(\\d+(?:[.,]\\d+)?)`))) || (m = s.match(/(\d+(?:\.\d+)?)\s*(?:dollars?|bucks?|usd|euros?|pounds?)/))) {
    max = parseFloat(m[1]);
  } else if (/\b(cheap|inexpensive|budget[- ]friendly|affordable|low[- ]cost|stocking stuffer)\b/.test(s)) {
    max = 25;
  } else if (/\b(splurge|luxury|luxurious|high[- ]end|expensive|premium)\b/.test(s) && !/\bnot (?:too )?expensive\b/.test(s)) {
    min = 100;
  }
  return min == null && max == null ? null : { min, max };
}

function parseAge(s) {
  let m;
  s = numWordsToDigits(s);
  if ((m = s.match(/\b(\d{1,2})[ -]*(?:years?|yrs?)[ -]*old\b/)) || (m = s.match(/\b(\d{1,2})\s*yo\b/)) || (m = s.match(/\bage[sd]?\s*(\d{1,2})\b/)) || (m = s.match(/\bturning\s*(\d{1,2})\b/))) {
    const a = parseInt(m[1], 10);
    if (a >= 0 && a <= 110) return a;
  }
  if ((m = s.match(/\b(\d)\s*(?:months?|mos?)[ -]*old\b/))) return 0;
  return null;
}

/**
 * @returns {Understanding}
 *  { raw, recipient:{key,label,age,ageAssumed}|null, interests:string[], budget:{min,max}|null, occasion:string|null,
 *    constraints:{noBatteries:boolean, allergies:string[], allergySafe:boolean, exclude:string[]},
 *    corrections:{from,to}[], confidence:number, level:'high'|'medium'|'low', clarify:string|null, notes:string[] }
 */
export function understand(raw, ctx) {
  const vocab = ctx.spellVocab;
  ctx = { ...ctx, stemSet: vocab.stemSet };
  const notes = [];
  let s = numWordsToDigits(normalize(raw)).replace(/\s+/g, " ").trim();
  const corrections = [];

  // 1. spelling: correct unknown tokens against the catalog vocabulary
  const known = new Set([...STOP, "yo", "usd", "eur", "gbp", "bucks", "dollars", "years", "year", "old", "months", "yrs", "age", "aged", "free", "safe", "allergy", "allergic", "allergies", "less", "than", "under", "over", "between"]);
  s = s.split(" ").map((w) => {
    const bare = w.replace(/[^a-z]/g, "");
    if (!bare || bare !== w.replace(/[.,!?;:]+$/g, "")) return w;
    const fix = correctWord(bare, vocab, known, ctx);
    if (fix && fix !== bare) { corrections.push({ from: bare, to: fix }); return w.replace(bare, fix); }
    return w;
  }).join(" ");

  // 2. budget and age (numbers are consumed so they do not leak into interests)
  const budget = parseBudget(s);
  const age = parseAge(s);
  let rest = s
    .replace(/(?:between\s+)?[$€£]?\s*\d+(?:[.,]\d+)?\s*(?:dollars?|bucks?|usd|eur|euros?)?\s*(?:-|–|to|and)\s*[$€£]?\s*\d+(?:[.,]\d+)?\s*(?:dollars?|bucks?|usd|euros?)?/g, (m) => (/[$€£]|dollar|buck|usd|between/.test(m) ? " " : m))
    .replace(/(?:under|below|less than|up to|upto|maximum of|maximum|max|no more than|at most|within|not more than|cheaper than|over|above|more than|at least|minimum|around|about|roughly|budget of|budget is|budget|spend up to|spend around|spend)\s*[$€£]?\s*\d+(?:[.,]\d+)?\s*(?:dollars?|bucks?|usd|eur|euros?|pounds?)?/g, " ")
    .replace(/[$€£]\s*\d+(?:[.,]\d+)?|\d+(?:\.\d+)?\s*(?:dollars?|bucks?|usd|euros?|pounds?)/g, " ")
    .replace(/\b\d{1,2}[ -]*(?:years?|yrs?)[ -]*old\b|\b\d{1,2}\s*yo\b|\bage[sd]?\s*\d{1,2}\b|\bturning\s*\d{1,2}\b/g, " ")
    .replace(/\b(cheap|inexpensive|budget[- ]friendly|affordable|low[- ]cost|splurge|luxury|luxurious|high[- ]end|expensive|premium)\b/g, " ");

  // 3. constraints / negation
  const constraints = { noBatteries: false, noSmallParts: false, allergies: [], allergySafe: false, exclude: [] };
  const negMatches = [];
  const negRe = /\b(?:no|not|without|avoid|avoiding|nothing|never|non|zero|hates?|dislikes?|dislike|allergic to|allergy to|allergic|cannot have|can not have|can't have)\s+(?:any\s+|too\s+|a\s+|an\s+|the\s+|really\s+|big\s+)?([a-z][a-z ,'-]*?)(?=$|[.;!?]|\b(?:but|for|under|over|below|above|around|about|within|that|which|because|and also|since|and (?:she|he|they|loves?|likes?|enjoys?|is|are|wants?|has|who)|who|she|he|they|loves?|likes?|enjoys?|is|are|wants?)\b)/g;
  let nm;
  while ((nm = negRe.exec(rest))) {
    const lead = nm[0].split(/\s+/)[0];
    const phrase = nm[1].trim();
    // "not too expensive", "not a ..." phrases that are modifiers rather than topics
    if (/^(?:expensive|cheap|big|small|heavy|fancy|pricey|boring)\b/.test(phrase)) { negMatches.push(nm[0]); continue; }
    const parts = phrase.split(/\s*(?:,|\bor\b|\band\b|\bnor\b)\s*/).map((x) => x.trim()).filter(Boolean);
    for (const part of parts) {
      const words = part.split(" ").filter((w) => !STOP.has(w) || ALLERGEN_LOOKUP.has(w));
      const head = words[words.length - 1];
      if (!head) continue;
      const isAllergy = /allerg/.test(lead);
      const allergen = words.map((w) => ALLERGEN_LOOKUP.get(w)).find(Boolean);
      if (/^(?:parts|pieces|bits)$/.test(head) && /small|tiny|little/.test(part)) { constraints.noSmallParts = true; continue; }
      if (BATTERY_WORDS.has(head) || words.some((w) => BATTERY_WORDS.has(w))) constraints.noBatteries = true;
      else if (allergen && (isAllergy || /allerg|free/.test(rest)) ) constraints.allergies.push(allergen);
      else if (allergen) constraints.exclude.push(allergen);
      else constraints.exclude.push(...words.filter((w) => !["allergy", "allergies", "allergic"].includes(w)));
    }
    negMatches.push(nm[0]);
  }
  for (const m of negMatches) rest = rest.replace(m, " ");

  // "<x>-free", "<x> free", "<x> allergy"
  rest = rest.replace(/\b([a-z]+)[ -]free\b/g, (m, w) => {
    const a = ALLERGEN_LOOKUP.get(w);
    if (a) { constraints.allergies.push(a); return " "; }
    if (BATTERY_WORDS.has(w)) { constraints.noBatteries = true; return " "; }
    constraints.exclude.push(w); return " ";
  });
  rest = rest.replace(/\b([a-z]+)\s+allerg(?:y|ies|ic)\b/g, (m, w) => { const a = ALLERGEN_LOOKUP.get(w); if (a) { constraints.allergies.push(a); return " "; } return m; });
  if (/\ballergy[- ]?(?:safe|friendly)\b|\bhypoallergenic\b|\ballerg/.test(rest)) {
    if (!constraints.allergies.length) constraints.allergySafe = true;
    rest = rest.replace(/\ballergy[- ]?(?:safe|friendly)\b|\bhypoallergenic\b|\ballerg\w*\b/g, " ");
  }
  if (/\b(?:battery[- ]free|cordless|unplugged|analog|analogue|screen[- ]free|low[- ]tech)\b/.test(rest)) {
    if (/screen[- ]free/.test(rest)) constraints.exclude.push("screen");
    else constraints.noBatteries = true;
    rest = rest.replace(/\b(?:battery[- ]free|cordless|unplugged|analog|analogue|screen[- ]free|low[- ]tech)\b/g, " ");
  }
  constraints.allergies = [...new Set(constraints.allergies)];
  constraints.exclude = [...new Set(constraints.exclude.map((w) => w.trim()).filter((w) => w && !STOP.has(w)))];

  // 4. recipient, occasion, interests
  const toks = rest.split(/[^a-z']+/).filter(Boolean);
  let recKey = null, recWord = null, occasion = null;
  const interestToks = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!recKey && RECIP_LOOKUP.has(t)) { recKey = RECIP_LOOKUP.get(t); recWord = t; continue; }
    if (RECIP_LOOKUP.has(t)) continue;
    if (OCC_LOOKUP.has(t)) { occasion = occasion || OCC_LOOKUP.get(t); continue; }
    if ((t === "mother" || t === "father" || t === "mothers" || t === "fathers") && toks[i + 1] === "day") continue;
    if (t === "day" && /mother|father/.test(toks[i - 1] || "")) { occasion = toks[i - 1].startsWith("mother") ? "mother's day" : "father's day"; continue; }
    if (t === "thank" && toks[i + 1] === "you") { occasion = "thank you"; i++; continue; }
    if (t === "new" && toks[i + 1] === "year") { occasion = "new year"; i++; continue; }
    if (t === "baby" && toks[i + 1] === "shower") { occasion = "baby shower"; recKey = recKey === "baby" ? null : recKey; i++; continue; }
    if (STOP.has(t) || t.length < 3 || ["old", "year", "years", "yrs", "age", "aged", "new", "his", "her", "free", "safe", "allergy", "yet", "than", "own", "work", "works", "year", "lover", "lovers", "fan", "fans", "enthusiast", "person", "people", "obsessed", "hobby", "hobbies", "thank", "thanks", "into", "keen", "passionate", "play", "plays", "playing", "played", "make", "makes", "making", "use", "uses", "using", "wear", "wears", "collect", "collects"].includes(t)) continue;
    if (/^\d+$/.test(t)) continue;
    interestToks.push(t);
  }
  if (occasion === "thank you" && recKey === null && /\bteacher\b/.test(rest)) recKey = "teacher";
  // remove interests that are clearly the excluded terms
  const exStems = new Set(constraints.exclude.map(stem));
  const allInterests = [...new Set(interestToks.filter((t) => !exStems.has(stem(t))))];
  const interests = allInterests.filter((t) => vocab.has(t) || ctx.hasVector?.(t));
  const unknown = allInterests.filter((t) => !interests.includes(t));
  for (const t of unknown) notes.push(`I did not recognise "${t}", so I left it out.`);

  // recipient + age
  let recipient = null;
  if (recKey || age != null) {
    let key = recKey;
    let a = age, assumed = false;
    if (!key) key = a <= 1 ? "baby" : a <= 4 ? "toddler" : a <= 12 ? "kid" : a <= 19 ? "teen" : "friend";
    if (a == null) { a = DEFAULT_AGE[key] ?? 35; assumed = true; }
    if (age != null && recKey && ["mom", "dad", "grandparent", "friend", "partner", "sister", "brother", "coworker", "teacher", "neighbor"].includes(recKey) && age < 16) {
      key = age <= 12 ? "kid" : "teen";
    }
    recipient = { key, label: recWord ? recWord.replace(/^(mum|mama|mommy)$/, "mom") : key, age: a, ageAssumed: assumed };
  }
  if (recipient && recipient.ageAssumed && ["kid", "toddler", "teen", "baby"].includes(recipient.key)) notes.push(`No age given, assuming ${recipient.age}. Edit the age chip for a closer match.`);

  // 5. confidence + clarifying question
  const hasInterest = interests.length > 0;
  let confidence = 0.2 + (hasInterest ? 0.4 : 0) + (recipient ? 0.15 : 0) + (budget ? 0.1 : 0) + (occasion ? 0.05 : 0) + (constraints.noBatteries || constraints.allergies.length || constraints.exclude.length ? 0.05 : 0);
  if (corrections.length) confidence -= 0.05;
  if (recipient?.ageAssumed && ["kid", "toddler", "teen"].includes(recipient.key)) confidence -= 0.05;
  confidence = Math.max(0.05, Math.min(0.95, confidence));
  let clarify = null;
  if (!hasInterest) {
    const who = recipient ? `your ${recipient.label}` : null;
    clarify = unknown.length ? `I did not recognise "${unknown[0]}". What kind of thing ${who ? `is ${who}` : "are they"} into? For example cooking, hiking, music or reading.`
      : who ? `What is ${who} into? For example cooking, hiking, music or reading.` : "Who is the gift for, and what are they into?";
  }
  const level = clarify ? "low" : confidence >= 0.7 ? "high" : confidence >= 0.5 ? "medium" : "low";

  return { raw, recipient, interests, budget, occasion, constraints, corrections, confidence: +confidence.toFixed(2), level, clarify, notes };
}

export function describeUnderstanding(u) {
  const chips = [];
  if (u.recipient) chips.push({ kind: "recipient", label: u.recipient.label === u.recipient.key ? u.recipient.key : u.recipient.label });
  if (u.recipient) chips.push({ kind: "age", label: `age ${u.recipient.age}${u.recipient.ageAssumed ? " (assumed)" : ""}` });
  for (const i of u.interests) chips.push({ kind: "interest", label: i });
  if (u.budget) chips.push({ kind: "budget", label: u.budget.min != null && u.budget.max != null ? `$${u.budget.min}–$${u.budget.max}` : u.budget.max != null ? `under $${u.budget.max}` : `over $${u.budget.min}` });
  if (u.occasion) chips.push({ kind: "occasion", label: u.occasion });
  if (u.constraints.noBatteries) chips.push({ kind: "constraint", label: "no batteries" });
  if (u.constraints.noSmallParts) chips.push({ kind: "constraint", label: "no small parts" });
  for (const a of u.constraints.allergies) chips.push({ kind: "constraint", label: `${a}-free` });
  if (u.constraints.allergySafe) chips.push({ kind: "constraint", label: "allergy-safe" });
  for (const x of u.constraints.exclude) chips.push({ kind: "exclude", label: `not ${x}` });
  return chips;
}
