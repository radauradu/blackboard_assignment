import { describe, expect, it, vi } from "vitest";

import {
  CANDIDATE_PRODUCT_COLUMNS,
  createOpenAiMealPlanRequestBody,
  extractOpenAiApiErrorDetail,
  extractOpenAiOutputText,
  normalizeOpenAiApiKey,
  OPENAI_MEAL_PLAN_MODEL,
  OPENAI_RESPONSES_ENDPOINT,
  requestOpenAiMealPlan,
  requestOpenAiMealPlanStream,
  ServerSentEventParser,
  type MealPlanFetcher,
  type OpenAiRequestDiagnostic,
} from "../src/services/openAiMealPlan";
import { catalogProduct, generatedPlan } from "./mealPlanFixtures";

const productIds = Array.from({ length: 7 }, (_, index) => `p${index}`);
const products = productIds.map((id) => catalogProduct(id));
const firstBatchProductIds = productIds.slice(0, 4).map((id) => [id]);

function generatedBatch(dayIndexes: readonly number[] = [0, 1, 2, 3]) {
  const plan = generatedPlan(productIds);
  return { days: dayIndexes.map((dayIndex) => plan.days[dayIndex]!) };
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

function containsSchemaKeyword(value: unknown, keyword: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsSchemaKeyword(item, keyword));
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nestedValue]) => key === keyword || containsSchemaKeyword(nestedValue, keyword),
  );
}

describe("OpenAI meal-plan request", () => {
  it("normalizes copy-pasted multiline API keys before creating headers", () => {
    expect(normalizeOpenAiApiKey(" sk-test\nabc\t123 ")).toBe(
      "sk-testabc123",
    );
  });

  it("uses gpt-5-mini, strict Structured Outputs, and compact candidates", () => {
    const body = createOpenAiMealPlanRequestBody({
      dayIndexes: [0, 1, 2, 3],
      dayPrimaryProductIds: firstBatchProductIds,
      dayMealTemplates: ["pasta", "riceBowl", "proteinAndVegetables", "pasta"],
      candidates: products,
      dietaryNeeds: ["glutenFree"],
      nutritionalGoal: "lowSalt",
    });
    const userText = body.input[1].content[0].text;
    const developerText = body.input[0].content[0].text;
    const context = JSON.parse(userText) as {
      candidateProductColumns: string[];
      dayAssignments: Array<{
        dayIndex: number;
        mealTemplate: string;
        productIds: string[];
        candidateProducts: Array<
          [string, string, string | null, number, string, string | null]
        >;
      }>;
    };

    expect(body.model).toBe(OPENAI_MEAL_PLAN_MODEL);
    expect(body.store).toBe(false);
    expect(body.max_output_tokens).toBe(6_000);
    expect(body.reasoning).toEqual({ effort: "minimal" });
    expect(body.text.format).toMatchObject({
      type: "json_schema",
      strict: true,
    });
    expect(body.text.verbosity).toBe("low");
    expect(developerText).toContain("step's productIds metadata is authoritative");
    expect(developerText).toContain('such as "the ingredients listed for this step"');
    expect(developerText).toContain(
      "every food word in its name and\n  instructions is grounded in that day's candidateProducts",
    );
    expect(developerText).toContain("never write a product reference\n  or catalog code in the instruction");
    expect(body.text.format.schema.properties.days.minItems).toBe(4);
    expect(body.text.format.schema.properties.days.maxItems).toBe(4);
    expect(
      body.text.format.schema.properties.days.items.properties.primaryMeal
        .properties.steps.maxItems,
    ).toBe(5);
    expect(
      body.text.format.schema.properties.days.items.properties.primaryMeal
        .properties.pantryItems.items.enum,
    ).toEqual(["water", "salt", "black pepper", "olive oil"]);
    expect(context.dayAssignments.map(({ dayIndex }) => dayIndex)).toEqual([0, 1, 2, 3]);
    expect(context.dayAssignments.map(({ mealTemplate }) => mealTemplate)).toEqual([
      "pasta",
      "riceBowl",
      "proteinAndVegetables",
      "pasta",
    ]);
    expect(context.candidateProductColumns).toEqual(CANDIDATE_PRODUCT_COLUMNS);
    expect(context).not.toHaveProperty("candidateProducts");
    expect(context).not.toHaveProperty("dayPrimaryProductIds");
    expect(context.dayAssignments).toHaveLength(4);
    expect(context.dayAssignments[0]!.candidateProducts).toHaveLength(1);
    expect(context.dayAssignments[0]!.candidateProducts[0]).toEqual([
      "P1",
      "Catalog p0",
      "100 g",
      1,
      "Pantry",
      "category-p0",
    ]);
    expect(context.dayAssignments.map(({ productIds }) => productIds)).toEqual([
      ["P1"],
      ["P2"],
      ["P3"],
      ["P4"],
    ]);
    context.dayAssignments.forEach((assignment) => {
      expect(assignment.candidateProducts.map(([id]) => id)).toEqual(
        assignment.productIds,
      );
    });
    expect(
      context.dayAssignments[0]!.candidateProducts.map(([id]) => id),
    ).not.toContain("P4");
    const repeatedObjectEncoding = JSON.stringify(
      products.map((product) => ({
        id: product.id,
        name: product.name,
        brand: product.brand,
        quantity: product.quantity,
        priceEur: product.price.amount,
        department: product.department,
        category: product.category,
      })),
    );
    expect(
      JSON.stringify(
        context.dayAssignments.flatMap(({ candidateProducts }) =>
          candidateProducts,
        ),
      ).length,
    ).toBeLessThan(
      repeatedObjectEncoding.length,
    );
  });

  it("accepts the ready-meal template for initial and alternative recipe requests", () => {
    const readyMeal = catalogProduct("soup", 2, "en:soups");
    readyMeal.category = { id: "en:soups", name: "Soups" };
    const vegetable = catalogProduct("vegetable", 1, "en:vegetables");
    vegetable.category = { id: "en:vegetables", name: "Vegetables" };

    const body = createOpenAiMealPlanRequestBody({
      dayIndexes: [0],
      dayPrimaryProductIds: [["soup", "vegetable"]],
      dayMealTemplates: ["readyMeal"],
      candidates: [readyMeal, vegetable],
      dietaryNeeds: [],
      nutritionalGoal: null,
    });

    expect(body.input[0].content[0].text).toContain("readyMeal assignment");
    const context = JSON.parse(body.input[1].content[0].text) as {
      dayAssignments: Array<{ mealTemplate: string }>;
    };
    expect(context.dayAssignments[0]?.mealTemplate).toBe("readyMeal");
  });

  it("rejects missing, misaligned, and unknown day assignments", () => {
    const baseInput = {
      dayIndexes: [0, 1, 2, 3],
      candidates: products,
      dietaryNeeds: [] as const,
      nutritionalGoal: null,
    };

    expect(() =>
      createOpenAiMealPlanRequestBody({
        ...baseInput,
        dayPrimaryProductIds: [["p0"]],
      }),
    ).toThrow("matching set");
    expect(() =>
      createOpenAiMealPlanRequestBody({
        ...baseInput,
        dayPrimaryProductIds: [["p0"], ["p1"], ["p2"], ["unknown"]],
      }),
    ).toThrow("present in candidates");
  });

  it("extracts nested Responses output and rejects refusals", () => {
    expect(
      extractOpenAiOutputText({
        status: "completed",
        error: null,
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: '{"days":[]}' }],
          },
        ],
      }),
    ).toBe('{"days":[]}');

    expect(() =>
      extractOpenAiOutputText({
        status: "completed",
        error: null,
        output: [
          {
            type: "message",
            content: [{ type: "refusal", refusal: "No" }],
          },
        ],
      }),
    ).toThrow("refused");
  });

  it("keeps the exact strict structured-step contract in the request", () => {
    const body = createOpenAiMealPlanRequestBody({
      dayIndexes: [0],
      dayPrimaryProductIds: [["p0"]],
      candidates: products,
      dietaryNeeds: [],
      nutritionalGoal: null,
    });
    const step = body.text.format.schema.properties.days.items.properties.primaryMeal
      .properties.steps.items;

    expect(body.model).toBe("gpt-5-mini");
    expect(step).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["instruction", "productIds", "pantryItems"],
    });
    expect(containsSchemaKeyword(body.text.format.schema, "uniqueItems")).toBe(false);
  });

  it("extracts only the supported OpenAI error fields", () => {
    expect(extractOpenAiApiErrorDetail({
      error: {
        type: "invalid_request_error",
        code: "invalid_json_schema",
        param: "text.format.schema",
        message: "Unsupported schema keyword.",
        request_body: "must not leak",
      },
    })).toEqual({
      type: "invalid_request_error",
      code: "invalid_json_schema",
      param: "text.format.schema",
      message: "Unsupported schema keyword.",
    });
  });

  it("posts the schema request and parses the generated JSON", async () => {
    const rawPlan = generatedBatch();
    rawPlan.days.forEach((day, index) => {
      day.primaryMeal.ingredients[0]!.productId = `P${index + 1}`;
    });
    const expectedPlan = generatedBatch();
    const diagnostics: OpenAiRequestDiagnostic[] = [];
    const fetcher = vi.fn<MealPlanFetcher>(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: "completed",
        error: null,
        output_text: JSON.stringify(rawPlan),
        usage: {
          input_tokens: 100,
          input_tokens_details: { cached_tokens: 25 },
          output_tokens: 50,
          output_tokens_details: { reasoning_tokens: 10 },
          total_tokens: 150,
        },
      }),
    }));

    await expect(
      requestOpenAiMealPlan({
        apiKey: " test-\nkey ",
        dayIndexes: [0, 1, 2, 3],
        dayPrimaryProductIds: firstBatchProductIds,
        candidates: products,
        dietaryNeeds: [],
        nutritionalGoal: null,
        fetcher,
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      }),
    ).resolves.toEqual(expectedPlan);

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(OPENAI_RESPONSES_ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      transport: "buffered",
      dayIndexes: [0, 1, 2, 3],
      candidateCount: 4,
      httpStatus: 200,
      outcome: "completed",
      failureReason: null,
      usage: {
        inputTokens: 100,
        cachedInputTokens: 25,
        outputTokens: 50,
        reasoningTokens: 10,
        totalTokens: 150,
      },
    });
    expect(diagnostics[0]!.requestBodyBytes).toBeGreaterThan(0);
    expect(JSON.stringify(diagnostics[0])).not.toContain("test-key");
    expect(JSON.stringify(diagnostics[0])).not.toContain("Catalog p0");
  });

  it("rejects malformed JSON and non-completed responses", async () => {
    const malformedFetcher: MealPlanFetcher = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: "completed",
        error: null,
        output_text: "not-json",
      }),
    });
    const incompleteFetcher: MealPlanFetcher = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "incomplete", error: null, output: [] }),
    });

    const input = {
      apiKey: "test-key",
      dayIndexes: [0, 1, 2, 3],
      dayPrimaryProductIds: firstBatchProductIds,
      candidates: products,
      dietaryNeeds: [] as const,
      nutritionalGoal: null,
    };

    await expect(
      requestOpenAiMealPlan({ ...input, fetcher: malformedFetcher }),
    ).rejects.toThrow("invalid JSON");
    await expect(
      requestOpenAiMealPlan({ ...input, fetcher: incompleteFetcher }),
    ).rejects.toThrow("did not complete");
  });

  it("reports sanitized JSON API errors and never request secrets", async () => {
    const diagnostics: OpenAiRequestDiagnostic[] = [];
    const fetcher: MealPlanFetcher = async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          type: "invalid_request_error",
          code: "invalid_json_schema",
          param: "text.format.schema",
          message: "Unsupported schema keyword: minLength.",
          request_body: "Catalog p0 and test-key must not appear",
        },
      }),
    });

    await expect(requestOpenAiMealPlan({
      apiKey: "test-key",
      dayIndexes: [0, 1, 2, 3],
      dayPrimaryProductIds: firstBatchProductIds,
      candidates: products,
      dietaryNeeds: [],
      nutritionalGoal: null,
      fetcher,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    })).rejects.toThrow("Unsupported schema keyword: minLength.");

    expect(diagnostics[0]).toMatchObject({
      httpStatus: 400,
      outcome: "failed",
      apiError: {
        type: "invalid_request_error",
        code: "invalid_json_schema",
        param: "text.format.schema",
      },
    });
    expect(JSON.stringify(diagnostics[0])).not.toContain("test-key");
    expect(JSON.stringify(diagnostics[0])).not.toContain("Catalog p0");
  });

  it("keeps non-JSON API errors status-only", async () => {
    const diagnostics: OpenAiRequestDiagnostic[] = [];
    await expect(requestOpenAiMealPlan({
      apiKey: "test-key",
      dayIndexes: [0, 1, 2, 3],
      dayPrimaryProductIds: firstBatchProductIds,
      candidates: products,
      dietaryNeeds: [],
      nutritionalGoal: null,
      fetcher: async () => ({ ok: false, status: 400, json: async () => { throw new Error("not JSON"); } }),
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    })).rejects.toThrow("status 400");
    expect(diagnostics[0]?.apiError).toBeNull();
  });

  it("aborts requests after the configured timeout", async () => {
    const fetcher: MealPlanFetcher = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      });

    const diagnostics: OpenAiRequestDiagnostic[] = [];

    await expect(
      requestOpenAiMealPlan({
        apiKey: "test-key",
        dayIndexes: [0, 1, 2, 3],
        dayPrimaryProductIds: firstBatchProductIds,
        candidates: products,
        dietaryNeeds: [],
        nutritionalGoal: null,
        fetcher,
        timeoutMs: 1,
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      }),
    ).rejects.toThrow("timed out");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      transport: "buffered",
      outcome: "timed_out",
      failureReason: "OpenAI request timed out.",
    });
  });

  it("parses fragmented SSE events only after a completed response", async () => {
    const rawPlan = generatedBatch();
    const outputText = JSON.stringify(rawPlan);
    const completed = {
      status: "completed",
      error: null,
      output_text: outputText,
      usage: {
        input_tokens: 80,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 40,
        output_tokens_details: { reasoning_tokens: 8 },
        total_tokens: 120,
      },
    };
    const sse = [
      streamFrame("response.created", { response: { status: "in_progress" } }),
      streamFrame("response.output_text.delta", { delta: outputText }),
      streamFrame("response.completed", { response: completed }),
    ].join("");
    const chunks = [sse.slice(0, 17), sse.slice(17, 93), sse.slice(93)];
    const fetcher = vi.fn<MealPlanFetcher>(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      body: streamBody(chunks),
    }));
    const progress: string[] = [];
    const diagnostics: OpenAiRequestDiagnostic[] = [];

    await expect(
      requestOpenAiMealPlanStream({
        apiKey: "test-key",
        dayIndexes: [0, 1, 2, 3],
        dayPrimaryProductIds: firstBatchProductIds,
        candidates: products,
        dietaryNeeds: [],
        nutritionalGoal: null,
        fetcher,
        onProgress: (event) => progress.push(event),
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      }),
    ).resolves.toEqual(rawPlan);

    const [, init] = fetcher.mock.calls[0]!;
    expect(JSON.parse(String(init.body))).toMatchObject({ stream: true });
    expect(progress).toEqual(["responseCreated", "outputStarted"]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      transport: "sse",
      outcome: "completed",
      httpStatus: 200,
      outputCharacters: outputText.length,
      usage: {
        inputTokens: 80,
        cachedInputTokens: 0,
        outputTokens: 40,
        reasoningTokens: 8,
        totalTokens: 120,
      },
    });
    expect(diagnostics[0]!.responseCreatedMs).not.toBeNull();
    expect(diagnostics[0]!.firstOutputDeltaMs).not.toBeNull();
  });

  it("parses multiple frames in a chunk and rejects incomplete or invalid streams", () => {
    const parser = new ServerSentEventParser();
    expect(
      parser.push(
        "event: one\r\ndata: {\"value\":1}\r\n\r\nevent: two\ndata: second\n\n",
      ),
    ).toEqual([
      { event: "one", data: '{"value":1}' },
      { event: "two", data: "second" },
    ]);
    expect(() => parser.finish()).not.toThrow();

    const incomplete = new ServerSentEventParser();
    incomplete.push("event: response.created\ndata: {");
    expect(() => incomplete.finish()).toThrow("incomplete SSE event");
  });

  it("rejects malformed SSE data, refusals, and missing stream bodies", async () => {
    const baseInput = {
      apiKey: "test-key",
      dayIndexes: [0, 1, 2, 3],
      dayPrimaryProductIds: firstBatchProductIds,
      candidates: products,
      dietaryNeeds: [] as const,
      nutritionalGoal: null,
    };
    const malformed: MealPlanFetcher = async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      body: streamBody(["event: response.created\ndata: not-json\n\n"]),
    });
    const refusal: MealPlanFetcher = async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      body: streamBody([
        streamFrame("response.refusal.done", { refusal: "No" }),
      ]),
    });
    const missingBody: MealPlanFetcher = async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await expect(
      requestOpenAiMealPlanStream({ ...baseInput, fetcher: malformed }),
    ).rejects.toThrow("malformed SSE");
    await expect(
      requestOpenAiMealPlanStream({ ...baseInput, fetcher: refusal }),
    ).rejects.toThrow("did not complete");
    await expect(
      requestOpenAiMealPlanStream({ ...baseInput, fetcher: missingBody }),
    ).rejects.toThrow("Streaming is unavailable");
  });
});
