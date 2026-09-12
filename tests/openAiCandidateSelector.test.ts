import { describe, expect, it, vi } from "vitest";

import { requestOpenAiCandidateSelection } from "../src/services/openAiCandidateSelector";
import type { CandidateMenuItem } from "../src/services/llmCandidateSelection";
import { catalogProduct } from "./mealPlanFixtures";

const candidates: CandidateMenuItem[] = [
  { product: catalogProduct("p1"), role: "protein", proteinFamily: "meat" },
  { product: catalogProduct("p2"), role: "vegetable", proteinFamily: null },
];

function sseBody(events: readonly Record<string, unknown>[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      events.forEach((event) => controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)));
      controller.close();
    },
  });
}

describe("OpenAI candidate selector", () => {
  it("uses low reasoning, strict output, and restores product references", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: "completed",
        error: null,
        output_text: JSON.stringify({
          days: Array.from({ length: 7 }, (_, dayIndex) => ({
            dayIndex,
            productIds: ["P1", "P2"],
          })),
        }),
      }),
    }));

    const diagnostics: unknown[] = [];
    const result = await requestOpenAiCandidateSelection({
      apiKey: " test-key ",
      candidates,
      budget: 30,
      fetcher,
      streamingSupported: false,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    const body = JSON.parse(String(fetcher.mock.calls[0]![1].body));
    expect(body.model).toBe("gpt-5-mini");
    expect(body.store).toBe(false);
    expect(body.max_output_tokens).toBe(2_000);
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
    expect(result.days[0]).toEqual({ dayIndex: 0, productIds: ["p1", "p2"] });
    expect(diagnostics[0]).toMatchObject({
      transport: "buffered",
      requestBodyBytes: expect.any(Number),
      responseHeadersMs: expect.any(Number),
      completedMs: expect.any(Number),
      outputCharacters: expect.any(Number),
      outcome: "completed",
    });
  });

  it("exposes stable sanitized failure codes", async () => {
    const malformed = requestOpenAiCandidateSelection({
      apiKey: "test-key",
      candidates,
      budget: 30,
      streamingSupported: false,
      fetcher: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ status: "completed", output_text: "not-json" }),
      }),
    });
    await expect(malformed).rejects.toMatchObject({
      code: "invalid_json",
    });
    const unavailable = requestOpenAiCandidateSelection({
      apiKey: "test-key",
      candidates,
      budget: 30,
      streamingSupported: false,
      fetcher: async () => ({ ok: false, status: 503, json: async () => ({}) }),
    });
    await expect(unavailable).rejects.toMatchObject({
      code: "transport_failure",
    });
  });

  it("records a safe incomplete-stream reason and usage without output data", async () => {
    const diagnostics: unknown[] = [];
    const request = requestOpenAiCandidateSelection({
      apiKey: "test-key",
      candidates,
      budget: 30,
      streamingSupported: true,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      fetcher: async () => ({
        ok: true,
        status: 200,
        json: async () => ({}),
        body: sseBody([
          { type: "response.created", response: { status: "in_progress" } },
          {
            type: "response.incomplete",
            response: {
              status: "incomplete",
              incomplete_details: { reason: "max_tokens" },
              usage: {
                output_tokens: 2000,
                output_tokens_details: { reasoning_tokens: 1800 },
                total_tokens: 2500,
              },
            },
          },
        ]),
      }),
    });

    await expect(request).rejects.toMatchObject({ code: "incomplete_max_output_tokens" });
    expect(diagnostics).toContainEqual(expect.objectContaining({
      terminalEvent: "response.incomplete",
      terminalReason: "max_tokens",
      failureCode: "incomplete_max_output_tokens",
      usage: { outputTokens: 2000, reasoningTokens: 1800, totalTokens: 2500 },
    }));
  });
});
