import type { PantryItem } from "./generatedMealPlan";

export type Money = {
  amount: number;
  currency: "EUR";
};

export type Ingredient = {
  productId: string;
  name: string;
  quantity: string;
  packagePrice: Money;
};

export type RecipeStep = {
  instruction: string;
  productIds: string[];
  ingredientNames: string[];
  pantryItems: PantryItem[];
};

export type Meal = {
  id: string;
  name: string;
  prepTimeMinutes: number;
  servings: number;
  estimatedPrice: Money;
  ingredients: Ingredient[];
  pantryItems: PantryItem[];
  steps: RecipeStep[];
};

export type MealAlternates = [Meal | null, Meal | null];

export type DayPlan = {
  dayIndex: number;
  primaryMeal: Meal;
  alternates: MealAlternates;
};

export type SevenDayPlans = [
  DayPlan,
  DayPlan,
  DayPlan,
  DayPlan,
  DayPlan,
  DayPlan,
  DayPlan,
];

export type WeeklyPlan = {
  days: SevenDayPlans;
  estimatedTotal: Money;
  source: "openai" | "fallback";
  /** Filtered session pool retained for on-demand, different-product alternatives. */
  alternativeCandidateProductIds: string[];
};
