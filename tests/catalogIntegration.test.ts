import { describe, expect, it } from "vitest";

import {
  buildCatalogCandidatePool,
  filterCatalogProducts,
  matchesDietaryNeed,
  matchesNutritionalGoal,
} from "../src/data/catalogFilters";
import { productCatalog } from "../src/data/productCatalog";
import { filterMealEligibleProducts } from "../src/data/mealProductClassification";
import { generateWeeklyMealPlan } from "../src/services/mealPlanGeneration";
import type { DietaryNeed, NutritionalGoal } from "../src/types/flow";

describe("checked-in product catalog", () => {
  it("loads the complete catalog from the brief's canonical path", () => {
    expect(productCatalog).toHaveLength(3295);
    expect(productCatalog[0]).toMatchObject({
      id: expect.any(String),
      labels: expect.any(Array),
      allergens: expect.any(Array),
      nutrition: expect.objectContaining({
        energyKcal100g: expect.anything(),
        proteins100g: expect.anything(),
      }),
    });
  });

  it.each<DietaryNeed>([
    "vegetarian",
    "vegan",
    "pescatarian",
    "lactoseFree",
    "glutenFree",
  ])("returns only products matching the %s rule", (need) => {
    const matches = filterCatalogProducts(productCatalog, {
      dietaryNeeds: [need],
    });

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((item) => matchesDietaryNeed(item, need))).toBe(true);
  });

  it.each<NutritionalGoal>([
    "highProtein",
    "lowCalorie",
    "balanced",
    "lowCarbs",
    "lowSalt",
  ])(
    "returns only products matching the %s rule",
    (goal) => {
      const matches = filterCatalogProducts(productCatalog, {
        nutritionalGoal: goal,
      });

      expect(matches.length).toBeGreaterThan(0);
      expect(matches.every((item) => matchesNutritionalGoal(item, goal))).toBe(
        true,
      );
    },
  );

  it("builds a capped candidate pool from real products", () => {
    const candidates = buildCatalogCandidatePool(
      productCatalog,
      { dietaryNeeds: ["vegan"], nutritionalGoal: "balanced" },
      20,
    );

    expect(candidates).toHaveLength(20);
    expect(new Set(candidates.map(({ id }) => id)).size).toBe(20);
  });

  it("keeps real catalog treats and ambiguous pantry products out of savory recipes", () => {
    const eligible = filterMealEligibleProducts(productCatalog);
    const excludedCategories = new Set([
      "en:desserts",
      "en:cakes",
      "en:ice-creams",
      "en:yogurts",
      "en:snacks",
      "en:dietary-supplements",
    ]);

    expect(
      eligible.some((product) =>
        excludedCategories.has(product.category?.id ?? ""),
      ),
    ).toBe(false);
    expect(
      eligible.some(
        (product) => product.department.id === "dispensa" && product.category === null,
      ),
    ).toBe(false);
  });

  it("uses shared packages to keep strict filtered plans viable", async () => {
    const plan = await generateWeeklyMealPlan(
      {
        budget: 100,
        dietaryNeeds: ["vegan", "glutenFree"],
        nutritionalGoal: "lowSalt",
      },
      { apiKey: null, catalog: productCatalog },
    );

    const assignedIds = plan.days.flatMap(({ primaryMeal }) =>
      primaryMeal.ingredients.map(({ productId }) => productId),
    );
    expect(plan.estimatedTotal.amount).toBeLessThanOrEqual(100);
    expect(new Set(assignedIds).size).toBeLessThan(assignedIds.length);
  });

  it("keeps a standard real-catalog plan below its hard budget cap", async () => {
    const plan = await generateWeeklyMealPlan(
      {
        budget: 80,
        dietaryNeeds: [],
        nutritionalGoal: null,
      },
      { apiKey: null, catalog: productCatalog },
    );

    expect(plan.source).toBe("fallback");
    expect(plan.estimatedTotal.amount).toBeGreaterThan(0);
    expect(plan.estimatedTotal.amount).toBeLessThanOrEqual(80);
    expect(
      plan.days.every(
        (day) =>
          day.primaryMeal.ingredients.length >= 1 &&
          day.primaryMeal.ingredients.length <= 8,
      ),
    ).toBe(true);
  });

  it(
    "builds coherent fallback bundles for every individual dietary and nutritional choice",
    async () => {
      const scenarios = [
        ...(["vegetarian", "vegan", "pescatarian", "lactoseFree", "glutenFree"] as const).map(
          (dietaryNeed) => ({ dietaryNeeds: [dietaryNeed], nutritionalGoal: null }),
        ),
        ...(["highProtein", "lowCalorie", "balanced", "lowCarbs", "lowSalt"] as const).map(
          (nutritionalGoal) => ({ dietaryNeeds: [], nutritionalGoal }),
        ),
      ];

      for (const scenario of scenarios) {
        const plan = await generateWeeklyMealPlan(
          { budget: 150, ...scenario },
          { apiKey: null, catalog: productCatalog, random: () => 0.25 },
        );

        expect(plan.source).toBe("fallback");
        expect(plan.days).toHaveLength(7);
        expect(plan.estimatedTotal.amount).toBeLessThanOrEqual(150);
        expect(
          plan.days.every((day) => day.primaryMeal.ingredients.length >= 2),
        ).toBe(true);
      }
    },
    30_000,
  );

  it("excludes non-meal departments before basket selection", () => {
    const eligible = filterMealEligibleProducts(productCatalog);

    expect(
      eligible.some(({ department }) =>
        ["bevande", "vini-birre", "infanzia"].includes(department.id),
      ),
    ).toBe(false);
  });
});
