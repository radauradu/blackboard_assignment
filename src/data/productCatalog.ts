import catalogJson from "../../data/product_catalog_en.json";

import type { CatalogProduct } from "../types/catalog";

// The checked-in catalog is immutable application input; filters always return
// new arrays and never modify its product records.
export const productCatalog = catalogJson as unknown as readonly CatalogProduct[];
