import { describe, expect, it } from "vitest";

import {
  canCombineMealProducts,
  filterMealEligibleProducts,
  isMealEligibleProduct,
  mealProductRole,
  templateForMealProducts,
} from "../src/data/mealProductClassification";
import { catalogProduct } from "./mealPlanFixtures";

function productInCategory(id: string, categoryId: string, name = id) {
  const product = catalogProduct(id, 1, categoryId);
  product.name = name;
  product.category = { id: categoryId, name: categoryId };
  product.department = { id: "test", name: "Test" };
  return product;
}

describe("savory meal product classification", () => {
  it("allows only deliberate savory ingredient categories", () => {
    const pasta = productInCategory("pasta", "en:pastas", "Wholewheat pasta");
    const fish = productInCategory("fish", "en:fishes", "Cod fillets");
    const vegetables = productInCategory("veg", "en:vegetables", "Mixed vegetables");

    expect(filterMealEligibleProducts([pasta, fish, vegetables])).toEqual([
      pasta,
      fish,
      vegetables,
    ]);
    expect(mealProductRole(fish)).toBe("protein");
    expect(mealProductRole(pasta)).toBe("base");
    expect(mealProductRole(vegetables)).toBe("produce");
  });

  it("excludes desserts, cakes, ice creams, yogurt, bars, snacks, and uncategorized pantry products", () => {
    const excluded = [
      productInCategory("dessert", "en:desserts", "Chocolate dessert"),
      productInCategory("cake", "en:cakes", "Chocolate cake"),
      productInCategory("ice-cream", "en:ice-creams", "Vanilla ice cream"),
      productInCategory("yogurt", "en:yogurts", "Sweet yogurt"),
      productInCategory("bar", "en:dietary-supplements", "Protein bar"),
      productInCategory("snack", "en:snacks", "Potato chips"),
    ];
    const uncategorized = catalogProduct("pantry", 1);
    uncategorized.category = null;

    expect(excluded.every((product) => !isMealEligibleProduct(product))).toBe(
      true,
    );
    expect(isMealEligibleProduct(uncategorized)).toBe(false);
  });

  it("blocks invalid classic pairings", () => {
    const tuna = productInCategory("tuna", "en:fishes", "Tuna fillets");
    const cheese = productInCategory("cheese", "en:cheeses", "Hard cheese");
    const chicken = productInCategory("chicken", "en:poultries", "Chicken breast");
    const tofu = productInCategory("tofu", "en:meat-alternatives", "Firm tofu");
    const pasta = productInCategory("pasta", "en:pastas", "Pasta");

    expect(canCombineMealProducts(tuna, cheese)).toBe(false);
    expect(canCombineMealProducts(chicken, tofu)).toBe(false);
    expect(canCombineMealProducts(tuna, pasta)).toBe(true);
  });

  it("requires one anchor plus a base or vegetable, with no more than one support", () => {
    const chicken = productInCategory("chicken", "en:poultries");
    const pasta = productInCategory("pasta", "en:pastas");
    const vegetables = productInCategory("veg", "en:vegetables");
    const sauce = productInCategory("sauce", "en:tomato-sauces");
    const oil = productInCategory("oil", "en:olive-oils");

    expect(templateForMealProducts([chicken, pasta, vegetables, sauce])).toBe(
      "pasta",
    );
    expect(templateForMealProducts([chicken, pasta, sauce, oil])).toBeNull();
    expect(templateForMealProducts([pasta, vegetables])).toBeNull();
  });
});
