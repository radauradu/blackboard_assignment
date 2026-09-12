# MealPrep decision log

## Product and interaction

- The budget range is €25-€150 in €5 increments.
- Each day has one primary meal and two optional alternatives in case the user is not satisfied or wants more recipes for that day.
- An alternative is generated on demand for its selected day, uses a different ingredient set from that day's primary, and displays a projected replacement cost.
- Dietary selections are cumulative. The nutritional goal is single-select.
- Pescatarian products are conservatively identified from vegetarian/vegan labels or the catalog's fish department/categories.

## UX and features decisions

- For the budget screen: he color of the sliding thumb was changed in order to make it more visible.
- For the dietary and nutritional needs screens: Info buttons and descriptions for every dietary needs and nutritional goals were added for the users that don't necessarily know what those filters mean and why people would use them.
- For the week plan screen: 
    1. the filters button was added in order to remind the user what filters were used to generate that specific meal plan.
    2. the swipe option for navigation between day plans was added for a smoother experience.

## LLM workflow

- The POC uses `gpt-5-mini` and English recipe text - for faster and lighter responses and token usage.
- Each generation builds a fresh randomized 120-product role-balanced menu after preference filtering: 30 proteins, 36 vegetables, 24 bases/sides, 18 supports, and 12 ready-meal candidates this way the LLM is not fed the entire products catalog, thing that would increase the waiting time aroun 1+ minutes.
- A small low-reasoning Structured Outputs selector chooses seven global bundles from that menu before the two parallel recipe requests. Its 90-100% budget target is a preference.
- Candidate membership rotates across category, protein family, and price band. Each sampled menu reserves a randomized, locally validated recovery basket. If the selector fails, recovery uses that same sampled menu and never re-runs the old full-catalog selector.
- A day has exactly one protein anchor, at least one base or vegetable, and at most one savory support. Bundles contain 2-4 products and must use a familiar pasta, grain-bowl, or protein-and-vegetables pattern. These constraints were imposed because the LLM would hallucinate weird recipes.
- A conservative category allowlist admits savory proteins, bases, vegetables, supports, and recognized ready-meal cores. Ready meals are limited to soups, frozen pizzas, and composed salads, appear on at most two days, and are never mixed with a separate protein or base. Generic frozen items remain excluded.
- Regular selector days contain 3-5 products including one protein and a vegetable; ready-meal days contain a core plus 1-2 vegetables/supports. 
- Seafood cannot be combined with cheese or cream; no two protein anchors may share a day. Invalid, zero-price, non-EUR, duplicate-ID, and over-budget products are excluded.
- Coherence, classic pairing, distinct day bundles, and category variety take precedence over budget utilization. The weekly budget remains a hard cap.
- Pasta, rice, couscous, sauces, condiments, oils, vinegars, and spices count as one reusable weekly package since it is very unlikely for these to be fully consumed in day. Proteins, vegetables, bread, ready meals, cheese, cream, and butter count once for every day used.
- Missing credentials, request failures, refusals, malformed output, and validation failures use a deterministic catalog-backed fallback built from the basket already selected for that generation.
- Initial generation is split into two concurrent Structured Outputs requests: days 0-3 and days 4-6. Each request receives only the optimized products assigned to its days and writes one primary recipe per day - decision made in order to cut the waiting time.
- Recipe-writing requests use minimal reasoning, low verbosity, three or four concise recipe steps per meal, and a 6,000-token cap. The smaller ingredient selector uses low reasoning and a 30-second timeout. Again, decision made in order to reduce the waiting time.
- Development diagnostics contain only counts, byte sizes, lifecycle durations, HTTP status, output length, API token usage, result source, and sanitized failure reasons. Prompts, recipes, products, and credentials are deliberately excluded.
- Water, salt, black pepper, and olive oil are the only assumed pantry staples. They must be declared by the generated meal, appear visibly in its ingredient list, and do not add package cost.
- Prompt instructions require familiar savory lunch/dinner dishes and explicitly prohibit desserts, snack plates, sweet-and-savory fusion, and experimental pairings. Local bundle validation remains the primary recipe-quality guardrail.

## Grounded recipes and responsive selection

- Nutritional filtering is role-aware for high-protein and balanced plans, preserving vegetables without weakening dietary constraints. Low-calorie, low-carb, and low-salt remain per-product rules.


## Security and scope

- The standard OpenAI key is exposed through Expo configuration only because the assignment requires a client-only POC. A production app must proxy requests through a trusted server.
- iOS is the target platform - I used React Native since I was more familiar with it and Expo Go in order to test the app.


# Proposed feature
- One feature I would propose would be the ability to see a history of meal plans and the ability to save favorite recipes. The user might want to reuse the same week plan or he might like a certain recipe and since the proposed recipes are llm generated from a big pool of products it is unlikely for the user to get the same recipe twice
