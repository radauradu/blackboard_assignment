# MealPrep decision log

## Product and interaction

- The budget range is €25-€150 in €5 increments.
- Each day has one primary meal and two optional alternatives.
- An alternative is generated on demand for its selected day, uses a different ingredient set from that day's primary, and displays a projected replacement cost.
- Dietary selections are cumulative. The nutritional goal is single-select.
- Pescatarian products are conservatively identified from vegetarian/vegan labels or the catalog's fish department/categories.
- Low-carbs means at most 10g carbohydrates/100g; low-salt means at most 0.3g salt/100g. Missing nutrition values do not qualify.

## LLM workflow

- The POC uses `gpt-5-mini` and English recipe text.
- Each generation builds a fresh randomized 120-product role-balanced menu after preference filtering: 30 proteins, 36 vegetables, 24 bases/sides, 18 supports, and 12 ready-meal candidates. Vegan protein capacity uses plant proteins rather than vegetables.
- A small low-reasoning Structured Outputs selector chooses seven global bundles from that menu before the two parallel recipe requests. Its 90-100% budget target is a preference; the local hard cap is authoritative and coherent lower-spend selections are accepted without retry.
- Candidate membership rotates across category, protein family, and price band. Each sampled menu reserves a randomized, locally validated recovery basket. If the selector fails, recovery uses that same sampled menu and never re-runs the old full-catalog selector.
- Selector diagnostics use stable failure codes and anonymous fingerprints for candidate and assignment sets. They never log product data, prompts, recipe text, or credentials.
- Selector SSE diagnostics distinguish incomplete, failed, refusal, stream, malformed-event, early-end, and invalid-JSON outcomes. Terminal diagnostics include only safe reason/code, HTTP status, and token totals so configuration changes follow evidence rather than guessing.
- A day has exactly one protein anchor, at least one base or vegetable, and at most one savory support. Bundles contain 2-4 products and must use a familiar pasta, grain-bowl, or protein-and-vegetables pattern.
- A conservative category allowlist admits savory proteins, bases, vegetables, supports, and recognized ready-meal cores. Ready meals are limited to soups, frozen pizzas, and composed salads, appear on at most two days, and are never mixed with a separate protein or base. Generic frozen items remain excluded.
- Regular selector days contain 3-5 products including one protein and a vegetable; ready-meal days contain a core plus 1-2 vegetables/supports. Recipe generation accepts the ready-meal template and keeps the core separate from its sides.
- Seafood cannot be combined with cheese or cream; no two protein anchors may share a day. Invalid, zero-price, non-EUR, duplicate-ID, and over-budget products are excluded.
- Coherence, classic pairing, distinct day bundles, and category variety take precedence over budget utilization. The weekly budget remains a hard cap, but there is no 90% minimum spend requirement.
- Pasta, rice, couscous, sauces, condiments, oils, vinegars, and spices count as one reusable weekly package. Proteins, vegetables, bread, ready meals, cheese, cream, and butter count once for every day used.
- Structured Outputs constrains the response shape, while local runtime validation remains authoritative for exact per-day product sets, alternatives, the weekly product union, optimized spend, and budget.
- Model output never determines catalog product names or prices; those values are restored locally by product ID.
- Weekly cost uses the package-use model. Alternatives may reuse products from another day but replace only their own day's primary contribution, so their projected replacement cost may exceed the selected budget.
- The locally validated day assignments are sent to OpenAI with their cooking template. There is no fallback that forces an incompatible product into a day; if seven distinct coherent bundles cannot be built, the flow reports no viable plan.
- Missing credentials, request failures, refusals, malformed output, and validation failures use a deterministic catalog-backed fallback built from the basket already selected for that generation.
- If no eligible catalog package fits the budget, the flow reports an error rather than violating the user's constraints.
- Initial generation is split into two concurrent Structured Outputs requests: days 0-3 and days 4-6. Each request receives only the optimized products assigned to its days and writes one primary recipe per day. Opening an alternative is request-free: the user explicitly presses Generate, and a successful alternative is cached in state; alternative failures show a retryable error.
- Candidate products use a positional tuple representation with a single shared column header. Brand is omitted, while quantity and department/category names remain for recipe context.
- LLM generation uses SSE for immediate stage feedback, but streamed JSON is never displayed or trusted until `response.completed` and local validation succeed.
- Recipe-writing requests use minimal reasoning, low verbosity, three or four concise recipe steps per meal, and a 6,000-token cap. The smaller ingredient selector uses low reasoning and a 30-second timeout.
- Streaming capability is selected before dispatch. An unreadable SSE response is not retried as a buffered request, ensuring normal orchestration never expands from two API calls to four.
- Development diagnostics contain only counts, byte sizes, lifecycle durations, HTTP status, output length, API token usage, result source, and sanitized failure reasons. Prompts, recipes, products, and credentials are deliberately excluded.
- Water, salt, black pepper, and olive oil are the only assumed pantry staples. They must be declared by the generated meal, appear visibly in its ingredient list, and do not add package cost.
- Recipe steps are not locally scanned against the full catalog; ingredient lists and assigned product IDs remain authoritative for cost and shopping.
- Generated ingredient quantities are structured numeric amount/unit values, then formatted for the UI. Product names cannot be placed in the quantity field.
- Prompt instructions require familiar savory lunch/dinner dishes and explicitly prohibit desserts, snack plates, sweet-and-savory fusion, and experimental pairings. Local bundle validation remains the primary recipe-quality guardrail.
- Selector ordering is normalized locally: valid day objects are sorted by day index and repeated product references are deduplicated before composition validation. Diagnostics record only normalization names plus safe validation code/path.
- Step product-ID metadata, rather than recipe prose, is the authoritative grounding mechanism. The UI presents exact catalog names in a `Uses:` line for every step. A title or instruction that names an unassigned catalog product/staple is replaced with neutral deterministic wording, while foreign IDs, missing coverage, and undeclared pantry metadata remain hard failures.
- A single foreign step reference may be normalized only when the same meal has exactly one otherwise-uncovered assigned product, making the replacement provable. Ambiguous foreign references remain hard failures; the recipe prompt repeats the same-day step-reference invariant.

## Grounded recipes and responsive selection

- Recipe steps are structured records (`instruction`, product IDs, pantry items), not free text. Local validation requires complete selected-product coverage and exposes authoritative catalog names to the UI.
- Step-level pantry metadata is authoritative; the displayed meal pantry list is derived from the union of pantry items actually used by its steps. This avoids an unenforceable cross-field equality requirement in Structured Outputs while retaining the exact four-item allowlist.
- Pantry is exact: water, salt, black pepper, and olive oil only. Catalog olive oil is excluded from selection because it is already available.
- Five products and two vegetables are preferred; a coherent 3-4 product meal is permitted only when filters or budget make the preferred composition unavailable.
- Nutritional filtering is role-aware for high-protein and balanced plans, preserving vegetables without weakening dietary constraints. Low-calorie, low-carb, and low-salt remain per-product rules.
- Product selection uses a role-indexed linear scan instead of enumerating anchor/companion pairs. Generation starts after navigation yields a frame, so the loading modal is visible before local work begins.

## Security and scope

- The standard OpenAI key is exposed through Expo configuration only because the assignment requires a client-only POC. A production app must proxy requests through a trusted server.
- Direct client-side SSE has the same key-exposure limitation as the buffered request; it is a POC-only transport choice.
- The key belongs only in the git-ignored `.env` file and must never be committed or logged.
- iOS is the target platform. Localization and final weekly-screen polish remain deferred.
