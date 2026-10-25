// Optional "bring your own key" path. The visitor's Anthropic API key is typed into the page,
// held in a JS variable (never localStorage, never a server) and sent only to api.anthropic.com
// from their own browser. Claude does the understanding and a short re-rank judgement;
// the retrieval, hard constraints and scoring stay deterministic and local.
import { describeUnderstanding } from "./understand.js";

export const LLM_MODEL = "claude-haiku-5-5";
const API = "https://api.anthropic.com/v1/messages";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["recipient_key", "recipient_label", "age", "interests", "budget_min", "budget_max", "occasion", "no_batteries", "no_small_parts", "allergies", "exclude", "clarifying_question"],
  properties: {
    recipient_key: { type: ["string", "null"], enum: ["mom", "dad", "grandparent", "partner", "sister", "brother", "friend", "teacher", "coworker", "neighbor", "baby", "toddler", "kid", "teen", null] },
    recipient_label: { type: ["string", "null"] },
    age: { type: ["integer", "null"] },
    interests: { type: "array", items: { type: "string" } },
    budget_min: { type: ["number", "null"] },
    budget_max: { type: ["number", "null"] },
    occasion: { type: ["string", "null"] },
    no_batteries: { type: "boolean" },
    no_small_parts: { type: "boolean" },
    allergies: { type: "array", items: { type: "string", enum: ["nuts", "gluten", "dairy", "fragrance"] } },
    exclude: { type: "array", items: { type: "string" } },
    clarifying_question: { type: ["string", "null"] },
  },
};

const SYSTEM = `You turn a gift request into structured fields for a gift search engine.
Rules:
- Fix obvious misspellings in interests (use the corrected word).
- interests: short noun phrases for hobbies/topics the recipient likes (e.g. "hiking", "espresso"). Never put things the user wants to AVOID here.
- Negations ("no batteries", "not a mug", "allergic to nuts") go in no_batteries / allergies / exclude, not interests.
- If the request names no interest at all, or contradicts itself (asks for X and rules X out), set clarifying_question to ONE short question and keep other fields as stated. Otherwise null.
- Do not guess an age, budget or interest the user did not state; use null.
- Output only the JSON object.`;

export async function llmUnderstand(raw, apiKey, { signal } = {}) {
  const res = await fetch(API, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: "user", content: raw }],
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error?.message || msg; } catch {}
    const err = new Error(res.status === 401 ? "That API key was rejected by Anthropic." : msg);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  if (data.stop_reason === "refusal") throw new Error("The model declined this request.");
  const text = data.content.find((b) => b.type === "text")?.text;
  return fromLLM(raw, JSON.parse(text));
}

const DEFAULT_AGE = { baby: 0, toddler: 2, kid: 7, teen: 15, mom: 45, dad: 47, grandparent: 72, partner: 32, sister: 28, brother: 28, friend: 30, teacher: 40, coworker: 35, neighbor: 45 };

export function fromLLM(raw, j) {
  const key = j.recipient_key;
  const recipient = key || j.age != null ? { key: key || (j.age <= 12 ? "kid" : j.age <= 19 ? "teen" : "friend"), label: j.recipient_label || key || "recipient", age: j.age ?? DEFAULT_AGE[key] ?? 30, ageAssumed: j.age == null } : null;
  const budget = j.budget_min != null || j.budget_max != null ? { min: j.budget_min, max: j.budget_max } : null;
  const u = {
    raw, recipient, interests: j.interests.map((s) => s.toLowerCase()), budget, occasion: j.occasion || null,
    constraints: { noBatteries: j.no_batteries, noSmallParts: j.no_small_parts, allergies: j.allergies, allergySafe: false, exclude: j.exclude.map((s) => s.toLowerCase()) },
    corrections: [], notes: ["Understood by Claude using your API key."],
    clarify: j.clarifying_question || (j.interests.length ? null : "What are they into?"),
  };
  u.confidence = u.clarify ? 0.2 : Math.min(0.95, 0.5 + (recipient ? 0.15 : 0) + (budget ? 0.1 : 0) + 0.2);
  u.level = u.clarify ? "low" : u.confidence >= 0.7 ? "high" : "medium";
  return u;
}

export { describeUnderstanding };
