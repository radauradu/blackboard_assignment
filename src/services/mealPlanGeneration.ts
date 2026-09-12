import { filterCatalogProducts } from "../data/catalogFilters";
import { filterRoleAwareMealProducts } from "../data/mealProductClassification";
import { productCatalog } from "../data/productCatalog";
import type { CatalogProduct } from "../types/catalog";
import type { DietaryNeed, NutritionalGoal } from "../types/flow";
import type { WeeklyPlan } from "../types/mealPlan";
import { generateFallbackWeeklyPlan } from "./fallbackMealPlan";
import {
  requestOpenAiMealPlanStream,
  requestOpenAiMealPlan,
  supportsResponseStreaming,
  type MealPlanFetcher,
  OpenAiMealPlanError,
  OpenAiStreamingUnavailableError,
  type OpenAiRequestDiagnostic,
} from "./openAiMealPlan";
import {
  MealPlanValidationError,
  type MealPlanValidationCode,
  validateAndEnrichWeeklyPlan,
} from "./mealPlanValidation";
import {
  type ExpectedWeeklySelection,
  type RandomSource,
  validateSavoryDayAssignments,
} from "./weeklyProductBasket";
import {
  buildRandomCandidateMenuWithRecovery,
  CandidateSelectionValidationError,
  type CandidateSelectionNormalization,
  type CandidateSelectionValidationCode,
  validateSelectedCandidateMenu,
} from "./llmCandidateSelection";
import {
  CandidateSelectorError,
  requestOpenAiCandidateSelection,
  type CandidateSelectorDiagnostic,
  type CandidateSelectorFailureCode,
} from "./openAiCandidateSelector";
import { calculatePackageUseTotal } from "./weeklyPlanPricing";

type CandidateSelectionFailureCode =
  | CandidateSelectorFailureCode
  | CandidateSelectionValidationCode
  | "unsupported_recipe_template";

export type GenerateWeeklyMealPlanInput = {
  budget: number;
  dietaryNeeds: readonly DietaryNeed[];
  nutritionalGoal: NutritionalGoal | null;
  previousPrimaryProductIds?: readonly string[];
};

type MealPlanBatch = {
  dayIndexes: readonly number[];
};

export const MEAL_PLAN_GENERATION_STAGES = {
  selectingIngredients: "selectingIngredients",
  writingRecipes: "writingRecipes",
  finishingPlan: "finishingPlan",
  validatingPlan: "validatingPlan",
} as const;

export type MealPlanGenerationStage =
  (typeof MEAL_PLAN_GENERATION_STAGES)[keyof typeof MEAL_PLAN_GENERATION_STAGES];

export type MealPlanGenerationDiagnostic =
  | {
      type: "catalog";
      catalogProductCount: number;
      filteredProductCount: number;
      selectedProductCount: number;
      preparationMs: number;
    }
  | {
      type: "request";
      request: OpenAiRequestDiagnostic;
    }
  | {
      type: "selection";
      source: "openai" | "local";
      candidateCount: number;
      selectedProductCount: number;
      spendPercent: number;
      diagnostic: CandidateSelectorDiagnostic | null;
      candidateFingerprint: string;
      assignmentFingerprint: string;
      recoveryReason: CandidateSelectionFailureCode | null;
      localAssignmentScope: "sampled_menu" | "full_catalog" | null;
      normalizations: readonly CandidateSelectionNormalization[];
      validation: { code: CandidateSelectionValidationCode; path: string | null } | null;
    }
  | {
      type: "repair";
      repair:
        | "repaired_cross_day_product_name"
        | "repaired_unassigned_staple"
        | "repaired_foreign_step_product_reference";
      path: string;
    }
  | {
      type: "result";
      source: "openai" | "fallback" | "error" | "retry";
      apiMs: number;
      validationMs: number;
      totalMs: number;
      reason: string | null;
      validation: { code: MealPlanValidationCode; path: string | null; safeDetail?: "different_selected_product" | "generic_catalog_category" | null } | null;
      attempt?: number;
    };

export type GenerateWeeklyMealPlanDependencies = {
  apiKey?: string | null;
  catalog?: readonly CatalogProduct[];
  fetcher?: MealPlanFetcher;
  timeoutMs?: number;
  onProgress?: (stage: MealPlanGenerationStage) => void;
  onDiagnostic?: (diagnostic: MealPlanGenerationDiagnostic) => void;
  streamingSupported?: boolean;
  random?: RandomSource;
};

export class NoViableMealPlanError extends Error {
  constructor() {
    super("No catalog products fit your preferences and weekly budget.");
    this.name = "NoViableMealPlanError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reportGenerationDiagnostic(
  onDiagnostic: GenerateWeeklyMealPlanDependencies["onDiagnostic"],
  diagnostic: MealPlanGenerationDiagnostic,
): void {
  try {
    onDiagnostic?.(diagnostic);
  } catch {
    // Diagnostics must never change meal-plan generation behavior.
  }
}

function diagnosticFailureReason(error: unknown): string {
  if (error instanceof MealPlanValidationError) {
    return "Generated meal plan failed local validation.";
  }
  if (error instanceof OpenAiMealPlanError) {
    return error.message;
  }
  return "Meal-plan generation failed before validation completed.";
}

function validationDiagnostic(error: unknown): { code: MealPlanValidationCode; path: string | null; safeDetail?: "different_selected_product" | "generic_catalog_category" | null } | null {
  return error instanceof MealPlanValidationError
    ? { code: error.code, path: error.path, safeDetail: error.safeDetail }
    : null;
}

function isNonRetryableGroundingFailure(error: unknown): boolean {
  return error instanceof MealPlanValidationError && error.code.startsWith("grounding_");
}

function anonymousFingerprint(values: readonly string[]): string {
  let hash = 2_166_136_261;
  [...values].sort().join("\u0000").split("").forEach((character) => {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  });
  return `${values.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function assignmentFingerprint(
  assignments: readonly { dayIndex: number; productIds: readonly string[] }[],
): string {
  return anonymousFingerprint(assignments.map(({ dayIndex, productIds }) =>
    `${dayIndex}:${[...productIds].sort().join(",")}`,
  ));
}

function selectorFailureCode(error: unknown): CandidateSelectionFailureCode {
  if (error instanceof CandidateSelectorError) return error.code;
  if (error instanceof CandidateSelectionValidationError) return error.code;
  return "transport_failure";
}

function createMealPlanBatches(): readonly MealPlanBatch[] {
  return [
    {
      dayIndexes: [0, 1, 2, 3],
    },
    {
      dayIndexes: [4, 5, 6],
    },
  ];
}

function combineBatchOutputs(
  outputs: readonly unknown[],
  batches: readonly MealPlanBatch[],
): unknown {
  if (outputs.length !== batches.length) {
    throw new Error("OpenAI must return exactly two meal-plan batches.");
  }

  const days: unknown[] = [];

  outputs.forEach((output, batchIndex) => {
    const expectedDayCount = batches[batchIndex]!.dayIndexes.length;
    if (
      !isRecord(output) ||
      Object.keys(output).length !== 1 ||
      !Array.isArray(output.days) ||
      output.days.length !== expectedDayCount
    ) {
      throw new Error(`OpenAI batch ${batchIndex} has an invalid shape.`);
    }
    days.push(...output.days);
  });

  return { days };
}

export async function generateWeeklyMealPlan(
  { budget, dietaryNeeds, nutritionalGoal, previousPrimaryProductIds = [] }: GenerateWeeklyMealPlanInput,
  {
    apiKey = null,
    catalog = productCatalog,
    fetcher,
    timeoutMs,
    onProgress,
    onDiagnostic,
    streamingSupported = supportsResponseStreaming(),
    random = Math.random,
  }: GenerateWeeklyMealPlanDependencies = {},
): Promise<WeeklyPlan> {
  const generationStartedAt = Date.now();
  const preparationStartedAt = Date.now();
  onProgress?.(MEAL_PLAN_GENERATION_STAGES.selectingIngredients);
  const llmCandidates = filterCatalogProducts(catalog, {
    dietaryNeeds,
    nutritionalGoal: null,
  });
  const mealCandidates = filterRoleAwareMealProducts(llmCandidates, nutritionalGoal);
  const randomMenu = buildRandomCandidateMenuWithRecovery(
    mealCandidates,
    budget,
    random,
    previousPrimaryProductIds,
  );
  const candidateMenu = randomMenu?.candidates ?? [];
  let basket = randomMenu?.recoveryBasket ?? null;
  let localAssignmentScope: "sampled_menu" | "full_catalog" | null = basket
    ? "sampled_menu"
    : null;
  reportGenerationDiagnostic(onDiagnostic, {
    type: "catalog",
    catalogProductCount: catalog.length,
    filteredProductCount: llmCandidates.length,
    selectedProductCount: candidateMenu.length,
    preparationMs: Date.now() - preparationStartedAt,
  });

  if (!basket) {
    reportGenerationDiagnostic(onDiagnostic, {
      type: "result",
      source: "error",
      apiMs: 0,
      validationMs: 0,
      totalMs: Date.now() - generationStartedAt,
      reason: "No catalog product fits the active filters and budget.",
      validation: null,
    });
    throw new NoViableMealPlanError();
  }

  let selectionSource: "openai" | "local" = "local";
  let selectorDiagnostic: CandidateSelectorDiagnostic | null = null;
  let recoveryReason: CandidateSelectionFailureCode | null = null;
  let selectionNormalizations: readonly CandidateSelectionNormalization[] = [];
  let selectionValidation: { code: CandidateSelectionValidationCode; path: string | null } | null = null;
  if (apiKey && candidateMenu.length > 0) {
    try {
      const rawSelection = await requestOpenAiCandidateSelection({
        apiKey,
        candidates: candidateMenu,
        budget,
        streamingSupported,
        ...(fetcher ? { fetcher } : {}),
        onDiagnostic: (diagnostic) => { selectorDiagnostic = diagnostic; },
      });
      const selectedBasket = validateSelectedCandidateMenu(rawSelection, candidateMenu, budget, previousPrimaryProductIds);
      basket = selectedBasket;
      selectionNormalizations = selectedBasket.normalizations;
      selectionSource = "openai";
      localAssignmentScope = null;
    } catch (error) {
      // A bad selector response is recoverable: recipe writing can still use
      // the local coherent basket without delaying generation with a retry.
      recoveryReason = selectorFailureCode(error);
      if (error instanceof CandidateSelectionValidationError) {
        selectionValidation = { code: error.code, path: error.path };
      }
    }
  }
  reportGenerationDiagnostic(onDiagnostic, {
    type: "selection",
    source: selectionSource,
    candidateCount: candidateMenu.length,
    selectedProductCount: basket.products.length,
    spendPercent: Math.round((basket.spend / budget) * 10_000) / 100,
    diagnostic: selectorDiagnostic,
    candidateFingerprint: anonymousFingerprint(candidateMenu.map(({ product }) => product.id)),
    assignmentFingerprint: assignmentFingerprint(basket.dayAssignments),
    recoveryReason,
    localAssignmentScope,
    normalizations: selectionNormalizations,
    validation: selectionValidation,
  });

  const dayAssignments = basket.dayAssignments;
  validateSavoryDayAssignments(dayAssignments, basket.products);
  const dayProductIds = dayAssignments.map(({ productIds }) => productIds);
  const expectedSelection: ExpectedWeeklySelection = {
    dayProductIds,
    productIds: basket.productIds,
    spend: calculatePackageUseTotal(dayProductIds, basket.products),
    dayAssignments,
  };
  const fallbackPlan = generateFallbackWeeklyPlan(
    basket.products,
    budget,
    dayAssignments,
    expectedSelection,
  );
  if (!fallbackPlan) {
    throw new Error("Unable to create the deterministic fallback meal plan.");
  }
  const decoratePlan = (plan: WeeklyPlan): WeeklyPlan => ({
    ...plan,
    alternativeCandidateProductIds: candidateMenu.map(({ product }) => product.id),
  });

  if (!apiKey) {
    reportGenerationDiagnostic(onDiagnostic, {
      type: "result",
      source: "fallback",
      apiMs: 0,
      validationMs: 0,
      totalMs: Date.now() - generationStartedAt,
      reason: "OpenAI API key is missing.",
      validation: null,
    });
    return decoratePlan(fallbackPlan);
  }

  let apiMs = 0;
  let validationMs = 0;
  let apiStartedAt: number | null = null;
  let validationStartedAt: number | null = null;
  let attempt = 1;
  let successfulAttempt: number | null = null;

  try {
    const stageOrder: MealPlanGenerationStage[] = [
      MEAL_PLAN_GENERATION_STAGES.selectingIngredients,
      MEAL_PLAN_GENERATION_STAGES.writingRecipes,
      MEAL_PLAN_GENERATION_STAGES.finishingPlan,
      MEAL_PLAN_GENERATION_STAGES.validatingPlan,
    ];
    let lastStageIndex = -1;
    const reportStage = (stage: MealPlanGenerationStage): void => {
      const stageIndex = stageOrder.indexOf(stage);
      if (stageIndex > lastStageIndex) {
        lastStageIndex = stageIndex;
        onProgress?.(stage);
      }
    };

    const batches = createMealPlanBatches();
    const requestBatch = async (batch: MealPlanBatch): Promise<unknown> => {
      const request = {
        apiKey,
        dayIndexes: batch.dayIndexes,
        dayPrimaryProductIds: batch.dayIndexes.map(
          (dayIndex) => dayProductIds[dayIndex]!,
        ),
        dayMealTemplates: batch.dayIndexes.map(
          (dayIndex) => dayAssignments[dayIndex]!.template,
        ),
        candidates: basket.products,
        dietaryNeeds,
        nutritionalGoal,
        onDiagnostic: (requestDiagnostic: OpenAiRequestDiagnostic) => {
          reportGenerationDiagnostic(onDiagnostic, {
            type: "request",
            request: { ...requestDiagnostic, attempt },
          });
        },
        ...(fetcher ? { fetcher } : {}),
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      };

      if (!streamingSupported) {
        return requestOpenAiMealPlan(request);
      }

      return requestOpenAiMealPlanStream({
        ...request,
        onProgress: (progress) => {
          if (progress === "responseCreated") {
            reportStage(MEAL_PLAN_GENERATION_STAGES.writingRecipes);
          } else if (progress === "outputStarted") {
            reportStage(MEAL_PLAN_GENERATION_STAGES.finishingPlan);
          }
        },
      });
    };

    let plan: WeeklyPlan | null = null;
    let lastError: unknown = null;
    for (attempt = 1; attempt <= 2 && !plan; attempt += 1) {
      try {
        reportStage(MEAL_PLAN_GENERATION_STAGES.writingRecipes);
        apiStartedAt = Date.now();
        const batchOutputs = await Promise.all(
          batches.map((batch) => requestBatch(batch)),
        );
        apiMs += Date.now() - apiStartedAt;
        const generated = combineBatchOutputs(batchOutputs, batches);

        reportStage(MEAL_PLAN_GENERATION_STAGES.validatingPlan);
        validationStartedAt = Date.now();
        plan = validateAndEnrichWeeklyPlan(
          generated,
          basket.products,
          budget,
          "openai",
          expectedSelection,
          (repair) => reportGenerationDiagnostic(onDiagnostic, { type: "repair", repair: repair.type, path: repair.path }),
        );
        successfulAttempt = attempt;
        validationMs += Date.now() - validationStartedAt;
      } catch (error) {
        lastError = error;
        if (
          attempt === 2 ||
          isNonRetryableGroundingFailure(error) ||
          error instanceof OpenAiStreamingUnavailableError ||
          (error instanceof OpenAiMealPlanError &&
            error.apiError?.type === "invalid_request_error")
        ) {
          throw error;
        }
        reportGenerationDiagnostic(onDiagnostic, {
          type: "result",
          source: "retry",
          apiMs,
          validationMs: validationStartedAt === null ? 0 : Date.now() - validationStartedAt,
          totalMs: Date.now() - generationStartedAt,
          reason: "Generated meal plan failed local validation; retrying once.",
          validation: validationDiagnostic(error),
          attempt,
        });
      }
    }
    if (!plan) {
      throw lastError;
    }
    reportGenerationDiagnostic(onDiagnostic, {
      type: "result",
      source: "openai",
      apiMs,
      validationMs,
      totalMs: Date.now() - generationStartedAt,
      reason: null,
      validation: null,
      attempt: successfulAttempt ?? attempt,
    });
    return decoratePlan(plan);
  } catch (error) {
    if (apiStartedAt !== null && apiMs === 0) {
      apiMs = Date.now() - apiStartedAt;
    }
    if (validationStartedAt !== null && validationMs === 0) {
      validationMs = Date.now() - validationStartedAt;
    }
    reportGenerationDiagnostic(onDiagnostic, {
      type: "result",
      source: "fallback",
      apiMs,
      validationMs,
      totalMs: Date.now() - generationStartedAt,
      reason: diagnosticFailureReason(error),
      validation: validationDiagnostic(error),
      attempt,
    });
    return decoratePlan(fallbackPlan);
  }
}
