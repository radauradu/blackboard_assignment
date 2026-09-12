import { describe, expect, it } from "vitest";

import {
  BUDGET_STEP,
  DEFAULT_BUDGET,
  MAX_BUDGET,
  MIN_BUDGET,
  snapBudget,
} from "../src/utils/budget";

describe("weekly budget", () => {
  it("uses the €25–€150 range in €5 increments", () => {
    expect(MIN_BUDGET).toBe(25);
    expect(MAX_BUDGET).toBe(150);
    expect(BUDGET_STEP).toBe(5);
    expect(DEFAULT_BUDGET).toBe(80);
  });

  it("snaps values to the closest permitted budget and clamps the ends", () => {
    expect(snapBudget(82)).toBe(80);
    expect(snapBudget(83)).toBe(85);
    expect(snapBudget(0)).toBe(25);
    expect(snapBudget(999)).toBe(150);
  });
});
