# PRD: Ask for a Gift

**Status:** v0.1 demo on a synthetic catalog · **Owner:** Nimit · **Last updated:** 2026-10-25

## 1. Problem

People shopping for a gift for someone else usually do not know the product vocabulary. A parent buying for a niece, or a friend buying for a coworker, types "something for my dad who likes being outdoors, not too expensive" into a search box built for people who already know the word "trekking poles". Plain keyword search then (a) returns nothing, (b) returns things that break what they said ("no batteries" returns battery products, because the word "batteries" matches), or (c) shows a long list with no way to tell why anything is there. Gifts are also high-stakes in ways a normal purchase is not: an item that is unsafe for a toddler, over the stated budget, or triggers an allergy is worse than a missed sale.

## 2. Users

- **Primary:** a parent, relative or friend buying for someone else, who knows the person well but not the product category. Mobile first, one-minute attention span.
- **Not in scope for v0.1:** professional buyers, gift registries, group gifting.

## 3. Goals and non-goals

**Goals**
1. A person describes the gift in their own words and gets sensible, ranked ideas in under a minute.
2. The system shows what it understood and lets the person correct it.
3. It never suggests something that breaks a stated price, age-safety, battery or allergy constraint.
4. When the request is too vague or contradicts itself, it asks one question instead of guessing.
5. Every result has a one-sentence reason, and the person can ask why something is missing.

**Non-goals (v0.1):** real inventory, checkout, accounts, personalisation across sessions, images, multiple languages, shipping or availability.

## 4. Solution

| Step | What the person sees | What happens |
|---|---|---|
| 1. Ask | Search box with six example requests | Free text, no keywords needed |
| 2. Understand | Editable chips: recipient, age, interests, budget, occasion, "no batteries", "nut-free", "avoid …"; a confidence level; spelling fixes shown | Rule-based parser in demo mode; Claude (with the person's own key) if enabled |
| 3. Retrieve and rank | Ten ideas, each with a one-sentence reason, rating, a synthetic review quote, and a "how this was scored" breakdown | Hard filters first, then hybrid keyword + embedding relevance, then a transparent weighted score |
| 4. Compare | Toggle: "Compare with plain keyword search" | Shows the old way side by side, flagging results that break the request |
| 5. Give feedback | 👍 / 👎 / Save, and a "Why not …?" box | Thumbs re-rank by category in-session; why-not explains the exact rule that excluded an item |

**Ranking score** (all weights visible in the UI): relevance 0.60, suits the recipient 0.15, review quality 0.15 (Bayesian average so a 5.0 from 3 reviews does not beat 4.6 from 900), occasion 0.05, budget fit 0.05.

**Trust behaviours.** A visible confidence level. A "not enough to go on" state when only loose matches exist. One clarifying question for vague or contradictory requests ("gaming, but no screens"). Reviews are labelled synthetic. Privacy is stated in the page: demo mode sends nothing anywhere; with a bring-your-own key only the typed sentence goes from the browser to Anthropic.

## 5. Success metrics and guardrails

North star: **successful-search rate**. Inputs: reformulation rate, add-to-wishlist rate, zero-result rate. Guardrails: price-constraint violations = 0, unsafe-for-age suggestions = 0. Definitions and event schema: [metrics.md](metrics.md). Offline results: [eval/RESULTS.md](../eval/RESULTS.md).

## 6. Requirements (v0.1, all shipped)

- [x] Static site, zero setup, works offline from a fresh clone (`npm run dev`)
- [x] 600-product synthetic catalog, generated and documented as synthetic
- [x] Hybrid retrieval, transparent score, one-sentence explanations
- [x] Negation, budgets, misspellings, vague requests, contradictions
- [x] Compare toggle, thumbs, why-not
- [x] 50-query labelled eval with NDCG@10 by method and slice, and a failure gallery
- [x] Guardrail tests that fail the build on any violation
- [x] Loading, empty, error and low-confidence states; mobile layout; dark mode; keyboard focus styles

## 7. Risks and open questions

- **Synthetic data:** every quality number is on invented products. Real catalogs have messier titles, missing attributes and fewer clean constraint fields. The age and allergen guardrails depend on those fields existing and being right.
- **Parser coverage:** the rule-based parser handles the patterns I thought of. Real users will find others. The Claude path is built but **not evaluated** in this repo.
- **Popularity bias:** rating-weighted ranking favours already-popular items. Cold-start items need an exploration policy.
- **Open question:** should an unspecified child's age default to a typical age (current behaviour, shown as "assumed") or always ask? Assuming is faster; asking is safer. First experiment should test this.

## 8. First experiment

Run on real traffic once a real catalog exists. Control: current keyword search. Treatment: understanding chips + hybrid ranking + clarifying question. Primary metric: successful-search rate. Guardrails: violations remain 0, thumbs-down on top 3 not higher. As a planning assumption only, if baseline success were 20% and I wanted to detect +4 points, I would need about 1,600 sessions per arm (n ≈ 16·p(1−p)/d²). The real baseline is unknown and must be measured first.
