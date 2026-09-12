import { PANTRY_ITEMS } from "./recipeGrounding";

const generatedIngredientSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    productId: { type: "string" },
    quantity: {
      type: "object",
      additionalProperties: false,
      properties: {
        amount: { type: "number", minimum: 0.1, maximum: 10000 },
        unit: {
          type: "string",
          enum: ["g", "kg", "ml", "l", "piece", "can", "pack", "bar", "tbsp", "tsp", "cup"],
        },
      },
      required: ["amount", "unit"],
    },
  },
  required: ["productId", "quantity"],
} as const;

const generatedMealSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    prepTimeMinutes: {
      type: "integer",
      minimum: 5,
      maximum: 180,
    },
    servings: {
      type: "integer",
      minimum: 1,
      maximum: 8,
    },
    ingredients: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: generatedIngredientSchema,
    },
    pantryItems: {
      type: "array",
      items: {
        type: "string",
        enum: PANTRY_ITEMS,
      },
    },
    steps: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          instruction: { type: "string", minLength: 1, maxLength: 400 },
          productIds: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            items: { type: "string" },
          },
          pantryItems: {
            type: "array",
            items: { type: "string", enum: PANTRY_ITEMS },
          },
        },
        required: ["instruction", "productIds", "pantryItems"],
      },
    },
  },
  required: [
    "name",
    "prepTimeMinutes",
    "servings",
    "ingredients",
    "pantryItems",
    "steps",
  ],
} as const;

const generatedPrimaryDaySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    dayIndex: {
      type: "integer",
      minimum: 0,
      maximum: 6,
    },
    primaryMeal: generatedMealSchema,
  },
  required: ["dayIndex", "primaryMeal"],
} as const;

export function createMealPlanBatchJsonSchema(dayCount: number) {
  if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 7) {
    throw new RangeError("A meal-plan batch must contain 1-7 days.");
  }

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      days: {
        type: "array",
        minItems: dayCount,
        maxItems: dayCount,
        items: generatedPrimaryDaySchema,
      },
    },
    required: ["days"],
  } as const;
}

export const weeklyMealPlanJsonSchema = createMealPlanBatchJsonSchema(7);
