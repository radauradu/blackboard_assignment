import { create } from "zustand";

import type { FlowState, FlowStore } from "../types/flow";

export const initialFlowState: FlowState = {
  budget: null,
  dietaryNeeds: [],
  dietaryChoiceMade: false,
  nutritionalGoal: null,
  nutritionalGoalChoiceMade: false,
  generationStatus: "idle",
  generationError: null,
  generationMessage: null,
  generationProgress: null,
  weeklyPlan: null,
  previousPrimaryProductIds: [],
};

export const useFlowStore = create<FlowStore>((set) => ({
  ...initialFlowState,
  setBudget: (budget) => set({ budget }),
  toggleDietaryNeed: (need) =>
    set((state) => {
      const dietaryNeeds = state.dietaryNeeds.includes(need)
        ? state.dietaryNeeds.filter((selected) => selected !== need)
        : [...state.dietaryNeeds, need];

      return {
        dietaryNeeds,
        dietaryChoiceMade: dietaryNeeds.length > 0,
      };
    }),
  chooseNoDietaryNeeds: () =>
    set({ dietaryChoiceMade: true, dietaryNeeds: [] }),
  setNutritionalGoal: (nutritionalGoal) =>
    set({ nutritionalGoal, nutritionalGoalChoiceMade: true }),
  chooseNoNutritionalGoal: () =>
    set({ nutritionalGoal: null, nutritionalGoalChoiceMade: true }),
  setGenerationStatus: (generationStatus, generationError = null) =>
    set({
      generationStatus,
      generationError,
      ...(generationStatus === "error"
        ? { generationMessage: null, generationProgress: null }
        : {}),
    }),
  setGenerationMessage: (generationMessage) => set({ generationMessage }),
  setGenerationProgress: (generationProgress) => set({ generationProgress }),
  setWeeklyPlan: (weeklyPlan) =>
    set({
      weeklyPlan,
      generationStatus: weeklyPlan ? "success" : "idle",
      generationError: null,
      generationMessage: null,
      generationProgress: null,
    }),
  beginMealPlanGeneration: () => set((state) => ({
    previousPrimaryProductIds: state.weeklyPlan
      ? [...new Set(state.weeklyPlan.days.flatMap((day) => day.primaryMeal.ingredients.map(({ productId }) => productId)))]
      : state.previousPrimaryProductIds,
    weeklyPlan: null,
    generationStatus: "idle",
    generationError: null,
  })),
  setAlternative: (dayIndex, slot, meal) => set((state) => {
    if (!state.weeklyPlan) return state;
    const days = state.weeklyPlan.days.map((day) => {
      if (day.dayIndex !== dayIndex) return day;
      const alternates = [...day.alternates] as [typeof meal | null, typeof meal | null];
      alternates[slot] = meal;
      return { ...day, alternates };
    }) as typeof state.weeklyPlan.days;
    return { weeklyPlan: { ...state.weeklyPlan, days } };
  }),
  reset: () => set(initialFlowState),
}));
