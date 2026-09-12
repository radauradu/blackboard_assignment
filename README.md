# MealPrep

An iPhone-first Expo and TypeScript proof of concept for catalog-backed weekly
meal planning.

## Local setup

1. Install dependencies with `npm install`.
2. Put your OpenAI API key in the git-ignored `.env` file as
   `OPENAI_API_KEY=your_key_here`.
3. Run `npm run ios` to start Expo for the iOS simulator.

The app filters the checked-in catalog from the user's preferences, then uses a
conservative savory-category allowlist to build a fresh randomized 120-product
menu before `gpt-5-mini` selects seven coherent day bundles. The menu targets
30 proteins, 36 vegetables, 24 bases/sides, 18 supports, and 12 ready meals.
Recognized soups, frozen pizzas, and composed salads may be ready-meal cores on
at most two days; generic frozen products remain excluded. Seafood
is never paired with dairy support, and no day receives multiple protein anchors.
The hard budget counts ordinary packages once per day of use; pasta, rice,
couscous, and shelf-stable savory supports count once across the week. Coherence and familiar
pairings take priority over spending close to the selected amount. A small global
selector uses low reasoning and targets 90-100% budget use without making it a hard minimum, then the week is split into two
concurrent requests: days 0-3 and days 4-6. Each request receives only the
products assigned to its days and produces primary recipes only. Unused products
remain available for on-demand alternatives with different ingredient sets.
Alternative tabs explain the option and only generate after the user presses
Generate; successful results are cached and may be regenerated after confirmation.
All product names and prices are resolved again from the
local catalog before the combined plan is accepted. If a valid-key request or
output is invalid, the app retries the same coherent bundles once before using
the deterministic template-aware fallback plan. A missing key goes directly to
that fallback.

Assigned products are serialized as one shared column header plus positional
product tuples (a request-scoped reference, `name`, `quantity`, price, department, and category).
Recipe quantities are validated numeric amount/unit values, so the full product
name always remains in the adjacent ingredient-name field.
Development builds write safe `[MealPlan diagnostic]` records to the Expo/Metro
console with filtered and selected-product counts, request bytes, lifecycle
timings, HTTP status, output size, token usage, primary attempt number, final
validation time, and fallback cause. The records never include the API key, prompt, recipe text, or
product names. Selector records additionally include anonymous candidate and
assignment fingerprints, its source, recovery reason, and whether local recovery
used the sampled menu or the complete filtered catalog.
Selector failures additionally report a sanitized terminal stream event, safe
reason/code, HTTP status, and token totals. They never log product data,
response text, prompts, or credentials.

The OpenAI request streams over Server-Sent Events so the week-plan loading view
can show generation stages immediately. The app still accepts a plan only after
the terminal response has been parsed and validated against the local catalog,
the exact preassigned day sets, selected spend, and original hard budget.
Recipes may additionally declare water, salt, black pepper, and olive oil for
their preparation, but these pantry staples are not shown as purchased
ingredients. Shopping cost still comes only from assigned catalog product IDs.
Requests use minimal reasoning, low verbosity, and three or four concise steps
per recipe.

Recipe steps are structured and product-linked. The app validates that every
purchased catalog product is used by at least one step and supplies the UI with
authoritative catalog names in a “Uses” line. Only water, salt, black pepper,
and olive oil are available from pantry. Olive oil catalog packages are not
selected because it is already a pantry staple.
The displayed pantry list is derived from the pantry metadata on recipe steps,
so it contains only allowed items that are actually used.

Selector responses are normalized before semantic validation: valid day indexes
may be sorted and repeated product references within one day may be deduplicated.
Missing/duplicate day indexes, invalid post-normalization meal composition, foreign
references, and budget violations still use the sampled local recovery basket.
Step product IDs are the source of truth for recipe grounding. The UI shows the
catalog-owned `Uses:` names below each instruction. If model prose happens to name
an unassigned catalog product or staple, the affected title or instruction is
replaced locally with neutral cooking guidance without changing its declared step
metadata; structural grounding violations remain rejected.
One foreign step reference is repaired only when there is exactly one missing
assigned product in that meal; all ambiguous foreign references remain rejected.

The selector samples membership across role, category, protein family, and price
band. Each sampled menu reserves a locally validated randomized recovery basket,
including cross-day package reuse at zero additional package cost. If selection
fails, recovery uses that reserved basket, so a selector failure does not
collapse the app back to one deterministic week. The
local selector indexes products once by role, price, category, and compatibility,
then builds seven skeletons and enriches them toward five products (protein,
base, two vegetables, support). This avoids the previous anchor-by-companion
Cartesian search. Generation is queued to the animation frame after navigation
so the loading modal paints before catalog selection starts.
Runtimes detected without streaming support make two buffered requests instead;
an unreadable SSE response is not retried, preventing hidden duplicate API
calls.

## Verification

- `npm run typecheck` checks the strict TypeScript contracts.
- `npm test` runs the catalog, flow-state, validation, API, and fallback tests.
- `npx expo export --platform ios` verifies the production iOS bundle.

The standard API key is loaded through Expo configuration only to satisfy this
client-side POC brief. A production application must proxy OpenAI requests
through a trusted server rather than embedding a standard API key in the app;
SSE does not change that security limitation.
