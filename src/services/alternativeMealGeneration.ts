import type { CatalogProduct } from "../types/catalog";
import type { DietaryNeed, NutritionalGoal } from "../types/flow";
import type { Meal } from "../types/mealPlan";
import { canCombineMealProducts, isClassicSavoryMealProduct, savoryMealProductProfile, templateForMealProducts } from "../data/mealProductClassification";
import {
  requestOpenAiMealPlan,
  requestOpenAiMealPlanStream,
  supportsResponseStreaming,
  type MealPlanFetcher,
} from "./openAiMealPlan";
import { cleanRecipeText } from "./mealPlanValidation";

export type GenerateAlternativeMealInput = {
  apiKey: string | null;
  dayIndex: number;
  primaryMeal: Meal;
  candidates: readonly CatalogProduct[];
  excludedProductIds?: readonly string[];
  dietaryNeeds: readonly DietaryNeed[];
  nutritionalGoal: NutritionalGoal | null;
  fetcher?: MealPlanFetcher;
  streamingSupported?: boolean;
};

export async function generateAlternativeMeal({
  apiKey,
  dayIndex,
  primaryMeal,
  candidates,
  excludedProductIds = [],
  dietaryNeeds,
  nutritionalGoal,
  fetcher,
  streamingSupported = supportsResponseStreaming(),
}: GenerateAlternativeMealInput): Promise<Meal> {
  if (!apiKey) {
    throw new Error("An OpenAI API key is required to generate an alternative.");
  }
  const excluded = new Set(excludedProductIds);
  const available = candidates.filter(({ id }) => !excluded.has(id));
  const byRole = (role: "protein" | "produce" | "base" | "support") => available
    .filter((product) => savoryMealProductProfile(product)?.role === role && isClassicSavoryMealProduct(product))
    .sort(() => Math.random() - 0.5);
  const products: CatalogProduct[] = [];
  const addCompatible = (options: readonly CatalogProduct[]) => {
    const product = options.find((candidate) => !products.some(({ id }) => id === candidate.id) && products.every((current) => canCombineMealProducts(current, candidate)));
    if (product) products.push(product);
  };
  addCompatible(byRole("protein"));
  addCompatible(byRole("produce"));
  addCompatible(byRole("base"));
  if (products.length < 3) addCompatible(byRole("produce"));
  if (products.length < 3) addCompatible(byRole("support"));
  if (products.length < 3) throw new Error("No different ingredient combination is available.");
  addCompatible(byRole("produce"));
  addCompatible(byRole("support"));
  const productIds = products.map(({ id }) => id);
  const mealTemplate = templateForMealProducts(products);
  const request = {
    apiKey,
    dayIndexes: [dayIndex],
    dayPrimaryProductIds: [productIds],
    dayMealTemplates: [mealTemplate ?? "proteinAndVegetables"],
    candidates: products,
    dietaryNeeds,
    nutritionalGoal,
    ...(fetcher ? { fetcher } : {}),
  };
  const response = streamingSupported
    ? await requestOpenAiMealPlanStream(request)
    : await requestOpenAiMealPlan(request);
  if (
    !response ||
    typeof response !== "object" ||
    !Array.isArray((response as { days?: unknown }).days)
  ) {
    throw new Error("Alternative generation returned an invalid response.");
  }
  const day = (response as { days: unknown[] }).days[0] as
    | { primaryMeal?: Partial<Meal> }
    | undefined;
  const generated = day?.primaryMeal;
  if (
    !generated ||
    typeof generated.name !== "string" ||
    !Array.isArray(generated.ingredients) ||
    generated.ingredients.length !== productIds.length ||
    new Set(
      generated.ingredients.map((ingredient) =>
        typeof ingredient === "object" && ingredient
          ? (ingredient as { productId?: unknown }).productId
          : undefined,
      ),
    ).size !== productIds.length
  ) {
    throw new Error("Alternative generation did not use the selected ingredients.");
  }
  const returnedIds = generated.ingredients.map(
    (ingredient) => (ingredient as { productId: string }).productId,
  );
  if (returnedIds.some((productId) => !productIds.includes(productId)) || returnedIds.some((productId) => excluded.has(productId))) {
    throw new Error("Alternative generation used an unassigned product.");
  }

  const steps = Array.isArray(generated.steps)
    ? generated.steps.flatMap((step) => {
        if (!step || typeof step !== "object") return [];
        const value = step as { instruction?: unknown; productIds?: unknown; pantryItems?: unknown };
        if (typeof value.instruction !== "string" || !Array.isArray(value.productIds) || !value.productIds.every((id) => typeof id === "string" && productIds.includes(id))) return [];
        const ids = value.productIds as string[];
        const pantryItems = Array.isArray(value.pantryItems)
          ? value.pantryItems.filter((item): item is Meal["pantryItems"][number] => typeof item === "string" && ["water", "salt", "black pepper", "olive oil"].includes(item))
          : [];
        if (pantryItems.length !== (Array.isArray(value.pantryItems) ? value.pantryItems.length : 0)) return [];
        return [{ instruction: cleanRecipeText(value.instruction), productIds: ids, ingredientNames: ids.map((id) => products.find((product) => product.id === id)?.name ?? id), pantryItems }];
      })
    : [];
  const coveredIds = new Set(steps.flatMap((step) => step.productIds));
  if (steps.length < 2 || productIds.some((productId) => !coveredIds.has(productId))) {
    throw new Error("Alternative generation did not ground every selected ingredient.");
  }

  return {
    id: `${primaryMeal.id}-alternative-${Date.now()}`,
    name: cleanRecipeText(generated.name),
    prepTimeMinutes:
      typeof generated.prepTimeMinutes === "number"
        ? generated.prepTimeMinutes
      : primaryMeal.prepTimeMinutes,
    servings:
      typeof generated.servings === "number"
        ? generated.servings
      : primaryMeal.servings,
    pantryItems: Array.isArray(generated.pantryItems)
      ? (generated.pantryItems as Meal["pantryItems"])
      : [],
    estimatedPrice: {
      amount: products.reduce((total, product) => total + product.price.amount, 0),
      currency: "EUR" as const,
    },
    ingredients: products.map((product) => {
      const generatedIngredient = generated.ingredients?.find(
        (candidate) =>
          typeof candidate === "object" &&
          candidate !== null &&
          (candidate as { productId?: unknown }).productId === product.id,
      ) as { quantity?: { amount?: unknown; unit?: unknown } } | undefined;
      return {
        productId: product.id,
        name: product.name,
        packagePrice: { amount: product.price.amount, currency: "EUR" as const },
        quantity:
          typeof generatedIngredient?.quantity?.amount === "number" &&
          typeof generatedIngredient.quantity.unit === "string"
            ? `${generatedIngredient.quantity.amount} ${generatedIngredient.quantity.unit}`
            : product.quantity ?? "1 package",
      };
    }),
    steps,
  };
}
