import type { CatalogProduct } from "../src/types/catalog";
import type {
  GeneratedMeal,
  GeneratedWeeklyPlan,
} from "../src/types/generatedMealPlan";

export function catalogProduct(
  id: string,
  price = 1,
  categoryId = `category-${id}`,
): CatalogProduct {
  return {
    id,
    barcode: id,
    name: `Catalog ${id}`,
    brand: "Test brand",
    department: { id: "dispensa", name: "Pantry" },
    category: { id: categoryId, name: categoryId },
    quantity: "100 g",
    netContent: { value: 100, unit: "g" },
    price: { amount: price, currency: "EUR" },
    unitPrice: { amount: price * 10, unit: "kg" },
    nutrition: {
      energyKcal100g: 100,
      fat100g: 1,
      saturatedFat100g: 0,
      carbohydrates100g: 5,
      sugars100g: 1,
      fiber100g: 2,
      proteins100g: 15,
      salt100g: 0.1,
    },
    nutriScore: "a",
    novaGroup: 1,
    labels: [],
    allergens: [],
  };
}

export function generatedMeal(productId: string, name: string): GeneratedMeal {
  return {
    name,
    prepTimeMinutes: 20,
    servings: 2,
    ingredients: [{ productId, quantity: { amount: 1, unit: "pack" } }],
    pantryItems: [],
    steps: [
      { instruction: "Prepare the product.", productIds: [productId], pantryItems: [] },
      { instruction: "Cook it as needed.", productIds: [productId], pantryItems: [] },
      { instruction: "Serve in two portions.", productIds: [productId], pantryItems: [] },
    ],
  };
}

export function generatedPlan(productIds: readonly string[]): GeneratedWeeklyPlan {
  if (productIds.length < 7) {
    throw new Error("A generated plan fixture needs seven product IDs.");
  }

  const days = Array.from({ length: 7 }, (_, dayIndex) => {
    const productId = productIds[dayIndex]!;
    return {
      dayIndex,
      primaryMeal: generatedMeal(productId, `Primary ${dayIndex}`),
    };
  });

  return {
    days: [
      days[0]!,
      days[1]!,
      days[2]!,
      days[3]!,
      days[4]!,
      days[5]!,
      days[6]!,
    ],
  };
}

export function cloneGeneratedPlan(
  plan: GeneratedWeeklyPlan,
): GeneratedWeeklyPlan {
  return JSON.parse(JSON.stringify(plan)) as GeneratedWeeklyPlan;
}
