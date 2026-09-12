# MealPrep iOS POC

## Summary

Build an iPhone-first Expo/TypeScript app with the five required screens, pixel-matched to the Figma design where specified. It will support Italian and English, use the local catalog for filtering and pricing, generate a seven-day plan with structured OpenAI output, and fall back to a deterministic local plan if generation is unavailable.

## Key changes

- Scaffold Expo, React Navigation native-stack, Zustand, Expo Font, and i18n; extract and load the Promo fonts and Esselunga bag asset.

- Recreate the Figma lander, budget, dietary, and goal screens; add a lander IT/EN switch, €25–€150 slider in €5 increments, multi-select dietary cards, and one required nutritional-goal selection.

- Add session-only flow state: language, budget, dietary restrictions, goal, generation state, and plan.

- Implement catalog filtering:

  - Vegetarian: vegetarian or vegan label; vegan: vegan label. Pescatarian: vegetarian or vegan label, or a fish classification. In the supplied catalog, fish is detected from `department.id === "pesce"` / `department.name === "Fish"` or `category.id` of `en:fishes` / `en:canned-fishes` (including their English names). This conservatively excludes unlabelled non-fish products because the catalog has no ingredient-level meat taxonomy.

  - Lactose-free: exclude `allergens[].id === "en:milk"`; gluten-free: exclude `allergens[].id === "en:gluten"`. The supplied JSON has no gluten-free label, so gluten-free means no declared gluten allergen in this POC, not a certification claim.

  - High-protein: ≥12g protein/100g; low-calorie: ≤150 kcal/100g; low-carbs: ≤10g `nutrition.carbohydrates100g` per 100g; low-salt: ≤0.3g `nutrition.salt100g` per 100g; balanced: Nutri-Score A/B with ≥5g protein/100g. Missing nutrition values never qualify.

  - Apply dietary filters cumulatively, then the selected goal. Pass the complete matching result to the LLM without a numbered cap or an additional quality gate; category-diverse limiting remains specific to the deterministic fallback.

- Define `WeeklyPlan`, `DayPlan`, `Meal`, and `Ingredient` types. Generate exactly seven day entries; each has one primary recipe and two alternative recipes, all with catalog product IDs, prep time, servings, package-price estimate, and English recipe steps. Localization of generated recipe text is deferred.

  - The primary recipe is the day's default meal. Its two alternatives are optional, on-demand recipes built from unused compatible products in the same session pool.

  - Require every alternative to differ from that day's primary product IDs; show its projected package-use weekly cost, which may exceed the selected budget.

- Build a fresh randomized 120-product, role-indexed menu after filtering: 30 proteins, 36 vegetables, 24 bases/sides, 18 supports, and 12 ready-meal candidates. Use a small low-reasoning `gpt-5-mini` Structured Outputs selector to choose seven globally coherent, under-budget ingredient bundles, then send those locally validated bundles to two concurrent recipe requests for days 0-3 and 4-6. The unused candidates remain available for on-demand alternatives. The selector targets 90-100% budget use but accepts coherent lower-spend plans without retry. Recognized ready meals may appear on at most two days as meal cores. All pricing, names, package totals, and the hard budget remain local. [OpenAI Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)

  - The selector uses low reasoning with a 30-second timeout. Every randomized menu reserves a coherent recovery basket before remaining candidates are filled; a timed-out or invalid selector therefore continues with sampled-menu ingredients rather than re-running the full-catalog selector. Ordinary products count once per day of use, while shelf-stable bases and supports use package pricing across the week.

  - Candidate membership rotates across category, protein family, and price band. If OpenAI selection fails, local recovery builds a coherent basket from that same randomized menu before considering the complete filtered catalog. Safe diagnostics record source, stable recovery code, and anonymous menu/assignment fingerprints so consecutive runs can be compared without exposing product data.

  - Selector output is normalized before semantic checks: valid days are sorted by `dayIndex`, and repeated references within a day are deduplicated. Missing/duplicate day indexes or a normalized meal that no longer satisfies composition, budget, or novelty rules still recover from the sampled basket. Diagnostics record only safe normalization names and code/path.

  - Regular selected days require 3-5 products including one protein and a vegetable. Ready-meal days require a ready core with one or two vegetables/supports, remain limited to two days, and are supported by initial and alternative recipe requests.

  - Primary meals are savory lunch/dinner dishes only. After dietary and nutritional filtering, a conservative category allowlist builds seven locally validated bundles: one protein anchor, a base or vegetable, and at most one savory support. Sweets, breakfast products, snacks, desserts, sweet dairy, supplements, soups, pizzas, generic frozen products, and uncategorized pantry items are excluded. Classic pairing rules reject multiple protein anchors and seafood with cheese or cream. Coherence is more important than reaching 90% of budget; the selected budget is always a hard ceiling.

- Read the key from a git-ignored `.env` through Expo configuration, never commit or log it, and document the unavoidable client-side-key exposure as a POC constraint. On missing key, network/API failure, invalid output, or budget violation, display a deterministic catalog-backed fallback plan.

- Build the weekly-plan screen with day navigation, a highlighted primary meal, two selectable “Try instead” alternative cards, ingredients, recipe steps, cost, and a visible fallback notice when applicable. Switching recipes changes the displayed recipe only; the weekly total remains fixed.

- Add `DECISIONS.md` recording deviations: iOS-only scope, €5 slider step, bilingual lander switch/device-locale default, one primary meal plus two on-demand different-product alternatives per day, filtering thresholds, package-price budget calculation, complete filtered LLM input, and offline fallback.

## Test plan

- Unit-test every dietary/nutrition filter, combined restrictions, role-indexed candidate selection, package-use budget calculation, language resolution, and fallback generation.

- Verify every day has one primary recipe and exactly two alternative slots; reject alternative outputs that overlap primary products or use invalid catalog products, while correctly calculating their projected replacement cost.

- Test malformed, out-of-filter, over-budget, and failed LLM responses fall back safely. Verify that both batches start concurrently, receive the complete filtered catalog result, and have budget shares that sum to the selected weekly budget.

- Verify diagnostics for buffered success, streamed lifecycle milestones, timeout/failure causes, request byte sizes, API token usage, final source, and validation duration. Diagnostics must not contain credentials or product/recipe text.

- Test the full iOS flow: language toggle, budget selection, dietary/goal selection, successful generated-plan rendering, day navigation, primary/alternative recipe switching without a total-cost change, and no-key fallback.

- Compare iPhone simulator screenshots of the four specified Figma screens against the design before handoff.

## Assumptions

- Primary meals now target five purchased products: one protein, a compatible base, two vegetables, and an optional savory support. The selector may drop the support and then the second vegetable only when the filtered catalog or budget requires it; three products and one vegetable remain the minimum.
- Recipe steps are structured with product IDs and pantry items. Every selected product must be referenced by a step, and only water, salt, black pepper, and olive oil may be declared as pantry items.

- Product-ID step metadata is authoritative for grounding and the week screen displays exact catalog names in a `Uses:` line below every instruction. Repairable prose that mentions an unassigned catalog product or staple is replaced locally with neutral template-aware wording; foreign IDs, missing product coverage, and unsupported pantry metadata remain failures.
- High-protein and balanced checks are role-aware: anchors retain their protein rule while suitable vegetables and companions can remain in the plan. Low-calorie, low-carb, and low-salt still apply to every product.

- Italian is selected for Italian device locales and English otherwise; the lander switch changes the session language.

- Budget is a hard weekly cap in EUR based on unique ingredient package prices from the seven primary meals; an optional alternative displays its separately projected replacement cost.

- Dietary choices are cumulative; pescatarian is selectable alongside vegetarian, vegan, lactose-free, and gluten-free; one nutritional goal is required. Combining pescatarian with vegetarian or vegan naturally narrows the intersection to the labelled plant-based products.

- Low-carbs and low-salt are catalog filters based on the recorded values per 100g, not personalised medical or certification claims.

- Each day exposes one default meal and two optional on-demand alternatives that use unused filtered-candidate product IDs.

- The brief’s client-only architecture is followed despite the production-security limitation of shipping an API key in a native client.
