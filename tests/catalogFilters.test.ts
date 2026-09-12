import { describe, expect, it } from "vitest";

import {
  buildCatalogCandidatePool,
  filterCatalogProducts,
  matchesDietaryNeed,
  matchesNutritionalGoal,
  selectCategoryDiverseCandidates,
} from "../src/data/catalogFilters";
import type { CatalogProduct } from "../src/types/catalog";

function product(
  overrides: Partial<CatalogProduct> & Pick<CatalogProduct, "id">,
): CatalogProduct {
  const { id, ...rest } = overrides;

  return {
    id,
    barcode: id,
    name: `Product ${id}`,
    brand: "Test",
    department: { id: "pantry", name: "Pantry" },
    category: { id: "en:test", name: "Test" },
    quantity: "100 g",
    netContent: { value: 100, unit: "g" },
    price: { amount: 2, currency: "EUR" },
    unitPrice: { amount: 20, unit: "kg" },
    nutrition: {
      energyKcal100g: 200,
      fat100g: 1,
      saturatedFat100g: 0,
      carbohydrates100g: 20,
      sugars100g: 2,
      fiber100g: 2,
      proteins100g: 10,
      salt100g: 0.1,
    },
    nutriScore: "b",
    novaGroup: 1,
    labels: [],
    allergens: [],
    ...rest,
  };
}

describe("dietary filtering", () => {
  it("accepts vegan products as vegetarian", () => {
    const vegan = product({
      id: "vegan",
      labels: [{ id: "en:vegan", name: "Vegan" }],
    });

    expect(matchesDietaryNeed(vegan, "vegetarian")).toBe(true);
    expect(matchesDietaryNeed(vegan, "vegan")).toBe(true);
  });

  it("excludes declared milk and gluten allergens", () => {
    const milk = product({
      id: "milk",
      allergens: [{ id: "en:milk", name: "Milk" }],
    });
    const gluten = product({
      id: "gluten",
      allergens: [{ id: "en:gluten", name: "Gluten" }],
    });

    expect(matchesDietaryNeed(milk, "lactoseFree")).toBe(false);
    expect(matchesDietaryNeed(gluten, "glutenFree")).toBe(false);
  });

  it("accepts labelled vegetarian products and fish classifications as pescatarian", () => {
    const vegetarian = product({
      id: "vegetarian",
      labels: [{ id: "en:vegetarian", name: "Vegetarian" }],
    });
    const fishDepartment = product({
      id: "fish-department",
      department: { id: "pesce", name: "Fish" },
    });
    const fishCategory = product({
      id: "fish-category",
      category: { id: "en:canned-fishes", name: "Canned Fish" },
    });
    const meat = product({
      id: "meat",
      department: { id: "carne", name: "Meat" },
    });

    expect(matchesDietaryNeed(vegetarian, "pescatarian")).toBe(true);
    expect(matchesDietaryNeed(fishDepartment, "pescatarian")).toBe(true);
    expect(matchesDietaryNeed(fishCategory, "pescatarian")).toBe(true);
    expect(matchesDietaryNeed(meat, "pescatarian")).toBe(false);
  });

  it("applies gluten exclusion to pescatarian fish products", () => {
    const breadedFish = product({
      id: "breaded-fish",
      department: { id: "pesce", name: "Fish" },
      allergens: [{ id: "en:gluten", name: "Gluten" }],
    });

    expect(
      filterCatalogProducts([breadedFish], {
        dietaryNeeds: ["pescatarian", "glutenFree"],
      }),
    ).toEqual([]);
  });

  it("applies multiple dietary needs cumulatively", () => {
    const eligible = product({
      id: "eligible",
      labels: [{ id: "en:vegan", name: "Vegan" }],
    });
    const containsGluten = product({
      id: "contains-gluten",
      labels: [{ id: "en:vegan", name: "Vegan" }],
      allergens: [{ id: "en:gluten", name: "Gluten" }],
    });

    expect(
      filterCatalogProducts([eligible, containsGluten], {
        dietaryNeeds: ["vegan", "glutenFree"],
      }),
    ).toEqual([eligible]);
  });
});

describe("nutritional goal filtering", () => {
  it("uses inclusive protein and calorie cutoffs", () => {
    const atCutoffs = product({
      id: "cutoffs",
      nutrition: {
        ...product({ id: "base" }).nutrition,
        energyKcal100g: 150,
        proteins100g: 12,
      },
    });

    expect(matchesNutritionalGoal(atCutoffs, "highProtein")).toBe(true);
    expect(matchesNutritionalGoal(atCutoffs, "lowCalorie")).toBe(true);
  });

  it("uses inclusive carbohydrate and salt cutoffs", () => {
    const atCutoffs = product({
      id: "cutoffs",
      nutrition: {
        ...product({ id: "base" }).nutrition,
        carbohydrates100g: 10,
        salt100g: 0.3,
      },
    });
    const aboveCutoffs = product({
      id: "above-cutoffs",
      nutrition: {
        ...product({ id: "base" }).nutrition,
        carbohydrates100g: 10.1,
        salt100g: 0.31,
      },
    });

    expect(matchesNutritionalGoal(atCutoffs, "lowCarbs")).toBe(true);
    expect(matchesNutritionalGoal(atCutoffs, "lowSalt")).toBe(true);
    expect(matchesNutritionalGoal(aboveCutoffs, "lowCarbs")).toBe(false);
    expect(matchesNutritionalGoal(aboveCutoffs, "lowSalt")).toBe(false);
  });

  it("requires Nutri-Score A/B and protein for balanced", () => {
    const balanced = product({
      id: "balanced",
      nutriScore: "a",
      nutrition: {
        ...product({ id: "base" }).nutrition,
        proteins100g: 5,
      },
    });
    const weakScore = product({ ...balanced, id: "weak", nutriScore: "c" });

    expect(matchesNutritionalGoal(balanced, "balanced")).toBe(true);
    expect(matchesNutritionalGoal(weakScore, "balanced")).toBe(false);
  });

  it("does not treat missing nutrition as zero", () => {
    const unknown = product({
      id: "unknown",
      nutrition: {
        ...product({ id: "base" }).nutrition,
        energyKcal100g: null,
        proteins100g: null,
        carbohydrates100g: null,
        salt100g: null,
      },
    });

    expect(matchesNutritionalGoal(unknown, "highProtein")).toBe(false);
    expect(matchesNutritionalGoal(unknown, "lowCalorie")).toBe(false);
    expect(matchesNutritionalGoal(unknown, "lowCarbs")).toBe(false);
    expect(matchesNutritionalGoal(unknown, "lowSalt")).toBe(false);
    expect(matchesNutritionalGoal(unknown, "balanced")).toBe(false);
  });
});

describe("candidate pool selection", () => {
  it("round-robins categories and prefers cheaper products within each", () => {
    const products = [
      product({
        id: "a-expensive",
        category: { id: "a", name: "A" },
        price: { amount: 5, currency: "EUR" },
      }),
      product({
        id: "a-cheap",
        category: { id: "a", name: "A" },
        price: { amount: 1, currency: "EUR" },
      }),
      product({
        id: "b",
        category: { id: "b", name: "B" },
        price: { amount: 2, currency: "EUR" },
      }),
    ];

    expect(selectCategoryDiverseCandidates(products, 2).map(({ id }) => id)).toEqual([
      "a-cheap",
      "b",
    ]);
  });

  it("filters before applying the pool limit", () => {
    const vegan = product({
      id: "vegan",
      labels: [{ id: "en:vegan", name: "Vegan" }],
    });
    const other = product({ id: "other" });

    expect(
      buildCatalogCandidatePool(
        [other, vegan],
        { dietaryNeeds: ["vegan"] },
        1,
      ),
    ).toEqual([vegan]);
  });
});
