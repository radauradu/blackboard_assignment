import type { CatalogProduct } from "../types/catalog";
import type { Meal, WeeklyPlan } from "../types/mealPlan";

const MULTI_USE_CATEGORIES = new Set([
  "en:pastas", "en:rices", "en:couscous", "en:tomato-sauces", "en:sauces",
  "en:condiments", "en:vegetable-oils", "en:vinegars", "en:spices",
]);

export function isMultiUsePackage(product: CatalogProduct): boolean {
  return MULTI_USE_CATEGORIES.has(product.category?.id ?? "");
}

export function calculatePackageUseTotal(
  dayProductIds: readonly (readonly string[])[],
  catalog: readonly CatalogProduct[],
): number {
  const products = new Map(catalog.map((product) => [product.id, product]));
  const multiUse = new Set<string>();
  let total = 0;
  dayProductIds.forEach((ids) => {
    new Set(ids).forEach((id) => {
      const product = products.get(id);
      if (!product) return;
      if (isMultiUsePackage(product)) {
        if (!multiUse.has(id)) {
          multiUse.add(id);
          total += product.price.amount;
        }
      } else {
        total += product.price.amount;
      }
    });
  });
  return Math.round((total + Number.EPSILON) * 100) / 100;
}

export function calculateAlternativeProjectedTotal(
  plan: WeeklyPlan,
  dayIndex: number,
  alternative: Meal,
  catalog: readonly CatalogProduct[],
): number {
  return calculatePackageUseTotal(
    plan.days.map((day) => (day.dayIndex === dayIndex ? alternative : day.primaryMeal).ingredients.map(({ productId }) => productId)),
    catalog,
  );
}
