# MealPrep — Mobile Take-Home Brief (Sanitized)

> Internal working brief derived from the original take-home PDF, with the API key removed.
> The OpenAI key is provided separately via a local `.env` file (`OPENAI_API_KEY`) — never hardcode it or paste it into prompts.

## Context

Blackboard Studio is building a POC for **MealPrep**, an app that helps people create tailored weekly meal plans based on budget, dietary needs, and nutritional goals. This repo implements the single core user flow only.

**User story:** "As a user, I want a quick and easy way to come up with a meal plan that fits my budget and preferences."

## Stack

- React Native (Expo), TypeScript
- React Navigation (native-stack)
- State management: Zustand (or Context) for flow state across screens
- LLM calls: OpenAI API, key loaded from `process.env.OPENAI_API_KEY` (never hardcoded)

## Resources (to be placed in repo, referenced by path — not pasted into prompts)

- `assets/design/MealPrep-Design.fig` — Figma source design
- `data/product_catalog_en.json` — Esselunga product database (OpenFoodFacts-derived, enriched with prices)
- `assets/fonts/` — font files from `promo.zip`

## Core Flow (5 screens)

1. **Lander** — pixel-perfect except center assets/emojis + animations (full creative freedom there)
2. **Budget selection** — pixel-perfect except the slider, which is missing from the design. Implement a slider with range **[25, 150]**, step size is our choice.
3. **Dietary needs selection** — pixel-perfect. We define the filtering values/logic against the product catalog (e.g. vegetarian, lactose-free).
4. **Nutritional goals selection** — pixel-perfect. We define filtering values/logic against the product catalog.
5. **Weekly meal plan** — most creative freedom. Requirements only:
   - 7 days, at least 1 meal/day
   - Each meal: name, prep time, servings, price (any format)
   - Each meal: ingredients + step-by-step recipe (any format)
   - Day-by-day navigation
   - Generated via an **LLM workflow** (see below), everything client-side

## LLM Workflow Requirement

Design a workflow that takes as input:
- Selected budget
- Selected dietary needs
- Selected nutritional goals
- The filtered ingredient/product pool (from the catalog, after applying the above filters)

...and returns a structured 7-day meal plan + recipes as output, which the app then formats and displays. Use structured/JSON-mode output from the OpenAI API for reliable parsing.

## Design Philosophy

- Where the design is explicit: replicate pixel-perfectly.
- Where the design is missing or incomplete: use judgment — "how would I do it if it were my own app about to ship?"
- Deviations from the original design must be noted (we're keeping a running decision log for this — ask before assuming silence means "don't touch it").

## Security Note

- The OpenAI API key must never appear in source code, commits, or AI tool prompts/logs. It lives only in a git-ignored `.env` file and is referenced via environment variable.

## Out of Scope

- Backend/server-side logic (everything is client-side per the brief)
- Any screens beyond the 5 listed
- Account/auth systems, persistence beyond the session
