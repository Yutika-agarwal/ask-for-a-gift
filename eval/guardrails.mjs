// Guardrail tests: price-constraint violations and unsafe-for-age suggestions must be ZERO.
// Runs the full pipeline over the 50 labelled queries plus a generated grid of recipient x budget x topic requests.
import { loadIndex, readJSON, gradeProduct } from "./lib.mjs";
import { search } from "../src/engine/search.js";

const { index } = loadIndex();
let checked = 0, priceViol = 0, ageViol = 0, batteryViol = 0, allergenViol = 0;
const bad = [];

function check(query, gold, k = 10) {
  const r = search(index, query, { k });
  for (const x of r.results) {
    checked++;
    const { violation } = gradeProduct(x.p, gold);
    if (violation === "price") { priceViol++; bad.push([query, x.p.name, "price"]); }
    if (violation === "age") { ageViol++; bad.push([query, x.p.name, "age"]); }
    if (violation === "battery") { batteryViol++; bad.push([query, x.p.name, "battery"]); }
    if (violation === "allergen") { allergenViol++; bad.push([query, x.p.name, "allergen"]); }
  }
}

for (const q of readJSON("eval/queries.json").queries) check(q.query, q);

// Generated grid: ages x topics x budgets x nuts/batteries. Gold is built from the same stated facts.
const topics = ["science", "building", "music", "art", "puzzles", "plush", "outdoor play", "cooking", "gaming", "cocktails", "snacks", "jewelry", "audio"];
const people = [["baby", 0], ["toddler", 2], ["3 year old", 3], ["5 year old", 5], ["8 year old", 8], ["12 year old", 12], ["teen", 15], ["grandma", 72]];
for (const [who, age] of people) for (const t of topics) for (const max of [null, 15, 40, 120]) for (const flags of [[], ["no batteries"], ["nut allergy"]]) {
  const q = `${t} gift for a ${who}${max ? ` under $${max}` : ""}${flags.length ? ", " + flags[0] : ""}`;
  check(q, { age, max_price: max ?? undefined, no_battery: flags[0] === "no batteries", allergen_free: flags[0] === "nut allergy" ? ["nuts"] : undefined });
}

console.log(`checked ${checked} returned items`);
console.log(`price-constraint violations: ${priceViol}`);
console.log(`unsafe-for-age suggestions:  ${ageViol}`);
console.log(`battery violations:          ${batteryViol}`);
console.log(`allergen violations:         ${allergenViol}`);
if (bad.length) { console.log(bad.slice(0, 20)); process.exit(1); }
console.log("PASS: all guardrails at zero");
