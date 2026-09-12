import { describe, expect, it } from "vitest";

import { calculatePackageUseTotal } from "../src/services/weeklyPlanPricing";
import { catalogProduct } from "./mealPlanFixtures";

function product(id: string, price: number, category: string) {
  const value = catalogProduct(id, price, category);
  value.category = { id: category, name: category };
  return value;
}

describe("weekly package-use pricing", () => {
  it("counts ordinary products once for each day and staples once per week", () => {
    const chicken = product("chicken", 4, "en:poultries");
    const rice = product("rice", 2, "en:rices");
    const sauce = product("sauce", 3, "en:tomato-sauces");
    expect(calculatePackageUseTotal([["chicken", "rice", "sauce"], ["chicken", "rice", "sauce"]], [chicken, rice, sauce])).toBe(13);
  });

  it("counts bread and dairy per day", () => {
    const bread = product("bread", 2, "en:breads");
    const cheese = product("cheese", 3, "en:cheeses");
    expect(calculatePackageUseTotal([["bread", "cheese"], ["bread", "cheese"]], [bread, cheese])).toBe(10);
  });
});
