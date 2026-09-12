import type { CatalogProduct } from "../types/catalog";
import type {
  GeneratedDayPlan,
  GeneratedIngredient,
  GeneratedMeal,
  GeneratedWeeklyPlan,
} from "../types/generatedMealPlan";
import type { WeeklyPlan } from "../types/mealPlan";
import { validateAndEnrichWeeklyPlan } from "./mealPlanValidation";
import type {
  ExpectedWeeklySelection,
  SavoryDayAssignment,
} from "./weeklyProductBasket";

const FALLBACK_SERVINGS = 2;
const FALLBACK_PREP_TIME_MINUTES = 10;
const DAY_COUNT = 7;

function ingredientFor(product: CatalogProduct): GeneratedIngredient {
  const amount = product.netContent?.value;
  const unit = product.netContent?.unit;
  return {
    productId: product.id,
    quantity:
      typeof amount === "number" &&
      (unit === "g" || unit === "kg" || unit === "ml" || unit === "l")
        ? { amount, unit: unit as GeneratedIngredient["quantity"]["unit"] }
        : { amount: 1, unit: "pack" as const },
  };
}

function fallbackMeal(
  products: readonly CatalogProduct[],
  template: SavoryDayAssignment["template"],
): GeneratedMeal {
  const ids = products.map(({ id }) => id);
  const preparation =
    template === "readyMeal"
      ? {
          name: "Simple ready meal with vegetables",
          steps: [
            { instruction: "Prepare the ready meal and listed vegetables as needed.", productIds: ids, pantryItems: [] },
            { instruction: "Warm the ready meal and cook the vegetables until ready.", productIds: ids, pantryItems: [] },
            { instruction: "Combine the prepared components and serve.", productIds: ids, pantryItems: [] },
          ],
        }
      : template === "pasta"
      ? {
          name: "Simple savory pasta",
          steps: [
            { instruction: "Prepare the listed products and cook the assigned pasta with water.", productIds: ids, pantryItems: ["water" as const] },
            { instruction: "Cook the protein and vegetables, then combine all assigned products.", productIds: ids, pantryItems: [] },
            { instruction: "Season the combined dish with salt and black pepper, then serve.", productIds: ids, pantryItems: ["salt" as const, "black pepper" as const] },
          ],
        }
      : template === "riceBowl" || template === "couscousBowl"
        ? {
            name: "Simple savory grain bowl",
            steps: [
              { instruction: "Prepare the assigned products and cook the selected grain with water.", productIds: ids, pantryItems: ["water" as const] },
              { instruction: "Cook the protein and vegetables, then combine all assigned products.", productIds: ids, pantryItems: [] },
              { instruction: "Season the bowl with salt and black pepper, then serve.", productIds: ids, pantryItems: ["salt" as const, "black pepper" as const] },
            ],
          }
        : {
            name: "Simple protein and vegetables",
            steps: [
              { instruction: "Prepare and cook the assigned protein with the listed products.", productIds: ids, pantryItems: [] },
              { instruction: "Cook or warm the assigned vegetables and base, then combine all products.", productIds: ids, pantryItems: [] },
              { instruction: "Season with salt and black pepper, then serve the meal warm.", productIds: ids, pantryItems: ["salt" as const, "black pepper" as const] },
            ],
          };

  return {
    name: preparation.name,
    prepTimeMinutes: FALLBACK_PREP_TIME_MINUTES,
    servings: FALLBACK_SERVINGS,
    ingredients: products.map(ingredientFor),
    pantryItems: template === "pasta" || template === "riceBowl" || template === "couscousBowl"
      ? ["water", "salt", "black pepper"]
      : ["salt", "black pepper"],
    steps: preparation.steps,
  };
}

export function generateFallbackWeeklyPlan(
  candidates: readonly CatalogProduct[],
  budget: number,
  dayAssignments: readonly SavoryDayAssignment[],
  expectedSelection: ExpectedWeeklySelection,
): WeeklyPlan | null {
  if (
    !Number.isFinite(budget) ||
    budget <= 0 ||
    dayAssignments.length !== DAY_COUNT
  ) {
    return null;
  }

  const productMap = new Map(candidates.map((product) => [product.id, product]));

  const days = Array.from({ length: DAY_COUNT }, (_, dayIndex): GeneratedDayPlan => {
    const assignment = dayAssignments[dayIndex]!;
    if (assignment.dayIndex !== dayIndex) {
      throw new Error(`Fallback day ${dayIndex} is out of order.`);
    }
    const productIds = assignment.productIds;
    if (productIds.length === 0 || productIds.length > 8) {
      throw new Error(`Fallback day ${dayIndex} has an invalid product count.`);
    }
    const products = productIds.map((productId) => {
      const product = productMap.get(productId);
      if (!product) {
        throw new Error(`Fallback product ${productId} is unavailable.`);
      }
      return product;
    });

    return {
      dayIndex,
      primaryMeal: fallbackMeal(products, assignment.template),
    };
  });

  const generatedPlan: GeneratedWeeklyPlan = {
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

  return validateAndEnrichWeeklyPlan(
    generatedPlan,
    candidates,
    budget,
    "fallback",
    expectedSelection,
  );
}
