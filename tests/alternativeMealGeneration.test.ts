import { describe, expect, it } from "vitest";

import { generateAlternativeMeal } from "../src/services/alternativeMealGeneration";
import { catalogProduct } from "./mealPlanFixtures";

const chicken = catalogProduct("chicken", 1, "en:poultries");
chicken.category = { id: "en:poultries", name: "en:poultries" };
const pasta = catalogProduct("pasta", 1, "en:pastas");
pasta.category = { id: "en:pastas", name: "en:pastas" };
const vegetables = catalogProduct("vegetables", 1, "en:vegetables");
vegetables.category = { id: "en:vegetables", name: "en:vegetables" };
const tofu = catalogProduct("tofu", 1, "en:meat-alternatives");
tofu.category = { id: "en:meat-alternatives", name: "en:meat-alternatives" };
const primaryMeal = {
  id: "day-0-primary",
  name: "Primary",
  prepTimeMinutes: 20,
  servings: 2,
  estimatedPrice: { amount: 1, currency: "EUR" as const },
  ingredients: [
    {
      productId: "chicken",
      name: "Catalog chicken",
      quantity: "1 package",
      packagePrice: { amount: 1, currency: "EUR" as const },
    },
    {
      productId: "pasta",
      name: "Catalog pasta",
      quantity: "1 package",
      packagePrice: { amount: 1, currency: "EUR" as const },
    },
  ],
  pantryItems: [],
  steps: [
    { instruction: "Prepare.", productIds: ["chicken", "pasta"], ingredientNames: ["Catalog chicken", "Catalog pasta"], pantryItems: [] },
    { instruction: "Cook.", productIds: ["chicken", "pasta"], ingredientNames: ["Catalog chicken", "Catalog pasta"], pantryItems: [] },
    { instruction: "Serve.", productIds: ["chicken", "pasta"], ingredientNames: ["Catalog chicken", "Catalog pasta"], pantryItems: [] },
  ],
};

describe("alternative meal generation", () => {
  it("enriches an alternative using a separate, coherent ingredient set", async () => {
    const alternative = await generateAlternativeMeal({
      apiKey: "test-key",
      dayIndex: 0,
      primaryMeal,
      candidates: [chicken, tofu, pasta, vegetables],
      excludedProductIds: ["chicken"],
      dietaryNeeds: [],
      nutritionalGoal: null,
      streamingSupported: false,
      fetcher: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          status: "completed",
          error: null,
          output_text: JSON.stringify({
            days: [
              {
                dayIndex: 0,
                primaryMeal: {
                  name: "Alternative",
                  prepTimeMinutes: 15,
                  servings: 2,
                  ingredients: [
                    { productId: "tofu", quantity: { amount: 1, unit: "piece" } },
                    { productId: "pasta", quantity: { amount: 2, unit: "piece" } },
                    { productId: "vegetables", quantity: { amount: 2, unit: "piece" } },
                  ],
                  pantryItems: [],
                  steps: [
                    { instruction: "Cook the tofu and pasta.", productIds: ["tofu", "pasta"], pantryItems: ["water"] },
                    { instruction: "Cook the vegetables and combine.", productIds: ["vegetables"], pantryItems: [] },
                  ],
                },
              },
            ],
          }),
        }),
      }),
    });

    expect(alternative.name).toBe("Alternative");
    expect(new Set(alternative.ingredients.map(({ productId }) => productId))).toEqual(
      new Set(["tofu", "pasta", "vegetables"]),
    );
    expect(alternative.ingredients.map(({ productId }) => productId)).not.toContain("chicken");
  });

  it("rejects an alternative that adds a product", async () => {
    await expect(
      generateAlternativeMeal({
        apiKey: "test-key",
        dayIndex: 0,
        primaryMeal,
      candidates: [chicken, tofu, pasta, vegetables],
      excludedProductIds: ["chicken"],
        dietaryNeeds: [],
        nutritionalGoal: null,
        streamingSupported: false,
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            status: "completed",
            error: null,
            output_text: JSON.stringify({
              days: [
                {
                  dayIndex: 0,
                  primaryMeal: {
                    name: "Bad",
                    ingredients: [
                      {
                        productId: "foreign",
                        quantity: { amount: 1, unit: "piece" },
                      },
                    ],
                  },
                },
              ],
            }),
          }),
        }),
      }),
    ).rejects.toThrow("did not use the selected ingredients");
  });
});
