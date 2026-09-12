export const MIN_BUDGET = 25;
export const MAX_BUDGET = 150;
export const BUDGET_STEP = 5;
export const DEFAULT_BUDGET = 80;

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function snapBudget(value: number): number {
  return clamp(
    Math.round(value / BUDGET_STEP) * BUDGET_STEP,
    MIN_BUDGET,
    MAX_BUDGET,
  );
}
