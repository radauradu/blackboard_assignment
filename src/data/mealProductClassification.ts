import type { CatalogProduct } from "../types/catalog";
import type { NutritionalGoal } from "../types/flow";
import { matchesNutritionalGoal, NUTRITION_THRESHOLDS } from "./catalogFilters";

export type MealProductRole = "protein" | "base" | "produce" | "support" | "readyMeal";
export type ProteinFamily = "seafood" | "meat" | "egg" | "plant";
export type MealTemplate =
  | "pasta"
  | "riceBowl"
  | "couscousBowl"
  | "breadPlate"
  | "proteinAndVegetables"
  | "readyMeal";

export type SavoryMealProductProfile = {
  role: MealProductRole;
  proteinFamily: ProteinFamily | null;
  dairySupport: boolean;
  baseKind: "pasta" | "rice" | "couscous" | "bread" | null;
};

// The catalog contains ready meals, treats, and ambiguous uncategorized items.
// Use a conservative allowlist rather than trying to identify every bad product
// from its name. This keeps primary meals limited to familiar savory ingredients.
const PROTEIN_CATEGORIES: Readonly<Record<string, ProteinFamily>> = {
  "en:meats": "meat",
  "en:poultries": "meat",
  "en:sausages": "meat",
  "en:hams": "meat",
  "en:prepared-meats": "meat",
  "en:fishes": "seafood",
  "en:canned-fishes": "seafood",
  "en:seafood": "seafood",
  "en:eggs": "egg",
  "en:meat-alternatives": "plant",
  "en:legumes": "plant",
  "en:canned-legumes": "plant",
};

const BASE_CATEGORIES: Readonly<Record<string, "pasta" | "rice" | "couscous" | "bread">> = {
  "en:pastas": "pasta",
  "en:rices": "rice",
  "en:couscous": "couscous",
  "en:breads": "bread",
};

const PRODUCE_CATEGORIES = new Set([
  "en:fresh-vegetables",
  "en:vegetables",
  "en:salads",
  "en:canned-vegetables",
  "en:frozen-vegetables",
  "en:olives",
]);

const DAIRY_SUPPORT_CATEGORIES = new Set([
  "en:butters",
  "en:creams",
  "en:cheeses",
]);

const SUPPORT_CATEGORIES = new Set([
  "en:tomato-sauces",
  "en:sauces",
  "en:condiments",
  "en:vegetable-oils",
  "en:vinegars",
  "en:spices",
  ...DAIRY_SUPPORT_CATEGORIES,
]);
const COMPOSITE_DISH_PATTERN =
  /\b(casoncelli|ravioli|tortellini|lasagn[ae]|cannelloni|filled pasta|stuffed pasta)\b/i;
const READY_MEAL_CATEGORIES = new Set(["en:soups", "en:frozen-pizzas"]);
const COMPOSED_SALAD_PATTERN =
  /\b(tuna|salmon|chicken|pasta|couscous|beans?|chickpeas?|falafel|tabbouleh)\b/i;

function categoryId(product: CatalogProduct): string | null {
  return product.category?.id ?? null;
}

function searchableProductText(product: CatalogProduct): string {
  return `${product.name} ${product.category?.name ?? ""}`.toLowerCase();
}

export function hasUsableMealProductName(product: CatalogProduct): boolean {
  const name = product.name.trim();
  const digits = name.replace(/\D/g, "").length;
  const letters = name.replace(/[^a-zA-Z]/g, "").length;

  return (
    name.length > 0 &&
    !/^\d+$/.test(name) &&
    !(digits >= 8 && digits > letters)
  );
}

export function savoryMealProductProfile(
  product: CatalogProduct,
): SavoryMealProductProfile | null {
  if (!hasUsableMealProductName(product)) {
    return null;
  }

  const category = categoryId(product);
  if (!category) {
    return null;
  }

  // Filled pasta already contains its defining filling. Treating it as a plain
  // carbohydrate base makes the planner add an unrelated second protein.
  if (category === "en:pastas" && COMPOSITE_DISH_PATTERN.test(product.name)) {
    return {
      role: "protein",
      proteinFamily: "meat",
      dairySupport: false,
      baseKind: null,
    };
  }

  if (
    READY_MEAL_CATEGORIES.has(category) ||
    (category === "en:salads" && COMPOSED_SALAD_PATTERN.test(product.name))
  ) {
    return {
      role: "readyMeal",
      proteinFamily: null,
      dairySupport: false,
      baseKind: null,
    };
  }

  const proteinFamily = PROTEIN_CATEGORIES[category];
  if (proteinFamily) {
    return {
      role: "protein",
      proteinFamily,
      dairySupport: false,
      baseKind: null,
    };
  }

  const baseKind = BASE_CATEGORIES[category];
  if (baseKind) {
    return {
      role: "base",
      proteinFamily: null,
      dairySupport: false,
      baseKind,
    };
  }

  if (PRODUCE_CATEGORIES.has(category)) {
    return {
      role: "produce",
      proteinFamily: null,
      dairySupport: false,
      baseKind: null,
    };
  }

  if (SUPPORT_CATEGORIES.has(category)) {
    return {
      role: "support",
      proteinFamily: null,
      dairySupport: DAIRY_SUPPORT_CATEGORIES.has(category),
      baseKind: null,
    };
  }

  return null;
}

export function isMealEligibleProduct(product: CatalogProduct): boolean {
  return savoryMealProductProfile(product) !== null;
}

export function filterMealEligibleProducts(
  products: readonly CatalogProduct[],
): CatalogProduct[] {
  return products.filter(isMealEligibleProduct);
}

/** Nutritional goals apply to a complete meal, not a ban on vegetables. */
export function filterRoleAwareMealProducts(products: readonly CatalogProduct[], goal: NutritionalGoal | null): CatalogProduct[] {
  if (!goal) return filterMealEligibleProducts(products);
  return filterMealEligibleProducts(products).filter((product) => {
    const role = mealProductRole(product);
    if (!role) return false;
    if (goal === "highProtein") return (role !== "protein" && role !== "readyMeal") || matchesNutritionalGoal(product, goal);
    if (goal === "balanced") {
      if (role === "protein") return matchesNutritionalGoal(product, goal);
      return product.nutriScore === "a" || product.nutriScore === "b";
    }
    return matchesNutritionalGoal(product, goal);
  });
}

export function mealProductRole(product: CatalogProduct): MealProductRole | null {
  return savoryMealProductProfile(product)?.role ?? null;
}

export function isDairySupport(product: CatalogProduct): boolean {
  return savoryMealProductProfile(product)?.dairySupport === true;
}

export function canCombineMealProducts(
  left: CatalogProduct,
  right: CatalogProduct,
): boolean {
  const leftProfile = savoryMealProductProfile(left);
  const rightProfile = savoryMealProductProfile(right);
  if (!leftProfile || !rightProfile) {
    return false;
  }

  if (leftProfile.role === "protein" && rightProfile.role === "protein") {
    return false;
  }

  if (leftProfile.role === "readyMeal" || rightProfile.role === "readyMeal") {
    const other = leftProfile.role === "readyMeal" ? rightProfile : leftProfile;
    return other.role === "produce" || other.role === "support";
  }

  const seafoodWithDairy =
    (leftProfile.proteinFamily === "seafood" && rightProfile.dairySupport) ||
    (rightProfile.proteinFamily === "seafood" && leftProfile.dairySupport);
  return !seafoodWithDairy;
}

export function templateForMealProducts(
  products: readonly CatalogProduct[],
): MealTemplate | null {
  const profiles = products.map(savoryMealProductProfile);
  if (profiles.some((profile) => profile === null)) {
    return null;
  }

  const typedProfiles = profiles as SavoryMealProductProfile[];
  const proteinCount = typedProfiles.filter(({ role }) => role === "protein").length;
  const readyMealCount = typedProfiles.filter(({ role }) => role === "readyMeal").length;
  const base = typedProfiles.find(({ role }) => role === "base");
  const produceCount = typedProfiles.filter(({ role }) => role === "produce").length;
  const supportCount = typedProfiles.filter(({ role }) => role === "support").length;

  if (readyMealCount === 1) {
    if (
      products.length < 2 ||
      products.length > 3 ||
      proteinCount !== 0 ||
      typedProfiles.some(({ role }) => role === "base") ||
      produceCount + supportCount !== products.length - 1
    ) {
      return null;
    }
    return "readyMeal";
  }

  if (
    products.length < 3 ||
    products.length > 5 ||
    proteinCount !== 1 ||
    (produceCount < 1 && supportCount < 1) ||
    typedProfiles.filter(({ role }) => role === "base").length > 1 ||
    supportCount > 1
  ) {
    return null;
  }

  for (let leftIndex = 0; leftIndex < products.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < products.length; rightIndex += 1) {
      if (!canCombineMealProducts(products[leftIndex]!, products[rightIndex]!)) {
        return null;
      }
    }
  }

  if (base?.baseKind === "pasta") {
    return "pasta";
  }
  if (base?.baseKind === "rice") {
    return "riceBowl";
  }
  if (base?.baseKind === "couscous") {
    return "couscousBowl";
  }
  if (base?.baseKind === "bread") {
    return "breadPlate";
  }
  return "proteinAndVegetables";
}

export function isClassicSavoryMealProduct(product: CatalogProduct): boolean {
  const text = searchableProductText(product);
  return (
    isMealEligibleProduct(product) &&
    !/\b(chocolate|cookie|biscuit|cake|dessert|ice cream|protein bar|sweet)\b/.test(
      text,
    )
  );
}
