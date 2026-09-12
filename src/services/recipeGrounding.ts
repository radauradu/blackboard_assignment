import type { CatalogProduct } from "../types/catalog";
import type { GeneratedMeal, PantryItem } from "../types/generatedMealPlan";

export const PANTRY_ITEMS = [
  "water",
  "salt",
  "black pepper",
  "olive oil",
] as const satisfies readonly PantryItem[];

const PANTRY_ALIASES: Readonly<Record<PantryItem, readonly string[]>> = {
  water: ["water"],
  salt: ["salt"],
  "black pepper": ["black pepper", "pepper"],
  "olive oil": ["olive oil", "oil"],
};

const MINIMUM_CATALOG_TERM_LENGTH = 4;

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function containsTerm(normalizedText: string, term: string): boolean {
  return ` ${normalizedText} `.includes(` ${term} `);
}

function catalogTerms(product: CatalogProduct): string[] {
  return [product.name, product.category?.name ?? ""]
    .map(normalize)
    .filter((term) => term.length >= MINIMUM_CATALOG_TERM_LENGTH);
}

const CATALOG_STAPLES = [
  "pasta",
  "rice",
  "couscous",
  "bread",
  "noodle",
  "flour",
  "milk",
  "cheese",
] as const;

function unassignedCatalogIngredientTerm(
  normalizedText: string,
  assignedProducts: readonly CatalogProduct[],
  groundingCatalog: readonly CatalogProduct[],
): string | null {
  const assignedIds = new Set(assignedProducts.map(({ id }) => id));
  const assignedCatalogText = assignedProducts
    .flatMap((product) => [product.name, product.category?.name ?? ""])
    .map(normalize);
  const allowedTerms = new Set(assignedProducts.flatMap(catalogTerms));
  const ownersByTerm = new Map<string, Set<string>>();

  groundingCatalog.forEach((product) => {
    catalogTerms(product).forEach((term) => {
      const owners = ownersByTerm.get(term) ?? new Set<string>();
      owners.add(product.id);
      ownersByTerm.set(term, owners);
    });
  });

  for (const [term, owners] of ownersByTerm) {
    if (
      PANTRY_ITEMS.some((pantryItem) =>
        PANTRY_ALIASES[pantryItem].some((alias) => term === alias),
      )
    ) {
      continue;
    }
    if (
      containsTerm(normalizedText, term) &&
      !allowedTerms.has(term) &&
      !assignedCatalogText.some((catalogText) =>
        containsTerm(catalogText, term),
      ) &&
      [...owners].every((productId) => !assignedIds.has(productId))
    ) {
      return term;
    }
  }
  return null;
}

export type GroundingCatalogReferenceKind =
  | "different_selected_product"
  | "generic_catalog_category";

export function unassignedCatalogIngredientKind(
  value: string,
  assignedProducts: readonly CatalogProduct[],
  groundingCatalog: readonly CatalogProduct[],
): GroundingCatalogReferenceKind | null {
  const term = unassignedCatalogIngredientTerm(normalize(value), assignedProducts, groundingCatalog);
  if (!term) return null;
  const assignedIds = new Set(assignedProducts.map(({ id }) => id));
  const isOtherProductName = groundingCatalog.some((product) =>
    !assignedIds.has(product.id) && normalize(product.name) === term,
  );
  return isOtherProductName ? "different_selected_product" : "generic_catalog_category";
}

function unassignedCatalogStapleTerm(
  normalizedText: string,
  assignedProducts: readonly CatalogProduct[],
): string | null {
  const assignedCatalogText = assignedProducts
    .flatMap((product) => [product.name, product.category?.name ?? ""])
    .map(normalize);

  for (const staple of CATALOG_STAPLES) {
    const mentionsStaple = new RegExp(`\\b${staple}s?\\b`, "i").test(
      normalizedText,
    );
    const assignedStaple = assignedCatalogText.some((text) =>
      new RegExp(`\\b${staple}s?\\b`, "i").test(text),
    );
    if (mentionsStaple && !assignedStaple) {
      return staple;
    }
  }
  return null;
}

export function hasUnassignedCatalogFoodMention(
  value: string,
  assignedProducts: readonly CatalogProduct[],
  groundingCatalog: readonly CatalogProduct[],
): boolean {
  const normalizedText = normalize(value);
  return (
    unassignedCatalogIngredientTerm(
      normalizedText,
      assignedProducts,
      groundingCatalog,
    ) !== null ||
    unassignedCatalogStapleTerm(normalizedText, assignedProducts) !== null
  );
}

export function mentionedUnpurchasedPantryItems(
  value: string,
  assignedProducts: readonly CatalogProduct[],
): PantryItem[] {
  const normalizedText = normalize(value);
  const assignedCatalogText = assignedProducts
    .flatMap((product) => [product.name, product.category?.name ?? ""])
    .map(normalize);

  return PANTRY_ITEMS.filter((pantryItem) => {
    const mentionedAliases = PANTRY_ALIASES[pantryItem].filter((alias) =>
      containsTerm(normalizedText, alias),
    );
    const isPurchasedProduct = mentionedAliases.some((alias) =>
      assignedCatalogText.some((catalogText) =>
        containsTerm(catalogText, alias),
      ),
    );
    return mentionedAliases.length > 0 && !isPurchasedProduct;
  });
}

export function recipeGroundingError(
  meal: GeneratedMeal,
  assignedProducts: readonly CatalogProduct[],
  groundingCatalog: readonly CatalogProduct[],
): string | null {
  const normalizedText = normalize([meal.name, ...meal.steps.map(({ instruction }) => instruction)].join(" "));
  const declaredPantry = new Set(meal.pantryItems);
  const assignedCatalogText = assignedProducts
    .flatMap((product) => [product.name, product.category?.name ?? ""])
    .map(normalize);

  for (const pantryItem of mentionedUnpurchasedPantryItems(
    normalizedText,
    assignedProducts,
  )) {
    if (!declaredPantry.has(pantryItem)) {
      return `mentions undeclared pantry item "${pantryItem}"`;
    }
  }

  const assignedIds = new Set(assignedProducts.map(({ id }) => id));
  const stepProductIds = new Set(meal.steps.flatMap((step) => step.productIds));
  if ([...stepProductIds].some((id) => !assignedIds.has(id))) return "has a step with an unassigned product ID";
  if ([...assignedIds].some((id) => !stepProductIds.has(id))) return "does not use every assigned product in a step";
  declaredPantry.forEach((pantryItem) => {
    PANTRY_ALIASES[pantryItem].forEach(() => undefined);
  });
  const unassignedCatalogIngredient = unassignedCatalogIngredientTerm(
    normalizedText,
    assignedProducts,
    groundingCatalog,
  );
  if (unassignedCatalogIngredient) {
    return `mentions unassigned catalog ingredient "${unassignedCatalogIngredient}"`;
  }

  const unassignedStaple = unassignedCatalogStapleTerm(
    normalizedText,
    assignedProducts,
  );
  if (unassignedStaple) {
    return `mentions unassigned catalog staple "${unassignedStaple}"`;
  }

  return null;
}
