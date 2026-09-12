export type GeneratedIngredient = {
  productId: string;
  quantity: {
    amount: number;
    unit: "g" | "kg" | "ml" | "l" | "piece" | "can" | "pack" | "bar" | "tbsp" | "tsp" | "cup";
  };
};

export type PantryItem = "water" | "salt" | "black pepper" | "olive oil";

export type GeneratedRecipeStep = {
  instruction: string;
  productIds: string[];
  pantryItems: PantryItem[];
};

export type GeneratedMeal = {
  name: string;
  prepTimeMinutes: number;
  servings: number;
  ingredients: GeneratedIngredient[];
  pantryItems: PantryItem[];
  steps: GeneratedRecipeStep[];
};

export type GeneratedDayPlan = {
  dayIndex: number;
  primaryMeal: GeneratedMeal;
};

export type GeneratedWeeklyPlan = {
  days: [
    GeneratedDayPlan,
    GeneratedDayPlan,
    GeneratedDayPlan,
    GeneratedDayPlan,
    GeneratedDayPlan,
    GeneratedDayPlan,
    GeneratedDayPlan,
  ];
};
