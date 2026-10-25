# Metrics

> Everything in this repo runs on a **synthetic catalog with no real traffic**. This file defines what I would measure in production and which of those are measured today. Nothing below is a real-world result unless it says "measured offline".

## North-star metric

**Successful-search rate**: the share of sessions that searched and then saved a gift or gave a thumbs-up to a result in the top 10, with no reformulation needed first.

Why this one: a gift search "works" when a person finds something they would act on. It rewards finding the right thing quickly and does not reward showing more results, more clicks or longer sessions.

## Input metrics

| Metric | Definition | Direction | Why it matters |
|---|---|---|---|
| Successful-search rate | sessions with `search_submitted` and (`wishlist_added` or `feedback_given` with vote = +1) / sessions with `search_submitted` | up | north star |
| Reformulation rate | searches that follow a previous search in the same session with a different query / all searches | down | people rephrase when the first answer missed |
| Add-to-wishlist rate | searches with at least one `wishlist_added` / searches | up | the strongest intent signal available in a demo |
| Zero-result rate | `results_shown` with `zero_results = true` / `results_shown` | down | the classic failure of keyword search |
| Clarification answer rate | `clarification_answered` / `results_shown` with `asked_clarifying_question` | up | tells me whether asking one question is accepted or abandoned |
| Chip-edit rate | `understanding_edited` / searches | watch | high means misunderstanding; moderate means the chips are useful |
| Why-not usage | `why_not_asked` / searches | watch | a trust feature; usage should be low but its answers should be correct |

## Guardrails (must not regress)

| Guardrail | Target | Measured offline today |
|---|---|---|
| Price-constraint violations in returned results | **0** | **0** across 12,900 returned items (`npm test`) |
| Unsafe-for-age suggestions | **0** | **0** across the same 12,900 items |
| Allergen violations (when the user states an allergy) | 0 | 0 |
| Battery violations (when the user says no batteries) | 0 | 0 |
| Thumbs-down rate on the top-3 results | not above control | not measured (no users) |
| p95 time to results | under 300 ms in demo mode | not formally measured |

How the zero is enforced: price, age, battery, small-parts, allergen and "avoid" constraints are **hard filters applied before ranking**, not soft score terms. The guardrail test also grades against the *gold* constraints from `eval/queries.json`, not against what the parser extracted, so a parsing miss would show up as a violation. (It did once: see the README's iteration log.)

Known blind spot: a guardrail can only be zero for constraints the system understood. If someone types a constraint the parser misses, the result can break it. The "Compare with plain keyword search" view and the editable chips exist to make that visible.

## Event schema

One flat JSON object per event, in-memory only in this demo (viewable in the page footer; nothing is sent anywhere).

| Field | Type | Notes |
|---|---|---|
| `event` | string | one of the names below |
| `ts` | ISO 8601 string | client time |
| `session_id` | string | random per page load, not linked to a person |
| `mode` | `demo` or `claude` | whether a bring-your-own key was used |

| `event` | Extra fields |
|---|---|
| `search_submitted` | `query_length` (int), `is_reformulation` (bool). The text itself is not logged. |
| `example_clicked` | `index` |
| `results_shown` | `result_count`, `zero_results`, `asked_clarifying_question`, `confidence` (`high`/`medium`/`low`), `weak` (bool, only loose matches) |
| `understanding_edited` | `what` (e.g. `remove_budget`, `add_interest`) |
| `clarification_answered` | none |
| `compare_toggled` | `on` |
| `why_not_asked` | `found` |
| `feedback_given` | `product_id`, `vote` (-1, 0, 1) |
| `wishlist_added` | `product_id` |
| `byok_enabled` | none |

Privacy by design: query text and API keys are never part of an event.
