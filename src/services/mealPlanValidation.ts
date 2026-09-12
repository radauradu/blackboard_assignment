import type { CatalogProduct } from "../types/catalog";
import type {
  GeneratedDayPlan,
  GeneratedIngredient,
  GeneratedMeal,
  GeneratedRecipeStep,
  GeneratedWeeklyPlan,
  PantryItem,
} from "../types/generatedMealPlan";
import type {
  DayPlan,
  Meal,
  SevenDayPlans,
  WeeklyPlan,
} from "../types/mealPlan";
import {
  amountToCents,
  centsToAmount,
  type ExpectedWeeklySelection,
  validateSavoryDayAssignments,
} from "./weeklyProductBasket";
import { templateForMealProducts, type MealTemplate } from "../data/mealProductClassification";
import { calculatePackageUseTotal } from "./weeklyPlanPricing";
import {
  hasUnassignedCatalogFoodMention,
  mentionedUnpurchasedPantryItems,
  PANTRY_ITEMS,
  recipeGroundingError,
  unassignedCatalogIngredientKind,
} from "./recipeGrounding";

const DAY_COUNT = 7;
const MIN_PREP_TIME_MINUTES = 5;
const MAX_PREP_TIME_MINUTES = 180;
const MIN_SERVINGS = 1;
const MAX_SERVINGS = 8;
const MIN_INGREDIENTS = 1;
const MAX_INGREDIENTS = 8;
const MIN_STEPS = 3;
const MAX_STEPS = 5;

export type MealPlanValidationCode =
  | "invalid_shape"
  | "invalid_field"
  | "duplicate_product"
  | "duplicate_step_product"
  | "duplicate_pantry"
  | "foreign_step_product"
  | "undeclared_step_pantry"
  | "missing_product_coverage"
  | "pantry_union_mismatch"
  | "assigned_product_mismatch"
  | "unknown_candidate_product"
  | "grounding_failure"
  | "grounding_undeclared_pantry"
  | "grounding_foreign_step_product"
  | "grounding_missing_product"
  | "grounding_unassigned_catalog_product"
  | "grounding_unassigned_staple"
  | "budget_mismatch"
  | "invalid_assignment";

function validationCode(message: string): MealPlanValidationCode {
  if (message.includes("must account for every assigned product")) return "missing_product_coverage";
  if (message.includes("step with an unassigned product ID")) return "foreign_step_product";
  if (message.includes("must be declared for the meal")) return "undeclared_step_pantry";
  if (message.includes("exactly the items used in steps")) return "pantry_union_mismatch";
  if (message.includes("must use exactly its assigned product IDs")) return "assigned_product_mismatch";
  if (message.includes("Unknown candidate product ID")) return "unknown_candidate_product";
  if (message.includes("duplicate product IDs")) return "duplicate_product";
  if (message.includes("productIds must be unique")) return "duplicate_step_product";
  if (message.includes("pantryItems contains duplicates")) return "duplicate_pantry";
  if (message.includes("assignment")) return "invalid_assignment";
  if (message.includes("mentions ") || message.includes("does not use every assigned product")) return "grounding_failure";
  if (message.includes("budget") || message.includes("total") || message.includes("spend")) return "budget_mismatch";
  return message.includes("must") || message.includes("contains") ? "invalid_field" : "invalid_shape";
}

function validationPath(message: string): string | null {
  const matched = message.match(/^(days\[\d+\](?:\.(?:primaryMeal|ingredients|steps|pantryItems|productIds|quantity|amount|unit|instruction)(?:\[\d+\])?)*)|^(plan|days)(?=\s|\.|$)/);
  return matched?.[0] ?? null;
}

export class MealPlanValidationError extends Error {
  readonly code: MealPlanValidationCode;
  readonly path: string | null;
  readonly safeDetail: "different_selected_product" | "generic_catalog_category" | null;

  constructor(message: string, code = validationCode(message), path = validationPath(message), safeDetail: "different_selected_product" | "generic_catalog_category" | null = null) {
    super(message);
    this.name = "MealPlanValidationError";
    this.code = code;
    this.path = path;
    this.safeDetail = safeDetail;
  }
}

export type RecipeRepairDiagnostic = {
  type:
    | "repaired_cross_day_product_name"
    | "repaired_unassigned_staple"
    | "repaired_foreign_step_product_reference";
  path: string;
};

function fail(
  message: string,
  code?: MealPlanValidationCode,
  path?: string | null,
  safeDetail?: "different_selected_product" | "generic_catalog_category" | null,
): never {
  throw new MealPlanValidationError(message, code, path, safeDetail);
}

function groundingValidationCode(message: string): MealPlanValidationCode {
  if (message.startsWith("mentions undeclared pantry item")) return "grounding_undeclared_pantry";
  if (message === "has a step with an unassigned product ID") return "grounding_foreign_step_product";
  if (message === "does not use every assigned product in a step") return "grounding_missing_product";
  if (message.startsWith("mentions unassigned catalog ingredient")) return "grounding_unassigned_catalog_product";
  if (message.startsWith("mentions unassigned catalog staple")) return "grounding_unassigned_staple";
  return "grounding_failure";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();

  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${path} has unexpected or missing fields.`);
  }
}

function requiredString(
  value: unknown,
  path: string,
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    fail(`${path} must be a string.`);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maximumLength) {
    fail(`${path} must contain 1-${maximumLength} characters.`);
  }

  return trimmed;
}

function requiredInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail(`${path} must be an integer between ${minimum} and ${maximum}.`);
  }

  return value;
}

function requiredArray(
  value: unknown,
  path: string,
  minimumLength: number,
  maximumLength: number,
): unknown[] {
  if (
    !Array.isArray(value) ||
    value.length < minimumLength ||
    value.length > maximumLength
  ) {
    fail(`${path} must contain ${minimumLength}-${maximumLength} items.`);
  }

  return value;
}

function parseIngredient(value: unknown, path: string): GeneratedIngredient {
  if (!isRecord(value)) {
    return fail(`${path} must be an object.`);
  }

  assertExactKeys(value, ["productId", "quantity"], path);
  if (!isRecord(value.quantity)) {
    return fail(`${path}.quantity must be an object.`);
  }
  assertExactKeys(value.quantity, ["amount", "unit"], `${path}.quantity`);
  const amount = value.quantity.amount;
  const unit = value.quantity.unit;
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 10000 ||
    typeof unit !== "string" ||
    !["g", "kg", "ml", "l", "piece", "can", "pack", "bar", "tbsp", "tsp", "cup"].includes(unit)
  ) {
    return fail(`${path}.quantity must contain a valid amount and unit.`);
  }

  return {
    productId: requiredString(value.productId, `${path}.productId`, 80),
    quantity: { amount, unit: unit as GeneratedIngredient["quantity"]["unit"] },
  };
}

function parseStep(value: unknown, path: string): GeneratedRecipeStep {
  if (!isRecord(value)) return fail(`${path} must be an object.`);
  assertExactKeys(value, ["instruction", "productIds", "pantryItems"], path);
  const productIds = requiredArray(value.productIds, `${path}.productIds`, 1, 5).map((id, index) => requiredString(id, `${path}.productIds[${index}]`, 80));
  if (new Set(productIds).size !== productIds.length) fail(`${path}.productIds must be unique.`);
  const pantryItems = requiredArray(value.pantryItems, `${path}.pantryItems`, 0, PANTRY_ITEMS.length).map((item, index) => {
    const pantry = requiredString(item, `${path}.pantryItems[${index}]`, 40) as PantryItem;
    if (!(PANTRY_ITEMS as readonly string[]).includes(pantry)) fail(`${path}.pantryItems contains an unsupported pantry item.`);
    return pantry;
  });
  if (new Set(pantryItems).size !== pantryItems.length) fail(`${path}.pantryItems contains duplicates.`);
  return { instruction: requiredString(value.instruction, `${path}.instruction`, 400), productIds, pantryItems };
}

function repairMissingStepProductCoverage(
  steps: GeneratedRecipeStep[],
  productIds: readonly string[],
  path: string,
): void {
  const assignedIds = new Set(productIds);
  const coveredIds = new Set(
    steps
      .flatMap((step) => step.productIds)
      .filter((productId) => assignedIds.has(productId)),
  );

  for (const productId of productIds) {
    if (coveredIds.has(productId)) {
      continue;
    }

    // Structured Outputs cannot require the union of nested step arrays to
    // equal the meal ingredient array. Method-only step prose makes it safe to
    // attach omitted assigned IDs to the earliest step with available space.
    const preparationStep = steps.find(
      (step) => step.productIds.length < 5,
    );
    if (!preparationStep) {
      fail(`${path}.steps must account for every assigned product.`);
    }
    preparationStep.productIds.push(productId);
    coveredIds.add(productId);
  }
}

/**
 * A recipe writer occasionally copies one reference from a neighbouring day
 * in the same batch. We only repair it when the intended replacement is
 * provable from the meal's own ingredient list: one foreign occurrence and
 * one otherwise-uncovered assigned ingredient. Ambiguous output remains a
 * hard grounding failure.
 */
function repairUnambiguousForeignStepProductReference(
  steps: GeneratedRecipeStep[],
  productIds: readonly string[],
  path: string,
  onRepair?: (repair: RecipeRepairDiagnostic) => void,
): void {
  const assigned = new Set(productIds);
  const foreignOccurrences = steps.flatMap((step, stepIndex) => step.productIds
    .map((productId, productIndex) => ({ step, stepIndex, productId, productIndex }))
    .filter(({ productId }) => !assigned.has(productId)));
  const coveredAssigned = new Set(
    steps.flatMap((step) => step.productIds).filter((productId) => assigned.has(productId)),
  );
  const missing = productIds.filter((productId) => !coveredAssigned.has(productId));

  if (foreignOccurrences.length !== 1 || missing.length !== 1) return;
  const occurrence = foreignOccurrences[0]!;
  const replacement = missing[0]!;
  if (occurrence.step.productIds.includes(replacement)) return;
  occurrence.step.productIds[occurrence.productIndex] = replacement;
  onRepair?.({
    type: "repaired_foreign_step_product_reference",
    path: `${path}.steps[${occurrence.stepIndex}].productIds`,
  });
}

function parseMeal(
  value: unknown,
  path: string,
  onRepair?: (repair: RecipeRepairDiagnostic) => void,
): GeneratedMeal {
  if (!isRecord(value)) {
    return fail(`${path} must be an object.`);
  }

  assertExactKeys(
    value,
    [
      "name",
      "prepTimeMinutes",
      "servings",
      "ingredients",
      "pantryItems",
      "steps",
    ],
    path,
  );

  const ingredients = requiredArray(
    value.ingredients,
    `${path}.ingredients`,
    MIN_INGREDIENTS,
    MAX_INGREDIENTS,
  ).map((ingredient, index) =>
    parseIngredient(ingredient, `${path}.ingredients[${index}]`),
  );
  const productIds = ingredients.map(({ productId }) => productId);

  if (new Set(productIds).size !== productIds.length) {
    fail(`${path}.ingredients contains duplicate product IDs.`);
  }

  const pantryItems = requiredArray(
    value.pantryItems,
    `${path}.pantryItems`,
    0,
    PANTRY_ITEMS.length,
  ).map((item, index) => {
    const pantryItem = requiredString(
      item,
      `${path}.pantryItems[${index}]`,
      40,
    );
    if (!(PANTRY_ITEMS as readonly string[]).includes(pantryItem)) {
      return fail(`${path}.pantryItems contains an unsupported pantry item.`);
    }
    return pantryItem as PantryItem;
  });
  if (new Set(pantryItems).size !== pantryItems.length) {
    fail(`${path}.pantryItems contains duplicates.`);
  }

  const steps = requiredArray(
    value.steps,
    `${path}.steps`,
    MIN_STEPS,
    MAX_STEPS,
  ).map((step, index) => parseStep(step, `${path}.steps[${index}]`));
  repairUnambiguousForeignStepProductReference(steps, productIds, path, onRepair);
  repairMissingStepProductCoverage(steps, productIds, path);
  // Step metadata is the authoritative pantry source. Structured Outputs cannot
  // enforce equality between two arrays, so deriving the union avoids rejecting
  // a grounded recipe because the model duplicated that information incorrectly.
  const usedPantry = [...new Set(steps.flatMap((step) => step.pantryItems))];

  return {
    name: requiredString(value.name, `${path}.name`, 120),
    prepTimeMinutes: requiredInteger(
      value.prepTimeMinutes,
      `${path}.prepTimeMinutes`,
      MIN_PREP_TIME_MINUTES,
      MAX_PREP_TIME_MINUTES,
    ),
    servings: requiredInteger(
      value.servings,
      `${path}.servings`,
      MIN_SERVINGS,
      MAX_SERVINGS,
    ),
    ingredients,
    pantryItems: usedPantry,
    steps,
  };
}

function parseDay(
  value: unknown,
  expectedIndex: number,
  onRepair?: (repair: RecipeRepairDiagnostic) => void,
): GeneratedDayPlan {
  const path = `days[${expectedIndex}]`;
  if (!isRecord(value)) {
    return fail(`${path} must be an object.`);
  }

  assertExactKeys(value, ["dayIndex", "primaryMeal"], path);
  const dayIndex = requiredInteger(value.dayIndex, `${path}.dayIndex`, 0, 6);

  if (dayIndex !== expectedIndex) {
    fail(`${path}.dayIndex must be ${expectedIndex}.`);
  }

  return {
    dayIndex,
    primaryMeal: parseMeal(value.primaryMeal, `${path}.primaryMeal`, onRepair),
  };
}

export function parseGeneratedWeeklyPlan(
  value: unknown,
  onRepair?: (repair: RecipeRepairDiagnostic) => void,
): GeneratedWeeklyPlan {
  if (!isRecord(value)) {
    return fail("The generated plan must be an object.");
  }

  assertExactKeys(value, ["days"], "plan");
  const days = requiredArray(value.days, "days", DAY_COUNT, DAY_COUNT).map(
    (day, index) => parseDay(day, index, onRepair),
  );

  return {
    days: [
      days[0]!,
      days[1]!,
      days[2]!,
      days[3]!,
      days[4]!,
      days[5]!,
      days[6]!,
    ],
  };
}

function productIdSignature(meal: GeneratedMeal): string {
  return meal.ingredients
    .map(({ productId }) => productId)
    .sort()
    .join("\u0000");
}

function repairAllowedPantryMetadata(
  meal: GeneratedMeal,
  assignedProducts: readonly CatalogProduct[],
): void {
  meal.steps.forEach((step) => {
    mentionedUnpurchasedPantryItems(
      step.instruction,
      assignedProducts,
    ).forEach((pantryItem) => {
      if (!step.pantryItems.includes(pantryItem)) {
        step.pantryItems.push(pantryItem);
      }
    });
  });

  // A pantry staple can also appear in the recipe title. Associate it with the
  // first preparation step so the UI still shows where it enters the recipe.
  const usedInSteps = new Set(
    meal.steps.flatMap((step) => step.pantryItems),
  );
  mentionedUnpurchasedPantryItems(meal.name, assignedProducts).forEach(
    (pantryItem) => {
      if (!usedInSteps.has(pantryItem)) {
        meal.steps[0]!.pantryItems.push(pantryItem);
        usedInSteps.add(pantryItem);
      }
    },
  );
  meal.pantryItems = [...new Set(meal.steps.flatMap((step) => step.pantryItems))];
}

function repairUnassignedCatalogFoodMentions(
  meal: GeneratedMeal,
  assignedProducts: readonly CatalogProduct[],
  groundingCatalog: readonly CatalogProduct[],
  path: string,
  onRepair?: (repair: RecipeRepairDiagnostic) => void,
): void {
  const template = templateForMealProducts(assignedProducts) ?? "proteinAndVegetables";
  const repairType = (text: string): RecipeRepairDiagnostic["type"] =>
    unassignedCatalogIngredientKind(text, assignedProducts, groundingCatalog) === "different_selected_product"
      ? "repaired_cross_day_product_name"
      : "repaired_unassigned_staple";
  const safeMealName = (mealTemplate: MealTemplate): string => {
    switch (mealTemplate) {
      case "pasta": return "Savory pasta";
      case "riceBowl": return "Rice bowl";
      case "couscousBowl": return "Couscous bowl";
      case "breadPlate": return "Savory bread plate";
      case "readyMeal": return "Simple ready meal";
      default: return "Protein with vegetables";
    }
  };
  if (
    hasUnassignedCatalogFoodMention(
      meal.name,
      assignedProducts,
      groundingCatalog,
    )
  ) {
    onRepair?.({ type: repairType(meal.name), path: `${path}.name` });
    meal.name = safeMealName(template);
  }

  meal.steps.forEach((step, index) => {
    if (
      !hasUnassignedCatalogFoodMention(
        step.instruction,
        assignedProducts,
        groundingCatalog,
      )
    ) {
      return;
    }

    onRepair?.({ type: repairType(step.instruction), path: `${path}.steps[${index}].instruction` });
    if (template === "readyMeal") {
      step.instruction = index === meal.steps.length - 1
        ? "Finish preparing the ingredients listed for this step and serve."
        : "Prepare the ingredients listed for this step as needed.";
    } else if (index === 0) {
      step.instruction = "Prepare the ingredients listed for this step as needed.";
    } else if (index === meal.steps.length - 1) {
      step.instruction = step.pantryItems.length > 0
        ? "Finish cooking the ingredients listed for this step, season as listed, and serve."
        : "Finish cooking the ingredients listed for this step and serve.";
    } else {
      step.instruction = "Cook the ingredients listed for this step until tender and ready.";
    }
  });
}

function assertMatchingIngredientPool(
  primary: GeneratedMeal,
  alternate: GeneratedMeal,
  path: string,
): void {
  if (productIdSignature(primary) !== productIdSignature(alternate)) {
    fail(`${path} must use exactly the primary meal's product IDs.`);
  }
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function priceForProducts(
  productIds: readonly string[],
  productMap: ReadonlyMap<string, CatalogProduct>,
): number {
  return centsToAmount(
    productIds.reduce((totalCents, productId) => {
      const product = productMap.get(productId);
      if (!product) {
        return fail(`Unknown candidate product ID: ${productId}.`);
      }

      if (
        product.price.currency !== "EUR" ||
        !Number.isFinite(product.price.amount) ||
        product.price.amount < 0
      ) {
        return fail(`Product ${productId} does not have a valid EUR price.`);
      }

      return totalCents + amountToCents(product.price.amount);
    }, 0),
  );
}

export function cleanRecipeText(value: string): string {
  return value
    .replace(/\s*\(\s*(?:[A-Z]?\d{6,}|P\d+)\s*\)/gi, "")
    .replace(/\bP\d+\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function enrichMeal(
  generated: GeneratedMeal,
  id: string,
  productMap: ReadonlyMap<string, CatalogProduct>,
): Meal {
  const productIds = generated.ingredients.map(({ productId }) => productId);

  return {
    id,
    name: cleanRecipeText(generated.name),
    prepTimeMinutes: generated.prepTimeMinutes,
    servings: generated.servings,
    estimatedPrice: {
      amount: priceForProducts(productIds, productMap),
      currency: "EUR",
    },
    ingredients: generated.ingredients.map(({ productId, quantity }) => {
      const product = productMap.get(productId);
      if (!product) {
        return fail(`Unknown candidate product ID: ${productId}.`);
      }

      return {
        productId,
        name: product.name,
        quantity: `${quantity.amount} ${quantity.unit}`,
        packagePrice: {
          amount: roundCurrency(product.price.amount),
          currency: "EUR",
        },
      };
    }),
    pantryItems: generated.pantryItems,
    steps: generated.steps.map((step) => ({
      instruction: cleanRecipeText(step.instruction),
      productIds: [...step.productIds],
      ingredientNames: step.productIds.map((productId) => productMap.get(productId)?.name ?? productId),
      pantryItems: [...step.pantryItems],
    })),
  };
}

export function validateAndEnrichWeeklyPlan(
  value: unknown,
  candidates: readonly CatalogProduct[],
  budget: number,
  source: WeeklyPlan["source"] = "openai",
  expectedSelection?: ExpectedWeeklySelection,
  onRepair?: (repair: RecipeRepairDiagnostic) => void,
): WeeklyPlan {
  if (!Number.isFinite(budget) || budget <= 0) {
    return fail("Budget must be a positive finite number.");
  }
  if (
    expectedSelection &&
    expectedSelection.dayProductIds.length !== DAY_COUNT
  ) {
    return fail(`Expected weekly selection must contain ${DAY_COUNT} days.`);
  }
  if (expectedSelection?.dayAssignments) {
    try {
      validateSavoryDayAssignments(expectedSelection.dayAssignments, candidates);
    } catch (error) {
      return fail(
        error instanceof Error
          ? error.message
          : "Expected savory day assignments are invalid.",
      );
    }
  }

  const generated = parseGeneratedWeeklyPlan(value, onRepair);
  const productMap = new Map(candidates.map((product) => [product.id, product]));
  const primarySignatures = new Set<string>();
  const weeklyProductIds = new Set<string>();

  const days = generated.days.map((day) => {
    const primarySignature = productIdSignature(day.primaryMeal);

    if (expectedSelection) {
      const expectedSignature = [...expectedSelection.dayProductIds[day.dayIndex]!]
        .sort()
        .join("\u0000");
      if (primarySignature !== expectedSignature) {
        fail(
          `days[${day.dayIndex}].primaryMeal must use exactly its assigned product IDs.`,
        );
      }
    } else if (
      source === "openai" &&
      primarySignatures.has(primarySignature)
    ) {
      fail("Primary meals must use distinct ingredient combinations.");
    }
    primarySignatures.add(primarySignature);

    day.primaryMeal.ingredients.forEach(({ productId }) => {
      if (!productMap.has(productId)) {
        fail(`Unknown candidate product ID: ${productId}.`);
      }
      weeklyProductIds.add(productId);
    });
    const assignedProducts = day.primaryMeal.ingredients.map(
      ({ productId }) => productMap.get(productId)!,
    );
    repairAllowedPantryMetadata(day.primaryMeal, assignedProducts);
    repairUnassignedCatalogFoodMentions(
      day.primaryMeal,
      assignedProducts,
      candidates,
      `days[${day.dayIndex}].primaryMeal`,
      onRepair,
    );
    const groundingError = recipeGroundingError(
      day.primaryMeal,
      assignedProducts,
      candidates,
    );
    if (groundingError) {
      fail(
        `days[${day.dayIndex}].primaryMeal ${groundingError}`,
        groundingValidationCode(groundingError),
        `days[${day.dayIndex}].primaryMeal`,
        groundingError.startsWith("mentions unassigned catalog ingredient")
          ? unassignedCatalogIngredientKind(
              [day.primaryMeal.name, ...day.primaryMeal.steps.map(({ instruction }) => instruction)].join(" "),
              assignedProducts,
              candidates,
            )
          : null,
      );
    }
    const primaryMeal = enrichMeal(
      day.primaryMeal,
      `day-${day.dayIndex}-primary`,
      productMap,
    );
    return {
      dayIndex: day.dayIndex,
      primaryMeal,
      alternates: [null, null],
    } satisfies DayPlan;
  });

  const estimatedTotal = calculatePackageUseTotal(
    days.map((day) => day.primaryMeal.ingredients.map(({ productId }) => productId)),
    candidates,
  );
  if (expectedSelection) {
    const actualProductSignature = [...weeklyProductIds].sort().join("\u0000");
    const expectedProductSignature = [...new Set(expectedSelection.productIds)]
      .sort()
      .join("\u0000");
    if (actualProductSignature !== expectedProductSignature) {
      fail("The weekly primary product union does not match the selected basket.");
    }
    if (
      amountToCents(estimatedTotal) !==
      amountToCents(expectedSelection.spend)
    ) {
      fail("The weekly total does not match the selected basket spend.");
    }
  }
  if (estimatedTotal > roundCurrency(budget)) {
    fail(
      `The generated plan costs €${estimatedTotal.toFixed(2)}, above the €${roundCurrency(budget).toFixed(2)} budget.`,
    );
  }

  return {
    days: days as SevenDayPlans,
    estimatedTotal: {
      amount: estimatedTotal,
      currency: "EUR",
    },
    source,
    alternativeCandidateProductIds: [],
  };
}
