import { describe, expect, it, vi } from "vitest";

import { filterCatalogProducts } from "../src/data/catalogFilters";
import {
  generateWeeklyMealPlan,
  MEAL_PLAN_GENERATION_STAGES,
  type MealPlanGenerationDiagnostic,
  NoViableMealPlanError,
} from "../src/services/mealPlanGeneration";
import type { MealPlanFetcher } from "../src/services/openAiMealPlan";
import type {
  GeneratedDayPlan,
  GeneratedMeal,
} from "../src/types/generatedMealPlan";
import { catalogProduct } from "./mealPlanFixtures";

const SAVORY_CATEGORIES = [
  "en:poultries",
  "en:meats",
  "en:fishes",
  "en:meat-alternatives",
  "en:eggs",
  "en:pastas",
  "en:rices",
  "en:couscous",
  "en:breads",
  "en:vegetables",
  "en:salads",
  "en:frozen-vegetables",
  "en:tomato-sauces",
] as const;

function generationCatalog(count = 26) {
  return Array.from({ length: count }, (_, index) => {
    const categoryId = SAVORY_CATEGORIES[index % SAVORY_CATEGORIES.length]!;
    const product = catalogProduct(`p${index}`, 1, categoryId);
    product.category = { id: categoryId, name: categoryId };
    return product;
  });
}

const catalog = generationCatalog();
const input = {
  budget: 30,
  dietaryNeeds: [] as const,
  nutritionalGoal: null,
};

type RequestContext = {
  dayAssignments: Array<{
    dayIndex: number;
    mealTemplate: string;
    productIds: string[];
    candidateProducts: Array<
      [string, string, string | null, number, string, string | null]
    >;
  }>;
};

function requestContext(init: RequestInit): RequestContext {
  const body = JSON.parse(String(init.body)) as {
    input: Array<{ content: Array<{ text: string }> }>;
  };
  return JSON.parse(body.input[1]!.content[0]!.text) as RequestContext;
}

function isSelectorRequest(init: RequestInit): boolean {
  const body = JSON.parse(String(init.body)) as {
    text?: { format?: { name?: string } };
  };
  return body.text?.format?.name === "weekly_ingredient_selection";
}

function rejectedSelectorResponse() {
  return {
    ok: false,
    status: 400,
    json: async () => ({ error: { message: "selection unavailable" } }),
  };
}

function selectedMenuResponse(init: RequestInit) {
  const body = JSON.parse(String(init.body)) as {
    input: Array<{ content: Array<{ text: string }> }>;
  };
  const context = JSON.parse(body.input[1]!.content[0]!.text) as {
    candidatesByRole: Record<string, Array<[string, string]>>;
  };
  const byRole = (role: string) => context.candidatesByRole[role]?.map(([reference]) => reference) ?? [];
  const proteins = byRole("protein");
  const vegetables = byRole("vegetable");
  const bases = byRole("base");
  if (proteins.length < 7 || vegetables.length === 0 || bases.length === 0) {
    throw new Error("Test selector needs enough regular-meal candidates.");
  }
  return {
    days: Array.from({ length: 7 }, (_, dayIndex) => ({
      dayIndex,
      productIds: [
        proteins[dayIndex]!,
        vegetables[dayIndex % vegetables.length]!,
        bases[dayIndex % bases.length]!,
      ],
    })),
  };
}

function generatedMealFor(
  selectedProductIds: readonly string[],
  name: string,
): GeneratedMeal {
  return {
    name,
    prepTimeMinutes: 20,
    servings: 2,
    ingredients: selectedProductIds.map((productId) => ({
      productId,
      quantity: { amount: 1, unit: "piece" },
    })),
    pantryItems: [],
    steps: [
      { instruction: "Prepare the ingredients.", productIds: [...selectedProductIds], pantryItems: [] },
      { instruction: "Cook the ingredients.", productIds: [...selectedProductIds], pantryItems: [] },
      { instruction: "Combine and serve.", productIds: [...selectedProductIds], pantryItems: [] },
    ],
  };
}

function generatedBatchResponse(init: RequestInit): { days: GeneratedDayPlan[] } {
  const context = requestContext(init);
  return {
    days: context.dayAssignments.map(({ dayIndex, productIds }) => {
      return {
        dayIndex,
        primaryMeal: generatedMealFor(productIds, `Primary ${dayIndex}`),
      };
    }),
  };
}

function completedResponse(plan: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      status: "completed",
      error: null,
      output_text: JSON.stringify(plan),
    }),
  };
}

function completedFetcher(
  transform?: (plan: { days: GeneratedDayPlan[] }) => void,
): MealPlanFetcher {
  return async (_url, init) => {
    const plan = generatedBatchResponse(init);
    transform?.(plan);
    return completedResponse(plan);
  };
}

function streamBody(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

function streamFrame(type: string, payload: Record<string, unknown>): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`;
}

describe("weekly meal-plan orchestration", () => {
  it("returns a validated OpenAI plan on success", async () => {
    const plan = await generateWeeklyMealPlan(input, {
      apiKey: "test-key",
      catalog,
      fetcher: completedFetcher(),
      streamingSupported: false,
    });

    expect(plan.source).toBe("openai");
    expect(plan.days).toHaveLength(7);
    expect(plan.estimatedTotal.amount).toBeLessThanOrEqual(input.budget);
  });

  it("uses a successful global selector's assignments in exactly two recipe batches", async () => {
    const matchingCatalog = generationCatalog(26);
    let expectedDayProductIds: string[][] = [];
    const fetcher = vi.fn<MealPlanFetcher>(async (_url, init) => {
      if (isSelectorRequest(init)) {
        const selected = selectedMenuResponse(init);
        const body = JSON.parse(String(init.body)) as {
          input: Array<{ content: Array<{ text: string }> }>;
        };
        const selectorContext = JSON.parse(body.input[1]!.content[0]!.text) as {
          candidatesByRole: Record<string, Array<[string, string]>>;
        };
        const idByReference = new Map(
          Object.values(selectorContext.candidatesByRole).flat().map(([reference, name]) => [reference, name.replace("Catalog ", "")]),
        );
        expectedDayProductIds = selected.days.map(({ productIds }) =>
          productIds.map((reference) => idByReference.get(reference)!),
        );
        return completedResponse(selected);
      }
      return completedResponse(generatedBatchResponse(init));
    });
    const diagnostics: MealPlanGenerationDiagnostic[] = [];

    const plan = await generateWeeklyMealPlan(input, {
      apiKey: "test-key",
      catalog: matchingCatalog,
      fetcher,
      streamingSupported: false,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(plan.source).toBe("openai");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(diagnostics.find(({ type }) => type === "selection")).toMatchObject({
      type: "selection",
      source: "openai",
      recoveryReason: null,
    });
    const recipeDayProductIds = fetcher.mock.calls
      .filter(([, request]) => !isSelectorRequest(request))
      .flatMap(([, request]) => requestContext(request).dayAssignments.map((assignment) => {
        const nameByReference = new Map(
          assignment.candidateProducts.map(([reference, name]) => [reference, name.replace("Catalog ", "")]),
        );
        return assignment.productIds.map((reference) => nameByReference.get(reference)!);
      }));
    expect(recipeDayProductIds).toEqual(expectedDayProductIds);
  });

  it("uses fallback immediately when the API key is missing", async () => {
    const fetcher = vi.fn<MealPlanFetcher>();
    const diagnostics: MealPlanGenerationDiagnostic[] = [];
    const plan = await generateWeeklyMealPlan(input, {
      apiKey: null,
      catalog,
      fetcher,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(plan.source).toBe("fallback");
    expect(fetcher).not.toHaveBeenCalled();
    expect(diagnostics.at(-1)).toMatchObject({
      type: "result",
      source: "fallback",
      reason: "OpenAI API key is missing.",
    });
  });

  it("streams two batches and sends only the assigned basket products", async () => {
    const matchingCatalog = generationCatalog(131);
    const excluded = catalogProduct("excluded", 1, "en:pastas");
    excluded.category = { id: "en:pastas", name: "en:pastas" };
    excluded.nutrition.proteins100g = 1;
    const expandedCatalog = [...matchingCatalog, excluded];
    const filteredInput = {
      ...input,
      nutritionalGoal: "highProtein" as const,
    };
    const expectedCandidates = filterCatalogProducts(
      expandedCatalog,
      filteredInput,
    );
    const fetcher = vi.fn<MealPlanFetcher>(async (_url, init) => {
      if (isSelectorRequest(init)) return rejectedSelectorResponse();
      const outputText = JSON.stringify(generatedBatchResponse(init));
      const events = [
        streamFrame("response.created", {
          response: { status: "in_progress" },
        }),
        streamFrame("response.output_text.delta", { delta: outputText }),
        streamFrame("response.completed", {
          response: {
            status: "completed",
            error: null,
            output_text: outputText,
          },
        }),
      ];
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        body: streamBody(events),
      };
    });
    const stages: string[] = [];
    const diagnostics: MealPlanGenerationDiagnostic[] = [];

    const plan = await generateWeeklyMealPlan(filteredInput, {
      apiKey: "test-key",
      catalog: expandedCatalog,
      fetcher,
      streamingSupported: true,
      random: () => 1 - Number.EPSILON,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      onProgress: (stage) => stages.push(stage),
    });

    expect(plan.source).toBe("openai");
    expect(fetcher).toHaveBeenCalledTimes(3);
    const contexts = fetcher.mock.calls
      .filter(([, init]) => !isSelectorRequest(init))
      .map(([, init]) => requestContext(init));
    expect(contexts.map(({ dayAssignments }) =>
      dayAssignments.map(({ dayIndex }) => dayIndex),
    )).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6],
    ]);
    expect(
      contexts.flatMap(({ dayAssignments }) =>
        dayAssignments.map(({ mealTemplate }) => mealTemplate),
      ).every(
        (template) =>
          ["pasta", "riceBowl", "couscousBowl", "breadPlate", "proteinAndVegetables"].includes(template),
      ),
    ).toBe(true);
    expect(expectedCandidates).toHaveLength(131);
    contexts.forEach((context) => {
      context.dayAssignments.forEach((assignment) => {
        expect(new Set(assignment.candidateProducts.map(([id]) => id))).toEqual(
          new Set(assignment.productIds),
        );
      });
    });
    expect(
      new Set(
        contexts.flatMap(({ dayAssignments }) =>
          dayAssignments.flatMap(({ candidateProducts }) =>
            candidateProducts.map(([id]) => id),
          ),
        ),
      ).size,
    ).toBeGreaterThanOrEqual(7);
    expect(stages).toEqual([
      MEAL_PLAN_GENERATION_STAGES.selectingIngredients,
      MEAL_PLAN_GENERATION_STAGES.writingRecipes,
      MEAL_PLAN_GENERATION_STAGES.finishingPlan,
      MEAL_PLAN_GENERATION_STAGES.validatingPlan,
    ]);
    expect(diagnostics.filter(({ type }) => type === "request")).toHaveLength(2);
    expect(diagnostics[0]).toMatchObject({
      type: "catalog",
      catalogProductCount: 132,
      filteredProductCount: 132,
      selectedProductCount: expect.any(Number),
    });
    expect(diagnostics.find(({ type }) => type === "selection")).toMatchObject({
      type: "selection",
      source: "local",
      recoveryReason: "transport_failure",
      localAssignmentScope: "sampled_menu",
      candidateFingerprint: expect.stringMatching(/^\d+:[a-f0-9]{8}$/),
      assignmentFingerprint: expect.stringMatching(/^\d+:[a-f0-9]{8}$/),
    });
    expect(diagnostics.at(-1)).toMatchObject({
      type: "result",
      source: "openai",
      reason: null,
    });
  });

  it("does not duplicate requests when SSE bodies are unavailable", async () => {
    const fetcher = vi.fn<MealPlanFetcher>(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    }));

    const plan = await generateWeeklyMealPlan(input, {
      apiKey: "test-key",
      catalog,
      fetcher,
      streamingSupported: true,
    });

    expect(plan.source).toBe("fallback");
    expect(fetcher).toHaveBeenCalledTimes(3);
    const requestBodies = fetcher.mock.calls.map(([, init]) =>
      JSON.parse(String(init.body)) as { stream?: boolean },
    );
    expect(requestBodies.every(({ stream }) => stream)).toBe(true);
  });

  it("falls back on malformed or invalid model output", async () => {
    const malformed = await generateWeeklyMealPlan(input, {
      apiKey: "test-key",
      catalog,
      fetcher: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          status: "completed",
          error: null,
          output_text: "not-json",
        }),
      }),
      streamingSupported: false,
    });

    const invalidDiagnostics: MealPlanGenerationDiagnostic[] = [];
    const invalid = await generateWeeklyMealPlan(input, {
      apiKey: "test-key",
      catalog,
      fetcher: completedFetcher((plan) => {
        if (plan.days[0]?.dayIndex === 0) {
          plan.days[0].primaryMeal.ingredients[0]!.productId = "foreign-id";
        }
      }),
      onDiagnostic: (diagnostic) => invalidDiagnostics.push(diagnostic),
      streamingSupported: false,
    });

    expect(malformed.source).toBe("fallback");
    expect(invalid.source).toBe("fallback");
    expect(invalidDiagnostics.at(-1)).toMatchObject({
      type: "result",
      source: "fallback",
      reason: "Generated meal plan failed local validation.",
      validation: expect.objectContaining({ code: expect.any(String) }),
    });
  });

  it("retries the primary requests once before using fallback", async () => {
    let calls = 0;
    const diagnostics: MealPlanGenerationDiagnostic[] = [];
    const fetcher: MealPlanFetcher = async (_url, init) => {
      calls += 1;
      const response = generatedBatchResponse(init);
      if (calls <= 2) {
        response.days[0]!.primaryMeal.ingredients[0]!.productId = "foreign-id";
      }
      return completedResponse(response);
    };

    const plan = await generateWeeklyMealPlan(input, {
      apiKey: "test-key",
      catalog,
      fetcher,
      streamingSupported: false,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(plan.source).toBe("openai");
    expect(calls).toBe(5);
    expect(diagnostics.filter((diagnostic) => diagnostic.type === "request")
      .map((diagnostic) => diagnostic.request.attempt)).toEqual([1, 1, 2, 2]);
  });

  it("keeps an OpenAI plan when step metadata omits an assigned product", async () => {
    const diagnostics: MealPlanGenerationDiagnostic[] = [];
    const plan = await generateWeeklyMealPlan(input, {
      apiKey: "test-key",
      catalog,
      fetcher: completedFetcher((batch) => {
        const firstMeal = batch.days[0]?.primaryMeal;
        const omittedProductId = firstMeal?.ingredients.at(-1)?.productId;
        if (!firstMeal || !omittedProductId) {
          return;
        }
        firstMeal.steps.forEach((step) => {
          step.productIds = step.productIds.filter(
            (productId) => productId !== omittedProductId,
          );
        });
      }),
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      streamingSupported: false,
    });

    expect(plan.source).toBe("openai");
    expect(diagnostics.at(-1)).toMatchObject({
      type: "result",
      source: "openai",
      validation: null,
    });
  });

  it("keeps an OpenAI plan when text uses an allowed but undeclared pantry staple", async () => {
    const diagnostics: MealPlanGenerationDiagnostic[] = [];
    const plan = await generateWeeklyMealPlan(input, {
      apiKey: "test-key",
      catalog,
      fetcher: completedFetcher((batch) => {
        const firstStep = batch.days[0]?.primaryMeal.steps[0];
        if (firstStep) {
          firstStep.instruction =
            "Cook the listed ingredients with olive oil.";
          firstStep.pantryItems = [];
        }
      }),
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      streamingSupported: false,
    });

    expect(plan.source).toBe("openai");
    expect(plan.days[0].primaryMeal.pantryItems).toContain("olive oil");
    expect(diagnostics.at(-1)).toMatchObject({
      type: "result",
      source: "openai",
      validation: null,
    });
  });

  it("keeps an OpenAI plan when a recipe borrows another day's product name", async () => {
    const diagnostics: MealPlanGenerationDiagnostic[] = [];
    const fetcher = vi.fn<MealPlanFetcher>(completedFetcher((batch) => {
      const firstDay = batch.days[0];
      const secondDay = batch.days[1];
      const otherDayProduct = firstDay?.primaryMeal.ingredients[0]?.productId;
      if (secondDay && otherDayProduct) {
        secondDay.primaryMeal.name = `Meal with Catalog ${otherDayProduct}`;
        secondDay.primaryMeal.steps[1]!.instruction = `Cook Catalog ${otherDayProduct} until ready.`;
      }
    }));
    const plan = await generateWeeklyMealPlan(input, {
      apiKey: "test-key",
      catalog,
      fetcher,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      streamingSupported: false,
    });

    expect(plan.source).toBe("openai");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(diagnostics.some((diagnostic) =>
      diagnostic.type === "repair" &&
      diagnostic.repair === "repaired_cross_day_product_name",
    )).toBe(true);
    expect(diagnostics.some((diagnostic) => diagnostic.type === "result" && diagnostic.source === "retry")).toBe(false);
    expect(diagnostics.at(-1)).toMatchObject({
      type: "result",
      source: "openai",
      validation: null,
    });
  });

  it("falls back on network/API failure, incomplete output, and refusal", async () => {
    const networkFailure: MealPlanFetcher = async () => {
      throw new Error("offline");
    };
    const apiFailure: MealPlanFetcher = async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "rate limited" } }),
    });
    const incomplete: MealPlanFetcher = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "incomplete", error: null, output: [] }),
    });
    const refusal: MealPlanFetcher = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: "completed",
        error: null,
        output: [
          {
            content: [{ type: "refusal", refusal: "No" }],
          },
        ],
      }),
    });

    for (const fetcher of [networkFailure, apiFailure, incomplete, refusal]) {
      const plan = await generateWeeklyMealPlan(input, {
        apiKey: "test-key",
        catalog,
        fetcher,
        streamingSupported: false,
      });
      expect(plan.source).toBe("fallback");
    }
  });

  it("falls back when a model ignores an exact day assignment", async () => {
    const plan = await generateWeeklyMealPlan(
      input,
      {
        apiKey: "test-key",
        catalog,
        fetcher: completedFetcher((batch) => {
          if (batch.days[0]?.dayIndex === 0 && batch.days[1]) {
            const wrongIngredients = batch.days[1].primaryMeal.ingredients;
            batch.days[0].primaryMeal.ingredients = wrongIngredients;
          }
        }),
        streamingSupported: false,
      },
    );

    expect(plan.source).toBe("fallback");
    expect(plan.estimatedTotal.amount).toBeLessThanOrEqual(input.budget);
  });

  it("starts both buffered batch requests concurrently", async () => {
    const pending: Array<{
      init: RequestInit;
      resolve: (response: ReturnType<typeof completedResponse>) => void;
    }> = [];
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const fetcher = vi.fn<MealPlanFetcher>(
      (_url, init) => {
        if (isSelectorRequest(init)) {
          return Promise.resolve(rejectedSelectorResponse());
        }
        return new Promise((resolve) => {
          activeRequests += 1;
          maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
          pending.push({
            init,
            resolve: (response) => {
              activeRequests -= 1;
              resolve(response);
            },
          });

          if (pending.length === 2) {
            pending.forEach((request) =>
              request.resolve(
                completedResponse(generatedBatchResponse(request.init)),
              ),
            );
          }
        });
      },
    );

    const plan = await generateWeeklyMealPlan(input, {
      apiKey: "test-key",
      catalog,
      fetcher,
      streamingSupported: false,
    });

    expect(plan.source).toBe("openai");
    expect(maximumActiveRequests).toBe(2);
  });

  it("falls back after a request timeout", async () => {
    const fetcher: MealPlanFetcher = (_url, init) => {
      if (isSelectorRequest(init)) return Promise.resolve(rejectedSelectorResponse());
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      });
    };

    const plan = await generateWeeklyMealPlan(input, {
      apiKey: "test-key",
      catalog,
      fetcher,
      timeoutMs: 1,
      streamingSupported: false,
    });

    expect(plan.source).toBe("fallback");
  });

  it("reports an error when no eligible package fits the budget", async () => {
    await expect(
      generateWeeklyMealPlan(
        { ...input, budget: 2 },
        {
          apiKey: null,
          catalog: [catalogProduct("expensive", 3)],
        },
      ),
    ).rejects.toBeInstanceOf(NoViableMealPlanError);
  });
});
