import {
  canCombineMealProducts,
  mealProductRole,
  savoryMealProductProfile,
  templateForMealProducts,
  type MealProductRole,
} from "../data/mealProductClassification";
import type { CatalogProduct } from "../types/catalog";
import {
  amountToCents,
  centsToAmount,
  type RandomSource,
  type SavoryDayAssignment,
  type WeeklyProductBasket,
  selectWeeklyProductBasket,
  validateSavoryDayAssignments,
} from "./weeklyProductBasket";
import { calculatePackageUseTotal } from "./weeklyPlanPricing";

export type CandidateMenuRole =
  | "protein"
  | "vegetable"
  | "base"
  | "support"
  | "readyMeal";

export type CandidateMenuItem = {
  product: CatalogProduct;
  role: CandidateMenuRole;
  proteinFamily: string | null;
};

export type RandomCandidateMenu = {
  candidates: readonly CandidateMenuItem[];
  recoveryBasket: WeeklyProductBasket;
};

export type CandidateSelectionValidationCode =
  | "invalid_day_count"
  | "invalid_day_index_set"
  | "duplicate_product_reference"
  | "invalid_product_count"
  | "invalid_composition"
  | "missing_protein"
  | "multiple_proteins"
  | "missing_vegetable"
  | "incompatible_pair"
  | "invalid_ready_meal"
  | "unsupported_template"
  | "foreign_product"
  | "duplicate_day"
  | "too_many_ready_meals"
  | "over_budget";

export class CandidateSelectionValidationError extends Error {
  readonly code: CandidateSelectionValidationCode;
  readonly path: string | null;

  constructor(code: CandidateSelectionValidationCode, message: string, path: string | null = null) {
    super(message);
    this.name = "CandidateSelectionValidationError";
    this.code = code;
    this.path = path;
  }
}

export type CandidateSelectionNormalization =
  | "sorted_days"
  | "deduplicated_product_references";

export type ValidatedCandidateSelection = WeeklyProductBasket & {
  normalizations: readonly CandidateSelectionNormalization[];
};

const TARGETS: Readonly<Record<CandidateMenuRole, number>> = {
  protein: 30,
  vegetable: 36,
  base: 24,
  support: 18,
  readyMeal: 12,
};

function menuRole(product: CatalogProduct): CandidateMenuRole | null {
  const profile = savoryMealProductProfile(product);
  if (!profile) return null;
  if (
    profile.role === "produce" &&
    /\bpotatoes?\b/i.test(`${product.name} ${product.category?.name ?? ""}`)
  ) {
    return "base";
  }
  switch (profile.role) {
    case "protein": return "protein";
    case "base": return "base";
    case "produce": return "vegetable";
    case "support": return "support";
    case "readyMeal": return "readyMeal";
  }
}

function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.min(Math.max(random(), 0), 1 - Number.EPSILON) * (index + 1));
    [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  }
  return copy;
}

function diverseTake(
  items: readonly CandidateMenuItem[],
  limit: number,
  random: RandomSource,
): CandidateMenuItem[] {
  const prices = items.map(({ product }) => product.price.amount);
  const lowestPrice = Math.min(...prices);
  const highestPrice = Math.max(...prices);
  const groups = new Map<string, CandidateMenuItem[]>();
  items.forEach((item) => {
    const category = item.product.category?.id ?? item.product.department.id;
    const priceBand = highestPrice === lowestPrice
      ? 0
      : Math.min(2, Math.floor(((item.product.price.amount - lowestPrice) / (highestPrice - lowestPrice)) * 3));
    // Protein families deserve their own rotation. The category and price band
    // keep each family from collapsing to the same cheapest catalog item.
    const roleKey = item.role === "protein"
      ? `${item.proteinFamily ?? "other"}:${category}`
      : category;
    const key = `${roleKey}:price-${priceBand}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  });
  const queues = shuffle([...groups.values()], random).map((bucket) =>
    shuffle(bucket, random),
  );
  const selected: CandidateMenuItem[] = [];
  while (selected.length < limit && queues.length > 0) {
    for (let index = queues.length - 1; index >= 0 && selected.length < limit; index -= 1) {
      const item = queues[index]!.pop();
      if (item) selected.push(item);
      if (queues[index]!.length === 0) queues.splice(index, 1);
    }
  }
  return selected;
}

export function buildRandomCandidateMenu(
  products: readonly CatalogProduct[],
  budget: number,
  random: RandomSource = Math.random,
  reservedProducts: readonly CatalogProduct[] = [],
): CandidateMenuItem[] {
  const budgetCents = amountToCents(budget);
  const buckets: Record<CandidateMenuRole, CandidateMenuItem[]> = {
    protein: [], vegetable: [], base: [], support: [], readyMeal: [],
  };
  const seen = new Set<string>();
  products.forEach((product) => {
    const cents = amountToCents(product.price.amount);
    const role = menuRole(product);
    if (!role || seen.has(product.id) || product.price.currency !== "EUR" || !Number.isFinite(product.price.amount) || cents <= 0 || cents > budgetCents) return;
    seen.add(product.id);
    buckets[role].push({ product, role, proteinFamily: savoryMealProductProfile(product)?.proteinFamily ?? null });
  });
  const selected: CandidateMenuItem[] = [];
  const selectedIds = new Set<string>();
  const selectedRoleCounts: Record<CandidateMenuRole, number> = {
    protein: 0, vegetable: 0, base: 0, support: 0, readyMeal: 0,
  };
  reservedProducts.forEach((product) => {
    const role = menuRole(product);
    if (!role || !buckets[role].some(({ product: candidate }) => candidate.id === product.id) || selectedIds.has(product.id)) return;
    selected.push({ product, role, proteinFamily: savoryMealProductProfile(product)?.proteinFamily ?? null });
    selectedIds.add(product.id);
    selectedRoleCounts[role] += 1;
  });
  (Object.keys(TARGETS) as CandidateMenuRole[]).forEach((role) => {
    const remaining = Math.min(
      Math.max(0, TARGETS[role] - selectedRoleCounts[role]),
      Math.max(0, 120 - selected.length),
    );
    const additions = diverseTake(
      buckets[role].filter(({ product }) => !selectedIds.has(product.id)),
      remaining,
      random,
    );
    selected.push(...additions);
    additions.forEach(({ product }) => selectedIds.add(product.id));
  });
  const remainder = shuffle(
    (Object.keys(buckets) as CandidateMenuRole[])
      .filter((role) => role !== "readyMeal")
      .flatMap((role) => buckets[role])
      .filter(({ product }) => !selectedIds.has(product.id)),
    random,
  );
  for (const item of remainder) {
    if (selected.length >= 120) break;
    selected.push(item);
    selectedIds.add(item.product.id);
  }
  return shuffle(selected, random);
}

/**
 * The fallback basket is chosen before the menu is filled and then reserved in
 * that menu. A timed-out selector can therefore never make us discard the
 * generation's randomized ingredients for the complete catalog.
 */
export function buildRandomCandidateMenuWithRecovery(
  products: readonly CatalogProduct[],
  budget: number,
  random: RandomSource = Math.random,
  previousPrimaryProductIds: readonly string[] = [],
): RandomCandidateMenu | null {
  const previous = new Set(previousPrimaryProductIds);
  // Prefer a fully novel recovery basket. Relax only when the active filters
  // and budget cannot form a viable week without earlier primary products.
  const novelProducts = products.filter((product) => !previous.has(product.id));
  const recoveryBasket = selectWeeklyProductBasket(novelProducts, budget, random)
    ?? selectWeeklyProductBasket(products, budget, random);
  if (!recoveryBasket) return null;
  return {
    candidates: buildRandomCandidateMenu(
      products,
      budget,
      random,
      recoveryBasket.products,
    ),
    recoveryBasket,
  };
}

export type RawSelectedDay = { dayIndex: number; productIds: string[] };

/**
 * This intentionally returns only rule names. The generation diagnostic must
 * explain a rejected selector result without exposing product references.
 */
function compositionFailureCode(
  products: readonly CatalogProduct[],
): CandidateSelectionValidationCode | null {
  const profiles = products.map(savoryMealProductProfile);
  if (profiles.some((profile) => profile === null)) return "unsupported_template";
  const typed = profiles.filter((profile): profile is NonNullable<typeof profile> => profile !== null);
  const proteinCount = typed.filter(({ role }) => role === "protein").length;
  const readyMealCount = typed.filter(({ role }) => role === "readyMeal").length;
  const produceCount = typed.filter(({ role }) => role === "produce").length;
  const baseCount = typed.filter(({ role }) => role === "base").length;
  const supportCount = typed.filter(({ role }) => role === "support").length;

  if (readyMealCount > 0) {
    return readyMealCount === 1 && products.length >= 2 && products.length <= 3 && proteinCount === 0 && baseCount === 0 && produceCount + supportCount === products.length - 1
      ? null
      : "invalid_ready_meal";
  }
  if (proteinCount === 0) return "missing_protein";
  if (proteinCount > 1) return "multiple_proteins";
  if (produceCount === 0) return "missing_vegetable";
  if (baseCount > 1 || supportCount > 1) return "unsupported_template";
  for (let left = 0; left < products.length; left += 1) {
    for (let right = left + 1; right < products.length; right += 1) {
      if (!canCombineMealProducts(products[left]!, products[right]!)) return "incompatible_pair";
    }
  }
  return templateForMealProducts(products) ? null : "unsupported_template";
}

export function validateSelectedCandidateMenu(
  value: unknown,
  menu: readonly CandidateMenuItem[],
  budget: number,
  previousPrimaryProductIds: readonly string[] = [],
): ValidatedCandidateSelection {
  if (!value || typeof value !== "object" || !Array.isArray((value as { days?: unknown }).days)) throw new CandidateSelectionValidationError("invalid_day_count", "Selected menu must contain seven days.", "days");
  const days = (value as { days: unknown[] }).days;
  if (days.length !== 7) throw new CandidateSelectionValidationError("invalid_day_count", "Selected menu must contain seven days.", "days");
  const indexedDays = days.map((day, index) => {
    if (!day || typeof day !== "object") throw new CandidateSelectionValidationError("invalid_day_index_set", "Selected menu day is invalid.", `days[${index}]`);
    const raw = day as Partial<RawSelectedDay>;
    if (!Number.isInteger(raw.dayIndex) || (raw.dayIndex as number) < 0 || (raw.dayIndex as number) > 6) {
      throw new CandidateSelectionValidationError("invalid_day_index_set", "Selected menu must use every day index exactly once.", `days[${index}].dayIndex`);
    }
    if (!Array.isArray(raw.productIds) || raw.productIds.some((id) => typeof id !== "string")) {
      throw new CandidateSelectionValidationError("invalid_product_count", "Selected menu day has invalid product IDs.", `days[${index}].productIds`);
    }
    return { raw: raw as RawSelectedDay, originalIndex: index };
  });
  const dayIndexes = indexedDays.map(({ raw }) => raw.dayIndex);
  if (new Set(dayIndexes).size !== 7 || ![0, 1, 2, 3, 4, 5, 6].every((index) => dayIndexes.includes(index))) {
    throw new CandidateSelectionValidationError("invalid_day_index_set", "Selected menu must use every day index exactly once.", "days");
  }
  const sortedDays = [...indexedDays].sort((left, right) => left.raw.dayIndex - right.raw.dayIndex);
  const normalizations: CandidateSelectionNormalization[] = [];
  if (sortedDays.some(({ originalIndex }, index) => originalIndex !== index)) normalizations.push("sorted_days");
  const productMap = new Map(menu.map(({ product }) => [product.id, product]));
  const assignments: SavoryDayAssignment[] = [];
  const signatures = new Set<string>();
  let readyDays = 0;
  const purchased = new Set<string>();
  sortedDays.forEach(({ raw }) => {
    const rawIds = raw.productIds;
    if (rawIds.length < 2 || rawIds.length > 5) throw new CandidateSelectionValidationError("invalid_product_count", "Selected menu day has an invalid product count.", `days[${raw.dayIndex}].productIds`);
    const productIds = [...new Set(rawIds)];
    if (productIds.length !== rawIds.length) normalizations.push("deduplicated_product_references");
    if (productIds.length < 2 || productIds.length > 5) throw new CandidateSelectionValidationError("duplicate_product_reference", "Duplicate product references leave too few products for this day.", `days[${raw.dayIndex}].productIds`);
    const products = productIds.map((id) => productMap.get(id));
    if (products.some((product) => !product)) throw new CandidateSelectionValidationError("foreign_product", "Selected menu references a foreign product.", `days[${raw.dayIndex}].productIds`);
    const typedProducts = products as CatalogProduct[];
    const compositionError = compositionFailureCode(typedProducts);
    if (compositionError) throw new CandidateSelectionValidationError(compositionError, "Selected menu has an incoherent meal.", `days[${raw.dayIndex}]`);
    const template = templateForMealProducts(typedProducts)!;
    if (template === "readyMeal") {
      if (productIds.length < 2 || productIds.length > 3) throw new CandidateSelectionValidationError("invalid_product_count", "Ready-meal days need two or three products.", `days[${raw.dayIndex}].productIds`);
      if (++readyDays > 2) throw new CandidateSelectionValidationError("too_many_ready_meals", "Selected menu has too many ready meals.", `days[${raw.dayIndex}]`);
    } else if (productIds.length < 3 || productIds.length > 5 || !typedProducts.some((product) => savoryMealProductProfile(product)?.role === "produce")) {
      throw new CandidateSelectionValidationError("missing_vegetable", "Regular meals need three to five products including a vegetable.", `days[${raw.dayIndex}]`);
    }
    const signature = [...productIds].sort().join("\u0000");
    if (signatures.has(signature)) throw new CandidateSelectionValidationError("duplicate_day", "Selected menu repeats a meal.", `days[${raw.dayIndex}]`);
    signatures.add(signature);
    productIds.forEach((id) => purchased.add(id));
    assignments.push({ dayIndex: raw.dayIndex, productIds, template });
  });
  const selectedProducts = menu.map(({ product }) => product).filter(({ id }) => purchased.has(id));
  const spend = calculatePackageUseTotal(assignments.map(({ productIds }) => productIds), selectedProducts);
  if (spend > budget + Number.EPSILON) throw new CandidateSelectionValidationError("over_budget", "Selected menu exceeds the weekly budget.", "days");
  if (previousPrimaryProductIds.length > 0) {
    const previous = new Set(previousPrimaryProductIds);
    const overlap = [...purchased].filter((id) => previous.has(id)).length / Math.max(purchased.size, 1);
    if (overlap > 0.3 + Number.EPSILON) throw new CandidateSelectionValidationError("invalid_composition", "Selected menu repeats too many products from the previous week.", "days");
  }
  try {
    validateSavoryDayAssignments(assignments, selectedProducts);
  } catch {
    throw new CandidateSelectionValidationError("unsupported_template", "Selected menu has an incoherent meal.", "days");
  }
  return { products: selectedProducts, productIds: selectedProducts.map(({ id }) => id), spend, dayAssignments: assignments, normalizations: [...new Set(normalizations)] };
}

export function candidateMenuRoleForProduct(product: CatalogProduct): MealProductRole | null {
  return mealProductRole(product);
}
