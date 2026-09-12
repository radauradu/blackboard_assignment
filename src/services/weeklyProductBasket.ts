import type { CatalogProduct } from "../types/catalog";
import { canCombineMealProducts, isClassicSavoryMealProduct, savoryMealProductProfile, templateForMealProducts, type MealProductRole, type MealTemplate } from "../data/mealProductClassification";
import { calculatePackageUseTotal } from "./weeklyPlanPricing";

export const WEEKLY_DAY_COUNT = 7;
export type RandomSource = () => number;
export type SavoryDayAssignment = { dayIndex: number; productIds: readonly string[]; template: MealTemplate };
export type WeeklyProductBasket = { products: readonly CatalogProduct[]; productIds: readonly string[]; spend: number; dayAssignments: readonly SavoryDayAssignment[] };
export type ExpectedWeeklySelection = { dayProductIds: readonly (readonly string[])[]; productIds: readonly string[]; spend: number; dayAssignments?: readonly SavoryDayAssignment[] };
type IndexedProduct = { product: CatalogProduct; cents: number; catalogIndex: number; role: MealProductRole; category: string; priority: number };
type RoleIndex = Record<MealProductRole, IndexedProduct[]>;
export function amountToCents(amount: number): number { return Math.round((amount + Number.EPSILON) * 100); }
export function centsToAmount(cents: number): number { return cents / 100; }
function signature(products: readonly IndexedProduct[]): string { return products.map(({ product }) => product.id).sort().join("\u0000"); }
function categoryKey(product: CatalogProduct): string { return product.category?.id ?? `department:${product.department.id}`; }
function buildIndex(products: readonly CatalogProduct[], budgetCents: number, random: RandomSource): RoleIndex {
  const index: RoleIndex = { protein: [], base: [], produce: [], support: [], readyMeal: [] }; const seen = new Set<string>();
  products.forEach((product, catalogIndex) => { const profile = savoryMealProductProfile(product); const cents = amountToCents(product.price.amount);
    if (!profile || seen.has(product.id) || !isClassicSavoryMealProduct(product) || product.price.currency !== "EUR" || !Number.isFinite(product.price.amount) || cents <= 0 || cents > budgetCents) return;
    seen.add(product.id); index[profile.role].push({ product, cents, catalogIndex, role: profile.role, category: categoryKey(product), priority: Math.min(Math.max(random(), 0), 1 - Number.EPSILON) }); }); return index;
}
function choose(options: readonly IndexedProduct[], current: readonly IndexedProduct[], purchased: ReadonlySet<string>, usage: ReadonlyMap<string, number>, remaining: number, excluded: ReadonlySet<string>, idealPrice: number, random: RandomSource): IndexedProduct | null {
  let best: IndexedProduct | null = null; let score = Infinity;
  for (const option of options) { if (excluded.has(option.product.id) || current.some(({ product }) => product.id === option.product.id) || !current.every(({ product }) => canCombineMealProducts(product, option.product))) continue;
    const alreadyPurchased = purchased.has(option.product.id); const added = alreadyPurchased ? 0 : option.cents; if (added > remaining) continue;
    // New packages improve variety while affordable; reused packages cost nothing
    // and keep constrained menus viable. Random priority is deliberately the
    // final tie-breaker so catalog order cannot recreate the same week.
    const reusePenalty = alreadyPurchased ? 20_000 : 0;
    const nextScore = (usage.get(option.category) ?? 0) * 100_000 + reusePenalty + Math.abs(added - idealPrice) * 10 + option.priority * 1_000;
    if (nextScore < score || (nextScore === score && random() < 0.5)) { best = option; score = nextScore; } }
  return best;
}
function add(current: IndexedProduct[], option: IndexedProduct | null, purchased: Set<string>, usage: Map<string, number>): void { if (!option) return; current.push(option); purchased.add(option.product.id); usage.set(option.category, (usage.get(option.category) ?? 0) + 1); }
function spent(ids: ReadonlySet<string>, products: ReadonlyMap<string, IndexedProduct>): number { let total = 0; for (const id of ids) total += products.get(id)?.cents ?? 0; return total; }

export function validateSavoryDayAssignments(assignments: readonly SavoryDayAssignment[], candidates: readonly CatalogProduct[]): void {
  if (assignments.length !== WEEKLY_DAY_COUNT) throw new Error(`A weekly plan needs exactly ${WEEKLY_DAY_COUNT} savory days.`);
  const byId = new Map(candidates.map((p) => [p.id, p])); const signatures = new Set<string>();
  assignments.forEach((assignment, index) => { if (assignment.dayIndex !== index || assignment.productIds.length < 2 || assignment.productIds.length > 5 || new Set(assignment.productIds).size !== assignment.productIds.length) throw new Error("A savory day assignment has an invalid shape.");
    const products = assignment.productIds.map((id) => byId.get(id)); if (products.some((product) => !product)) throw new Error("A savory day assignment references an unavailable product.");
    const template = templateForMealProducts(products as CatalogProduct[]); if (!template || template !== assignment.template || (template !== "readyMeal" && assignment.productIds.length < 3)) throw new Error("A savory day assignment is not a coherent classic meal.");
    const key = [...assignment.productIds].sort().join("\u0000"); if (signatures.has(key)) throw new Error("Savory day assignments must have distinct ingredient sets."); signatures.add(key); });
}
export function selectWeeklyProductBasket(products: readonly CatalogProduct[], budget: number, random: RandomSource = Math.random): WeeklyProductBasket | null {
  if (!Number.isFinite(budget) || budget <= 0) return null; const budgetCents = amountToCents(budget); const index = buildIndex(products, budgetCents, random);
  if (!index.protein.length || !index.produce.length) return null; const all = Object.values(index).flat(); const byId = new Map(all.map((item) => [item.product.id, item])); const purchased = new Set<string>(); const usage = new Map<string, number>(); const signatures = new Set<string>(); const assignments: SavoryDayAssignment[] = [];
  const targetCents = Math.round(budgetCents * (0.9 + Math.min(Math.max(random(), 0), 1) * 0.1));
  const targetItemCounts = [3, 3, 3, 3, 3, 3, 3]; const idealPrice = targetCents / targetItemCounts.reduce((total, count) => total + count, 0);
  for (let dayIndex = 0; dayIndex < WEEKLY_DAY_COUNT; dayIndex += 1) { const current: IndexedProduct[] = []; const excluded = new Set<string>(); const remaining = () => budgetCents - spent(purchased, byId);
    // Role-indexed scans replace the previous anchor × companion Cartesian search.
    add(current, choose(index.protein, current, purchased, usage, remaining(), excluded, idealPrice, random), purchased, usage); add(current, choose(index.produce, current, purchased, usage, remaining(), excluded, idealPrice, random) ?? choose(index.support, current, purchased, usage, remaining(), excluded, idealPrice, random), purchased, usage); if (current.length < 2) return null;
    const base = choose(index.base, current, purchased, usage, remaining(), excluded, idealPrice, random); if (base) add(current, base, purchased, usage); else add(current, choose(index.produce, current, purchased, usage, remaining(), excluded, idealPrice, random) ?? choose(index.support, current, purchased, usage, remaining(), excluded, idealPrice, random), purchased, usage);
    if (current.length < 3) return null;
    if (targetItemCounts[dayIndex] === 4) {
      add(current, choose(index.support, current, purchased, usage, remaining(), excluded, idealPrice, random) ?? choose(index.produce, current, purchased, usage, remaining(), excluded, idealPrice, random), purchased, usage);
    }
    if (current.length !== targetItemCounts[dayIndex]) return null;
    let template = templateForMealProducts(current.map(({ product }) => product)); if (!template || signatures.has(signature(current))) { const removed = current.pop(); if (removed) { excluded.add(removed.product.id); add(current, choose(index[removed.role], current, purchased, usage, remaining(), excluded, idealPrice, random), purchased, usage); } template = templateForMealProducts(current.map(({ product }) => product)); }
    if (!template || signatures.has(signature(current))) return null; signatures.add(signature(current)); assignments.push({ dayIndex, productIds: current.map(({ product }) => product.id), template }); }
  const selected = all.filter(({ product }) => purchased.has(product.id)).sort((a,b) => a.catalogIndex - b.catalogIndex).map(({ product }) => product); const packageSpend = calculatePackageUseTotal(assignments.map(({ productIds }) => productIds), selected); if (amountToCents(packageSpend) > budgetCents) return null; validateSavoryDayAssignments(assignments, selected);
  return { products: selected, productIds: selected.map(({ id }) => id), spend: packageSpend, dayAssignments: assignments };
}
