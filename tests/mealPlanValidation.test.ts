import { describe, expect, it } from "vitest";

import {
  MealPlanValidationError,
  parseGeneratedWeeklyPlan,
  validateAndEnrichWeeklyPlan,
} from "../src/services/mealPlanValidation";
import {
  catalogProduct,
  cloneGeneratedPlan,
  generatedPlan,
} from "./mealPlanFixtures";
import type { ExpectedWeeklySelection } from "../src/services/weeklyProductBasket";

const productIds = Array.from({ length: 7 }, (_, index) => `p${index}`);
const products = productIds.map((id) => catalogProduct(id));
const expectedSelection: ExpectedWeeklySelection = {
  dayProductIds: productIds.map((id) => [id]),
  productIds,
  spend: 7,
};

describe("meal-plan validation", () => {
  it("exposes a content-safe code and structural path for diagnostics", () => {
    const plan = cloneGeneratedPlan(generatedPlan(productIds));
    plan.days[2].primaryMeal.steps[0]!.productIds = ["p0", "p0"];

    try {
      parseGeneratedWeeklyPlan(plan);
      throw new Error("Expected validation to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(MealPlanValidationError);
      const validationError = error as MealPlanValidationError;
      expect(validationError.code).toBe("duplicate_step_product");
      expect(validationError.path).toBe("days[2].primaryMeal.steps[0].productIds");
      expect(JSON.stringify({ code: validationError.code, path: validationError.path })).not.toContain("Catalog");
    }
  });

  it("repairs unassigned catalog staple wording while retaining structured grounding", () => {
    const plan = cloneGeneratedPlan(generatedPlan(productIds));
    plan.days[1].primaryMeal.steps[0]!.instruction = "Cook with rice.";
    const repairs: Array<{ type: string; path: string }> = [];

    const enriched = validateAndEnrichWeeklyPlan(
      plan,
      products,
      10,
      "openai",
      undefined,
      (repair) => repairs.push(repair),
    );
    expect(enriched.source).toBe("openai");
    expect(enriched.days[1].primaryMeal.steps[0]!.instruction).not.toContain("rice");
    expect(repairs).toContainEqual({
      type: "repaired_unassigned_staple",
      path: "days[1].primaryMeal.steps[0].instruction",
    });
  });

  it("repairs a product name borrowed from another day without changing step metadata", () => {
    const plan = cloneGeneratedPlan(generatedPlan(productIds));
    plan.days[1].primaryMeal.name = "Catalog p0 with Catalog p1";
    plan.days[1].primaryMeal.steps[1]!.instruction =
      "Cook Catalog p0 until tender.";
    const originalProductIds = [...plan.days[1].primaryMeal.steps[1]!.productIds];
    const repairs: Array<{ type: string; path: string }> = [];

    const enriched = validateAndEnrichWeeklyPlan(
      plan,
      products,
      10,
      "openai",
      undefined,
      (repair) => repairs.push(repair),
    );
    expect(enriched.source).toBe("openai");
    expect(enriched.days[1].primaryMeal.name).not.toContain("Catalog p0");
    expect(enriched.days[1].primaryMeal.steps[1]!.instruction).not.toContain("Catalog p0");
    expect(enriched.days[1].primaryMeal.steps[1]!.productIds).toEqual(originalProductIds);
    expect(enriched.days[1].primaryMeal.steps[1]!.ingredientNames).toEqual(["Catalog p1"]);
    expect(repairs).toContainEqual({
      type: "repaired_cross_day_product_name",
      path: "days[1].primaryMeal.steps[1].instruction",
    });
  });

  it("enriches catalog-owned names and prices", () => {
    const plan = validateAndEnrichWeeklyPlan(
      generatedPlan(productIds),
      products,
      10,
    );

    expect(plan.source).toBe("openai");
    expect(plan.days).toHaveLength(7);
    expect(plan.estimatedTotal).toEqual({ amount: 7, currency: "EUR" });
    expect(plan.days[0].primaryMeal.ingredients[0]).toMatchObject({
      productId: "p0",
      name: "Catalog p0",
      packagePrice: { amount: 1, currency: "EUR" },
    });
    expect(plan.days[0].primaryMeal.estimatedPrice.amount).toBe(1);
  });

  it("removes catalog references from recipe text without changing quantities", () => {
    const plan = cloneGeneratedPlan(generatedPlan(productIds));
    plan.days[0].primaryMeal.name = "Dinner (8001234567890)";
    plan.days[0].primaryMeal.steps[0]!.instruction = "Warm P1 for 10 minutes (8001234567890).";

    const enriched = validateAndEnrichWeeklyPlan(plan, products, 10);

    expect(enriched.days[0].primaryMeal.name).toBe("Dinner");
    expect(enriched.days[0].primaryMeal.steps[0]!.instruction).toBe("Warm for 10 minutes.");
  });

  it("rejects incorrect day counts and order", () => {
    const shortPlan = cloneGeneratedPlan(generatedPlan(productIds));
    shortPlan.days.pop();
    const outOfOrder = cloneGeneratedPlan(generatedPlan(productIds));
    outOfOrder.days[2].dayIndex = 4;

    expect(() => parseGeneratedWeeklyPlan(shortPlan)).toThrow(
      MealPlanValidationError,
    );
    expect(() => parseGeneratedWeeklyPlan(outOfOrder)).toThrow(
      "days[2].dayIndex must be 2",
    );
  });

  it("rejects product IDs outside the filtered candidate pool", () => {
    const plan = cloneGeneratedPlan(generatedPlan(productIds));
    plan.days[0].primaryMeal.ingredients[0]!.productId = "foreign";

    expect(() => validateAndEnrichWeeklyPlan(plan, products, 10)).toThrow(
      "Unknown candidate product ID: foreign",
    );
  });

  it("rejects duplicate primary ingredient combinations", () => {
    const plan = cloneGeneratedPlan(generatedPlan(productIds));
    plan.days[1].primaryMeal.ingredients[0]!.productId = "p0";

    expect(() => validateAndEnrichWeeklyPlan(plan, products, 10)).toThrow(
      "Primary meals must use distinct ingredient combinations",
    );
  });

  it("rejects invalid numeric fields and duplicate meal product IDs", () => {
    const invalidPrep = cloneGeneratedPlan(generatedPlan(productIds));
    invalidPrep.days[0].primaryMeal.prepTimeMinutes = 2;
    const duplicateIngredients = cloneGeneratedPlan(generatedPlan(productIds));
    duplicateIngredients.days[0].primaryMeal.ingredients.push({
      productId: "p0",
      quantity: { amount: 1, unit: "pack" },
    });

    expect(() => parseGeneratedWeeklyPlan(invalidPrep)).toThrow(
      "prepTimeMinutes must be an integer between 5 and 180",
    );
    expect(() => parseGeneratedWeeklyPlan(duplicateIngredients)).toThrow(
      "contains duplicate product IDs",
    );
  });

  it("rejects unsupported and duplicate pantry items", () => {
    const unsupported = cloneGeneratedPlan(generatedPlan(productIds));
    unsupported.days[0].primaryMeal.pantryItems = ["garlic" as never];
    const duplicate = cloneGeneratedPlan(generatedPlan(productIds));
    duplicate.days[0].primaryMeal.pantryItems = ["salt", "salt"];

    expect(() => parseGeneratedWeeklyPlan(unsupported)).toThrow(
      "unsupported pantry item",
    );
    expect(() => parseGeneratedWeeklyPlan(duplicate)).toThrow(
      "pantryItems contains duplicates",
    );
  });

  it("derives the meal pantry list from grounded step metadata", () => {
    const plan = cloneGeneratedPlan(generatedPlan(productIds));
    plan.days[0].primaryMeal.pantryItems = [];
    plan.days[0].primaryMeal.steps[0]!.pantryItems = ["olive oil"];

    const parsed = parseGeneratedWeeklyPlan(plan);

    expect(parsed.days[0].primaryMeal.pantryItems).toEqual(["olive oil"]);
  });

  it("repairs allowlisted pantry metadata from recipe text", () => {
    const plan = cloneGeneratedPlan(generatedPlan(productIds));
    plan.days[0].primaryMeal.steps[0]!.instruction =
      "Cook the listed ingredient with olive oil and black pepper.";

    const enriched = validateAndEnrichWeeklyPlan(plan, products, 10);

    expect(enriched.source).toBe("openai");
    expect(enriched.days[0].primaryMeal.pantryItems).toEqual([
      "black pepper",
      "olive oil",
    ]);
    expect(enriched.days[0].primaryMeal.steps[0]!.pantryItems).toEqual([
      "black pepper",
      "olive oil",
    ]);
  });

  it("repairs missing assigned-product step coverage without changing instruction text", () => {
    const plan = cloneGeneratedPlan(generatedPlan(productIds));
    const extraProduct = catalogProduct("p-extra");
    const originalInstruction = plan.days[2].primaryMeal.steps[0]!.instruction;
    plan.days[2].primaryMeal.ingredients.push({
      productId: extraProduct.id,
      quantity: { amount: 1, unit: "pack" },
    });
    const selectionWithExtra: ExpectedWeeklySelection = {
      dayProductIds: expectedSelection.dayProductIds.map((ids, dayIndex) =>
        dayIndex === 2 ? [...ids, extraProduct.id] : ids,
      ),
      productIds: [...expectedSelection.productIds, extraProduct.id],
      spend: 8,
    };

    const enriched = validateAndEnrichWeeklyPlan(
      plan,
      [...products, extraProduct],
      10,
      "openai",
      selectionWithExtra,
    );

    expect(enriched.days[2].primaryMeal.steps[0]!.instruction).toBe(
      originalInstruction,
    );
    expect(enriched.days[2].primaryMeal.steps[0]!.productIds).toEqual([
      "p2",
      "p-extra",
    ]);
    expect(enriched.days[2].primaryMeal.steps[0]!.ingredientNames).toEqual([
      "Catalog p2",
      "Catalog p-extra",
    ]);
  });

  it("does not repair away a foreign step product ID", () => {
    const plan = cloneGeneratedPlan(generatedPlan(productIds));
    plan.days[0].primaryMeal.steps[0]!.productIds = ["foreign"];

    expect(() =>
      validateAndEnrichWeeklyPlan(plan, products, 10),
    ).toThrow("step with an unassigned product ID");
  });

  it("repairs one foreign step reference only when one assigned product is uniquely missing", () => {
    const plan = cloneGeneratedPlan(generatedPlan(productIds));
    const extraProduct = catalogProduct("p-extra");
    plan.days[0].primaryMeal.ingredients.push({
      productId: extraProduct.id,
      quantity: { amount: 1, unit: "pack" },
    });
    plan.days[0].primaryMeal.steps[0]!.productIds = ["foreign"];
    const repairs: Array<{ type: string; path: string }> = [];
    const selectionWithExtra: ExpectedWeeklySelection = {
      dayProductIds: expectedSelection.dayProductIds.map((ids, dayIndex) =>
        dayIndex === 0 ? [...ids, extraProduct.id] : ids,
      ),
      productIds: [...expectedSelection.productIds, extraProduct.id],
      spend: 8,
    };

    const enriched = validateAndEnrichWeeklyPlan(
      plan,
      [...products, extraProduct],
      10,
      "openai",
      selectionWithExtra,
      (repair) => repairs.push(repair),
    );

    expect(enriched.days[0].primaryMeal.steps[0]!.productIds).toEqual(["p-extra"]);
    expect(enriched.days[0].primaryMeal.steps[0]!.ingredientNames).toEqual(["Catalog p-extra"]);
    expect(repairs).toContainEqual({
      type: "repaired_foreign_step_product_reference",
      path: "days[0].primaryMeal.steps[0].productIds",
    });
  });

  it("rejects plans above the weekly unique-package budget", () => {
    const expensiveProducts = productIds.map((id) => catalogProduct(id, 2));

    expect(() =>
      validateAndEnrichWeeklyPlan(
        generatedPlan(productIds),
        expensiveProducts,
        10,
      ),
    ).toThrow("above the €10.00 budget");
  });

  it("rejects swapped day products even when the weekly union is correct", () => {
    const plan = cloneGeneratedPlan(generatedPlan(productIds));
    const firstIngredients = plan.days[0].primaryMeal.ingredients;
    const secondIngredients = plan.days[1].primaryMeal.ingredients;
    plan.days[0].primaryMeal.ingredients = secondIngredients;
    plan.days[1].primaryMeal.ingredients = firstIngredients;

    expect(() =>
      validateAndEnrichWeeklyPlan(
        plan,
        products,
        10,
        "openai",
        expectedSelection,
      ),
    ).toThrow("must use exactly its assigned product IDs");
  });

  it("rejects an expected spend that differs from catalog-owned prices", () => {
    expect(() =>
      validateAndEnrichWeeklyPlan(
        generatedPlan(productIds),
        products,
        10,
        "openai",
        { ...expectedSelection, spend: 6.99 },
      ),
    ).toThrow("does not match the selected basket spend");
  });

  it("allows expected repeated day sets for sparse fallback baskets", () => {
    const repeatedIds = Array.from({ length: 7 }, () => "p0");
    const plan = validateAndEnrichWeeklyPlan(
      generatedPlan(repeatedIds),
      [products[0]!],
      10,
      "fallback",
      {
        dayProductIds: repeatedIds.map((id) => [id]),
        productIds: ["p0"],
        spend: 7,
      },
    );

    expect(plan.estimatedTotal.amount).toBe(7);
  });
});
