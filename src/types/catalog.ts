export type CatalogReference = {
  id: string;
  name: string;
};

export type CatalogAmount = {
  value: number;
  unit: string;
};

export type CatalogPrice = {
  amount: number;
  currency: string;
};

export type CatalogUnitPrice = {
  amount: number;
  unit: string;
};

export type CatalogNutrition = {
  energyKcal100g: number | null;
  fat100g: number | null;
  saturatedFat100g: number | null;
  carbohydrates100g: number | null;
  sugars100g: number | null;
  fiber100g: number | null;
  proteins100g: number | null;
  salt100g: number | null;
};

export type NutriScore = "a" | "b" | "c" | "d" | "e";

export type CatalogProduct = {
  id: string;
  barcode: string;
  name: string;
  brand: string;
  department: CatalogReference;
  category: CatalogReference | null;
  quantity: string | null;
  netContent: CatalogAmount | null;
  price: CatalogPrice;
  unitPrice: CatalogUnitPrice | null;
  nutrition: CatalogNutrition;
  nutriScore: NutriScore | null;
  novaGroup: number | null;
  labels: CatalogReference[];
  allergens: CatalogReference[];
};
