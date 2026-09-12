import { describe, expect, it } from "vitest";

import {
  buildRandomCandidateMenu,
  buildRandomCandidateMenuWithRecovery,
  CandidateSelectionValidationError,
  validateSelectedCandidateMenu,
} from "../src/services/llmCandidateSelection";
import {
  selectWeeklyProductBasket,
  validateSavoryDayAssignments,
} from "../src/services/weeklyProductBasket";
import { templateForMealProducts } from "../src/data/mealProductClassification";
import { catalogProduct } from "./mealPlanFixtures";

function savoryProduct(
  id: string,
  categoryId: string,
  price = 1,
) {
  const product = catalogProduct(id, price, categoryId);
  product.department = {
    id:
      categoryId === "en:pastas" ||
      categoryId === "en:rices" ||
      categoryId === "en:couscous"
        ? "pasta-riso"
        : "dispensa",
    name: "Savory",
  };
  product.category = { id: categoryId, name: categoryId };
  return product;
}

function coherentCatalog() {
  return [
    savoryProduct("chicken", "en:poultries", 2),
    savoryProduct("beef", "en:meats", 2),
    savoryProduct("tuna", "en:fishes", 2),
    savoryProduct("tofu", "en:meat-alternatives", 2),
    savoryProduct("eggs", "en:eggs", 2),
    savoryProduct("beans", "en:legumes", 1),
    savoryProduct("lentils", "en:legumes", 1),
    savoryProduct("cheese", "en:cheeses", 1),
    savoryProduct("pasta", "en:pastas", 1),
    savoryProduct("rice", "en:rices", 1),
    savoryProduct("couscous", "en:couscous", 1),
    savoryProduct("bread", "en:breads", 1),
    savoryProduct("salad", "en:salads", 1),
    savoryProduct("vegetables", "en:vegetables", 1),
    savoryProduct("frozen-vegetables", "en:frozen-vegetables", 1),
    savoryProduct("tomato-sauce", "en:tomato-sauces", 1),
    ...Array.from({ length: 7 }, (_, index) =>
      savoryProduct(`extra-vegetables-${index}`, "en:vegetables", 0.1),
    ),
    ...Array.from({ length: 3 }, (_, index) =>
      savoryProduct(`extra-sauce-${index}`, "en:tomato-sauces", 0.1),
    ),
  ];
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(state, 1_664_525) + 1_013_904_223;
    return (state >>> 0) / 4_294_967_296;
  };
}

function largeCoherentCatalog() {
  const categories = [
    "en:poultries", "en:meats", "en:fishes", "en:meat-alternatives", "en:eggs",
    "en:pastas", "en:rices", "en:couscous", "en:breads",
    "en:vegetables", "en:salads", "en:frozen-vegetables",
    "en:tomato-sauces", "en:sauces", "en:condiments", "en:spices",
  ];
  return Array.from({ length: 160 }, (_, index) =>
    savoryProduct(`large-${index}`, categories[index % categories.length]!, 0.5 + (index % 9) * 0.4),
  );
}

describe("weekly savory product basket", () => {
  it("builds seven coherent, distinct savory day assignments within budget", () => {
    const catalog = coherentCatalog();
    const basket = selectWeeklyProductBasket(catalog, 30, () => 0.25);

    expect(basket).not.toBeNull();
    expect(basket?.dayAssignments).toHaveLength(7);
    expect(basket?.spend).toBeLessThanOrEqual(30);
    validateSavoryDayAssignments(basket!.dayAssignments, basket!.products);

    const productMap = new Map(catalog.map((product) => [product.id, product]));
    expect(
      basket?.dayAssignments.every((assignment) => {
        const products = assignment.productIds.map((id) => productMap.get(id)!);
        return templateForMealProducts(products) === assignment.template;
      }),
    ).toBe(true);
    expect(
      new Set(
        basket?.dayAssignments.map(({ productIds }) => [...productIds].sort().join("|")),
      ).size,
    ).toBe(7);
    expect(basket!.dayAssignments.flatMap(({ productIds }) => productIds).length).toBeGreaterThanOrEqual(
      basket!.productIds.length,
    );
    expect(
      new Set(basket?.dayAssignments.flatMap(({ productIds }) => productIds)).size,
    ).toBe(basket!.productIds.length);
  });

  it("does not require spending ninety percent of the budget", () => {
    const basket = selectWeeklyProductBasket(coherentCatalog(), 100, () => 0.25);

    expect(basket).not.toBeNull();
    expect(basket!.spend).toBeLessThan(90);
    expect(basket!.spend).toBeLessThanOrEqual(100);
  });

  it("returns no basket when a coherent savory meal cannot be formed", () => {
    expect(
      selectWeeklyProductBasket(
        [savoryProduct("chicken", "en:poultries", 2)],
        10,
      ),
    ).toBeNull();
    expect(
      selectWeeklyProductBasket(
        [catalogProduct("cake", 1, "en:cakes")],
        10,
      ),
    ).toBeNull();
  });

  it("rejects a seafood and dairy assignment instead of forcing it into a day", () => {
    const fish = savoryProduct("fish", "en:fishes");
    const cheese = savoryProduct("cheese", "en:cheeses");
    const pasta = savoryProduct("pasta", "en:pastas");
    const candidates = [fish, cheese, pasta];
    const assignments = Array.from({ length: 7 }, (_, dayIndex) => ({
      dayIndex,
      productIds: ["fish", "cheese", "pasta"],
      template: "pasta" as const,
    }));

    expect(() => validateSavoryDayAssignments(assignments, candidates)).toThrow(
      "coherent classic meal",
    );
  });

  it("builds reproducible but materially different candidate memberships for different seeds", () => {
    const catalog = coherentCatalog();
    const menu = buildRandomCandidateMenu(catalog, 30, () => 0.31);
    const basket = selectWeeklyProductBasket(catalog, 30, () => 0.25)!;

    expect(menu).toHaveLength(catalog.length);
    expect(new Set(menu.map(({ product }) => product.id)).size).toBe(menu.length);
    expect(buildRandomCandidateMenu(catalog, 30, () => 0.73).map(({ product }) => product.id))
      .not.toEqual(menu.map(({ product }) => product.id));

    const selected = validateSelectedCandidateMenu(
      { days: basket.dayAssignments.map(({ dayIndex, productIds }) => ({ dayIndex, productIds: [...productIds] })) },
      menu,
      30,
    );
    expect(selected.spend).toBeLessThanOrEqual(30);
    expect(selected.dayAssignments).toHaveLength(7);
  });

  it("normalizes unordered days and harmless repeated references before validation", () => {
    const catalog = coherentCatalog();
    const menu = buildRandomCandidateMenu(catalog, 30, () => 0.31);
    const basket = selectWeeklyProductBasket(catalog, 30, () => 0.25)!;
    const repeated = basket.dayAssignments.map(({ dayIndex, productIds }) => ({
      dayIndex,
      productIds: dayIndex === 0 ? [...productIds, productIds[0]!] : [...productIds],
    })).reverse();

    const selected = validateSelectedCandidateMenu({ days: repeated }, menu, 30);

    expect(selected.dayAssignments.map(({ dayIndex }) => dayIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(selected.normalizations).toEqual(expect.arrayContaining([
      "sorted_days",
      "deduplicated_product_references",
    ]));
  });

  it("rejects missing or duplicated day indexes with a safe validation code", () => {
    const catalog = coherentCatalog();
    const menu = buildRandomCandidateMenu(catalog, 30, () => 0.31);
    const basket = selectWeeklyProductBasket(catalog, 30, () => 0.25)!;
    const days = basket.dayAssignments.map(({ dayIndex, productIds }) => ({ dayIndex, productIds }));
    days[6] = { ...days[6]!, dayIndex: 5 };

    try {
      validateSelectedCandidateMenu({ days }, menu, 30);
      throw new Error("Expected candidate selection to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(CandidateSelectionValidationError);
      expect((error as CandidateSelectionValidationError).code).toBe("invalid_day_index_set");
      expect((error as CandidateSelectionValidationError).path).toBe("days");
    }
  });

  it("rejects duplicates when deduplication leaves too few products", () => {
    const catalog = coherentCatalog();
    const menu = buildRandomCandidateMenu(catalog, 30, () => 0.31);
    const basket = selectWeeklyProductBasket(catalog, 30, () => 0.25)!;
    const days = basket.dayAssignments.map(({ dayIndex, productIds }) => ({ dayIndex, productIds: [...productIds] }));
    days[0]!.productIds = [days[0]!.productIds[0]!, days[0]!.productIds[0]!];

    expect(() => validateSelectedCandidateMenu({ days }, menu, 30)).toThrow(
      CandidateSelectionValidationError,
    );
    try {
      validateSelectedCandidateMenu({ days }, menu, 30);
    } catch (error) {
      expect((error as CandidateSelectionValidationError).code).toBe("duplicate_product_reference");
    }
  });

  it("reports the specific composition rule without exposing selected products", () => {
    const catalog = coherentCatalog();
    const menu = buildRandomCandidateMenu(catalog, 30, () => 0.31);
    const basket = selectWeeklyProductBasket(catalog, 30, () => 0.25)!;
    const selectedDays = () => basket.dayAssignments.map(({ dayIndex, productIds }) => ({ dayIndex, productIds: [...productIds] }));
    const cases = [
      { ids: ["salad", "vegetables", "frozen-vegetables"], code: "missing_protein" },
      { ids: ["chicken", "beef", "salad"], code: "multiple_proteins" },
      { ids: ["tuna", "cheese", "salad"], code: "incompatible_pair" },
      { ids: ["chicken", "pasta", "tomato-sauce"], code: "missing_vegetable" },
    ] as const;

    cases.forEach(({ ids, code }) => {
      const days = selectedDays();
      days[0]!.productIds = [...ids];
      try {
        validateSelectedCandidateMenu({ days }, menu, 30);
        throw new Error("Expected candidate selection to fail.");
      } catch (error) {
        expect(error).toBeInstanceOf(CandidateSelectionValidationError);
        expect((error as CandidateSelectionValidationError).code).toBe(code);
        expect((error as CandidateSelectionValidationError).path).toBe("days[0]");
      }
    });
  });

  it("varies the one-hundred-twenty-product membership, not only its order", () => {
    const catalog = largeCoherentCatalog();
    const first = buildRandomCandidateMenu(catalog, 30, seededRandom(11));
    const repeated = buildRandomCandidateMenu(catalog, 30, seededRandom(11));
    const second = buildRandomCandidateMenu(catalog, 30, seededRandom(97));

    expect(first).toHaveLength(120);
    expect(first.map(({ product }) => product.id)).toEqual(
      repeated.map(({ product }) => product.id),
    );
    expect(new Set(first.map(({ product }) => product.id))).not.toEqual(
      new Set(second.map(({ product }) => product.id)),
    );
  });

  it("reserves a valid randomized recovery basket inside the sampled menu", () => {
    const catalog = largeCoherentCatalog();
    const first = buildRandomCandidateMenuWithRecovery(catalog, 30, seededRandom(11));
    const repeated = buildRandomCandidateMenuWithRecovery(catalog, 30, seededRandom(11));
    const second = buildRandomCandidateMenuWithRecovery(catalog, 30, seededRandom(97));

    expect(first).not.toBeNull();
    expect(repeated).not.toBeNull();
    expect(second).not.toBeNull();
    const firstMenuIds = new Set(first!.candidates.map(({ product }) => product.id));
    expect(first!.recoveryBasket.productIds.every((id) => firstMenuIds.has(id))).toBe(true);
    expect(first!.recoveryBasket.spend).toBeLessThanOrEqual(30);
    expect(first!.recoveryBasket.dayAssignments).toEqual(repeated!.recoveryBasket.dayAssignments);
    expect(first!.recoveryBasket.dayAssignments).not.toEqual(second!.recoveryBasket.dayAssignments);
    const secondMenuIds = new Set(second!.candidates.map(({ product }) => product.id));
    const overlap = [...firstMenuIds].filter((id) => secondMenuIds.has(id)).length;
    expect(overlap / firstMenuIds.size).toBeLessThan(0.8);
  });
});
