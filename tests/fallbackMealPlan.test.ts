import { describe, expect, it } from "vitest";

import { generateFallbackWeeklyPlan } from "../src/services/fallbackMealPlan";
import {
  selectWeeklyProductBasket,
  type ExpectedWeeklySelection,
  type RandomSource,
} from "../src/services/weeklyProductBasket";
import { catalogProduct } from "./mealPlanFixtures";

function savoryProduct(id: string, categoryId: string, price = 1) {
  const product = catalogProduct(id, price, categoryId);
  product.category = { id: categoryId, name: categoryId };
  return product;
}

function candidates() {
  return [
    savoryProduct("chicken", "en:poultries", 2),
    savoryProduct("fish", "en:fishes", 2),
    savoryProduct("tofu", "en:meat-alternatives", 2),
    savoryProduct("eggs", "en:eggs", 2),
    savoryProduct("pasta", "en:pastas"),
    savoryProduct("rice", "en:rices"),
    savoryProduct("bread", "en:breads"),
    savoryProduct("vegetables", "en:vegetables"),
    savoryProduct("salad", "en:salads"),
    savoryProduct("sauce", "en:tomato-sauces"),
    ...Array.from({ length: 3 }, (_, index) =>
      savoryProduct(`protein-${index}`, "en:legumes"),
    ),
    ...Array.from({ length: 5 }, (_, index) =>
      savoryProduct(`vegetable-${index}`, "en:vegetables"),
    ),
    ...Array.from({ length: 4 }, (_, index) =>
      savoryProduct(`base-${index}`, "en:rices"),
    ),
  ];
}

function fallbackFor(
  catalog: ReturnType<typeof candidates>,
  budget: number,
  random: RandomSource = () => 0.25,
) {
  const basket = selectWeeklyProductBasket(catalog, budget, random);
  if (!basket) {
    return null;
  }
  const expectedSelection: ExpectedWeeklySelection = {
    dayProductIds: basket.dayAssignments.map(({ productIds }) => productIds),
    productIds: basket.productIds,
    spend: basket.spend,
    dayAssignments: basket.dayAssignments,
  };
  return generateFallbackWeeklyPlan(
    basket.products,
    budget,
    basket.dayAssignments,
    expectedSelection,
  );
}

describe("deterministic fallback meal plan", () => {
  it("creates seven template-aware days and stays within budget", () => {
    const plan = fallbackFor(candidates(), 30);

    expect(plan).not.toBeNull();
    expect(plan?.source).toBe("fallback");
    expect(plan?.days).toHaveLength(7);
    expect(plan?.estimatedTotal.amount).toBeLessThanOrEqual(30);
    expect(
      plan?.days.every((day) => day.primaryMeal.name.startsWith("Simple")),
    ).toBe(true);
    expect(plan?.days.every((day) => day.primaryMeal.ingredients.length >= 2)).toBe(
      true,
    );
  });

  it("returns the same plan for the same inputs", () => {
    expect(fallbackFor(candidates(), 20)).toEqual(fallbackFor(candidates(), 20));
  });

  it("has no plan when no coherent savory meal fits", () => {
    expect(
      selectWeeklyProductBasket([savoryProduct("expensive", "en:pastas", 30)], 25),
    ).toBeNull();
  });
});
