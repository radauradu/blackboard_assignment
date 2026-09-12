import { describe, expect, it } from "vitest";

import { recipeGroundingError } from "../src/services/recipeGrounding";
import type { GeneratedMeal } from "../src/types/generatedMealPlan";
import { catalogProduct } from "./mealPlanFixtures";

const chicken = catalogProduct("chicken");
chicken.name = "Chicken breast";
chicken.category = { id: "chicken", name: "Chicken" };

const rice = catalogProduct("rice");
rice.name = "Brown rice";
rice.category = { id: "rice", name: "Rice" };

function meal(
  steps: [string, string],
  pantryItems: GeneratedMeal["pantryItems"] = [],
): GeneratedMeal {
  return {
    name: "Simple dinner",
    prepTimeMinutes: 20,
    servings: 2,
    ingredients: [
      { productId: chicken.id, quantity: { amount: 200, unit: "g" } },
    ],
    pantryItems,
    steps: steps.map((instruction) => ({ instruction, productIds: [chicken.id], pantryItems: [] })),
  };
}

describe("recipe ingredient grounding", () => {
  it("allows assigned catalog products", () => {
    expect(
      recipeGroundingError(
        meal(["Slice the chicken breast.", "Cook and serve."]),
        [chicken],
        [chicken, rice],
      ),
    ).toBeNull();
  });

  it("allows a catalog term contained in an assigned product name", () => {
    const assignedChips = catalogProduct("assigned-chips");
    assignedChips.name = "Sea salt potato chips";
    assignedChips.category = { id: "snacks", name: "Snacks" };
    const genericChips = catalogProduct("generic-chips");
    genericChips.name = "Chips";
    genericChips.category = { id: "chips", name: "Chips" };
    const chipsMeal = meal(["Crush the chips.", "Cook and serve."]);
    chipsMeal.ingredients[0]!.productId = assignedChips.id;
    chipsMeal.steps.forEach((step) => { step.productIds = [assignedChips.id]; });

    expect(
      recipeGroundingError(
        chipsMeal,
        [assignedChips],
        [assignedChips, genericChips],
      ),
    ).toBeNull();
  });

  it("allows declared pantry items and rejects undeclared ones", () => {
    const pepper = catalogProduct("pepper");
    pepper.name = "Black pepper";
    pepper.category = { id: "seasoning", name: "Seasoning" };
    expect(
      recipeGroundingError(
        meal(["Season with black pepper.", "Cook and serve."], [
          "black pepper",
        ]),
        [chicken],
        [chicken, rice, pepper],
      ),
    ).toBeNull();
    expect(
      recipeGroundingError(
        meal(["Season with pepper.", "Cook and serve."]),
        [chicken],
        [chicken, rice],
      ),
    ).toContain("undeclared pantry item");
  });

  it("rejects unassigned catalog ingredients across case and punctuation", () => {
    expect(
      recipeGroundingError(
        meal(["Add BROWN-RICE.", "Cook and serve."]),
        [chicken],
        [chicken, rice],
      ),
    ).toContain('unassigned catalog ingredient "brown rice"');
  });

  it("ignores short ambiguous catalog terms", () => {
    const egg = catalogProduct("egg");
    egg.name = "Egg";
    egg.category = { id: "egg", name: "Egg" };

    expect(
      recipeGroundingError(
        meal(["Shape an egg-like oval.", "Cook and serve."]),
        [chicken],
        [chicken, egg],
      ),
    ).toBeNull();
  });
});
