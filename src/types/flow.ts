import type { WeeklyPlan } from "./mealPlan";

export const DIETARY_NEEDS = [
  "vegetarian",
  "vegan",
  "pescatarian",
  "lactoseFree",
  "glutenFree",
] as const;

export type DietaryNeed = (typeof DIETARY_NEEDS)[number];

export const NUTRITIONAL_GOALS = [
  "highProtein",
  "lowCalorie",
  "balanced",
  "lowCarbs",
  "lowSalt",
] as const;

export type NutritionalGoal = (typeof NUTRITIONAL_GOALS)[number];

export type GenerationStatus = "idle" | "loading" | "success" | "error";

export type FlowState = {
  budget: number | null;
  dietaryNeeds: DietaryNeed[];
  dietaryChoiceMade: boolean;
  nutritionalGoal: NutritionalGoal | null;
  nutritionalGoalChoiceMade: boolean;
  generationStatus: GenerationStatus;
  generationError: string | null;
  generationMessage: string | null;
  generationProgress: number | null;
  weeklyPlan: WeeklyPlan | null;
  previousPrimaryProductIds: string[];
};

export type FlowActions = {
  setBudget: (budget: number) => void;
  toggleDietaryNeed: (need: DietaryNeed) => void;
  chooseNoDietaryNeeds: () => void;
  setNutritionalGoal: (goal: NutritionalGoal) => void;
  chooseNoNutritionalGoal: () => void;
  setGenerationStatus: (
    status: GenerationStatus,
    error?: string | null,
  ) => void;
  setGenerationMessage: (message: string | null) => void;
  setGenerationProgress: (progress: number | null) => void;
  setWeeklyPlan: (plan: WeeklyPlan | null) => void;
  beginMealPlanGeneration: () => void;
  setAlternative: (dayIndex: number, slot: 0 | 1, meal: import("./mealPlan").Meal) => void;
  reset: () => void;
};

export type FlowStore = FlowState & FlowActions;
