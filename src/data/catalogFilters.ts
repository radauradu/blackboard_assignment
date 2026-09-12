import type { CatalogProduct } from "../types/catalog";
import type { DietaryNeed, NutritionalGoal } from "../types/flow";

export const NUTRITION_THRESHOLDS = {
  highProteinGrams100g: 12,
  lowCalorieKcal100g: 150,
  lowCarbohydratesGrams100g: 10,
  lowSaltGrams100g: 0.3,
  balancedProteinGrams100g: 5,
  balancedNutriScores: ["a", "b"],
} as const;

export const DEFAULT_CANDIDATE_LIMIT = 120;

const LABEL_IDS = {
  vegetarian: "en:vegetarian",
  vegan: "en:vegan",
} as const;

const ALLERGEN_IDS = {
  lactoseFree: "en:milk",
  glutenFree: "en:gluten",
} as const;

const FISH_CLASSIFICATIONS = {
  categoryIds: ["en:fishes", "en:canned-fishes"],
  categoryNames: ["fish", "canned fish"],
  departmentIds: ["pesce"],
  departmentNames: ["fish"],
} as const;

export type CatalogFilterOptions = {
  dietaryNeeds?: readonly DietaryNeed[];
  nutritionalGoal?: NutritionalGoal | null;
};

function hasReference(
  references: CatalogProduct["labels"] | CatalogProduct["allergens"],
  id: string,
): boolean {
  return references.some((reference) => reference.id === id);
}

function hasClassification(
  reference: CatalogProduct["department"] | CatalogProduct["category"],
  ids: readonly string[],
  names: readonly string[],
): boolean {
  if (reference === null) {
    return false;
  }

  return (
    ids.includes(reference.id) ||
    names.includes(reference.name.trim().toLowerCase())
  );
}

function hasPescatarianClassification(product: CatalogProduct): boolean {
  return (
    hasReference(product.labels, LABEL_IDS.vegetarian) ||
    hasReference(product.labels, LABEL_IDS.vegan) ||
    hasClassification(
      product.department,
      FISH_CLASSIFICATIONS.departmentIds,
      FISH_CLASSIFICATIONS.departmentNames,
    ) ||
    hasClassification(
      product.category,
      FISH_CLASSIFICATIONS.categoryIds,
      FISH_CLASSIFICATIONS.categoryNames,
    )
  );
}

export function matchesDietaryNeed(
  product: CatalogProduct,
  need: DietaryNeed,
): boolean {
  switch (need) {
    case "vegetarian":
      return (
        hasReference(product.labels, LABEL_IDS.vegetarian) ||
        hasReference(product.labels, LABEL_IDS.vegan)
      );
    case "vegan":
      return hasReference(product.labels, LABEL_IDS.vegan);
    case "pescatarian":
      return hasPescatarianClassification(product);
    case "lactoseFree":
      return !hasReference(product.allergens, ALLERGEN_IDS.lactoseFree);
    case "glutenFree":
      return !hasReference(product.allergens, ALLERGEN_IDS.glutenFree);
  }
}

export function matchesNutritionalGoal(
  product: CatalogProduct,
  goal: NutritionalGoal,
): boolean {
  const {
    carbohydrates100g,
    energyKcal100g,
    proteins100g,
    salt100g,
  } = product.nutrition;

  switch (goal) {
    case "highProtein":
      return (
        proteins100g !== null &&
        proteins100g >= NUTRITION_THRESHOLDS.highProteinGrams100g
      );
    case "lowCalorie":
      return (
        energyKcal100g !== null &&
        energyKcal100g <= NUTRITION_THRESHOLDS.lowCalorieKcal100g
      );
    case "lowCarbs":
      return (
        carbohydrates100g !== null &&
        carbohydrates100g <= NUTRITION_THRESHOLDS.lowCarbohydratesGrams100g
      );
    case "lowSalt":
      return (
        salt100g !== null && salt100g <= NUTRITION_THRESHOLDS.lowSaltGrams100g
      );
    case "balanced":
      return (
        product.nutriScore !== null &&
        NUTRITION_THRESHOLDS.balancedNutriScores.some(
          (score) => score === product.nutriScore,
        ) &&
        proteins100g !== null &&
        proteins100g >= NUTRITION_THRESHOLDS.balancedProteinGrams100g
      );
  }
}

export function filterCatalogProducts(
  products: readonly CatalogProduct[],
  {
    dietaryNeeds = [],
    nutritionalGoal = null,
  }: CatalogFilterOptions = {},
): CatalogProduct[] {
  return products.filter(
    (product) =>
      dietaryNeeds.every((need) => matchesDietaryNeed(product, need)) &&
      (nutritionalGoal === null ||
        matchesNutritionalGoal(product, nutritionalGoal)),
  );
}

function candidateBucketKey(product: CatalogProduct): string {
  return product.category?.id ?? `department:${product.department.id}`;
}

export function selectCategoryDiverseCandidates(
  products: readonly CatalogProduct[],
  limit = DEFAULT_CANDIDATE_LIMIT,
): CatalogProduct[] {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError("Candidate limit must be a non-negative integer.");
  }

  const buckets = new Map<string, CatalogProduct[]>();

  for (const product of products) {
    const key = candidateBucketKey(product);
    const bucket = buckets.get(key) ?? [];
    bucket.push(product);
    buckets.set(key, bucket);
  }

  const queues = [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, bucket]) =>
      [...bucket].sort(
        (left, right) =>
          left.price.amount - right.price.amount ||
          left.id.localeCompare(right.id),
      ),
    );

  const candidates: CatalogProduct[] = [];
  let queueIndex = 0;

  while (candidates.length < limit && queues.length > 0) {
    if (queueIndex >= queues.length) {
      queueIndex = 0;
    }

    const queue = queues[queueIndex];
    const product = queue?.shift();

    if (product) {
      candidates.push(product);
    }

    if (!queue || queue.length === 0) {
      queues.splice(queueIndex, 1);
    } else {
      queueIndex += 1;
    }
  }

  return candidates;
}

export function buildCatalogCandidatePool(
  products: readonly CatalogProduct[],
  options: CatalogFilterOptions = {},
  limit = DEFAULT_CANDIDATE_LIMIT,
): CatalogProduct[] {
  return selectCategoryDiverseCandidates(
    filterCatalogProducts(products, options),
    limit,
  );
}
