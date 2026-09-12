import type { CatalogProduct } from "../types/catalog";
import {
  OPENAI_MEAL_PLAN_MODEL,
  OPENAI_RESPONSES_ENDPOINT,
  extractOpenAiOutputText,
  normalizeOpenAiApiKey,
  ServerSentEventParser,
  type MealPlanFetcher,
} from "./openAiMealPlan";
import type { CandidateMenuItem, RawSelectedDay } from "./llmCandidateSelection";

const SELECTOR_TIMEOUT_MS = 30_000;

export type CandidateSelectorFailureCode =
  | "timeout"
  | "transport_failure"
  | "malformed_sse"
  | "invalid_json"
  | "stream_ended_early"
  | "incomplete_max_output_tokens"
  | "incomplete_content_filter"
  | "incomplete_other"
  | "response_failed"
  | "refusal"
  | "stream_error";

export type CandidateSelectorTerminalEvent =
  | "response.completed"
  | "response.incomplete"
  | "response.failed"
  | "response.refusal.done"
  | "error"
  | "malformed_sse"
  | "stream_ended_early"
  | "invalid_json";

export type CandidateSelectorUsage = {
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
};

export class CandidateSelectorError extends Error {
  readonly code: CandidateSelectorFailureCode;

  constructor(code: CandidateSelectorFailureCode, message: string) {
    super(message);
    this.name = "CandidateSelectorError";
    this.code = code;
  }
}

export type CandidateSelectorDiagnostic = {
  transport: "sse" | "buffered";
  candidateCount: number;
  requestBodyBytes: number;
  responseHeadersMs: number | null;
  responseCreatedMs: number | null;
  firstOutputDeltaMs: number | null;
  completedMs: number | null;
  outputCharacters: number | null;
  totalMs: number;
  outcome: "completed" | "failed" | "timed_out";
  httpStatus: number | null;
  failureCode: CandidateSelectorFailureCode | null;
  terminalEvent: CandidateSelectorTerminalEvent | null;
  terminalReason: string | null;
  usage: CandidateSelectorUsage | null;
};

export type CandidateSelectorRequest = {
  apiKey: string;
  candidates: readonly CandidateMenuItem[];
  budget: number;
  fetcher?: MealPlanFetcher;
  streamingSupported: boolean;
  onDiagnostic?: (diagnostic: CandidateSelectorDiagnostic) => void;
};

function now(): number { return typeof performance !== "undefined" ? performance.now() : Date.now(); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

type SelectorLifecycleEvent = "responseCreated" | "outputStarted" | "completed";
type ParsedSelection = { parsed: unknown; completedResponse: unknown; outputCharacters: number };
type TerminalDetails = {
  event: CandidateSelectorTerminalEvent;
  reason: string | null;
  usage: CandidateSelectorUsage | null;
};

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 80);
  return normalized || null;
}

function usageFromResponse(value: unknown): CandidateSelectorUsage | null {
  if (!isRecord(value) || !isRecord(value.usage)) return null;
  const details = isRecord(value.usage.output_tokens_details)
    ? value.usage.output_tokens_details
    : {};
  return {
    outputTokens: finiteNumber(value.usage.output_tokens),
    reasoningTokens: finiteNumber(details.reasoning_tokens),
    totalTokens: finiteNumber(value.usage.total_tokens),
  };
}

function terminalDetails(
  event: CandidateSelectorTerminalEvent,
  payload: Record<string, unknown>,
): TerminalDetails {
  const response = isRecord(payload.response) ? payload.response : null;
  const responseError = response && isRecord(response.error) ? response.error : null;
  const payloadError = isRecord(payload.error) ? payload.error : null;
  const incomplete = response && isRecord(response.incomplete_details)
    ? response.incomplete_details
    : null;
  const reason = event === "response.incomplete"
    ? safeReason(incomplete?.reason)
    : safeReason(responseError?.code ?? payloadError?.code);
  return { event, reason, usage: usageFromResponse(response) };
}

function failureCodeForTerminal(details: TerminalDetails): CandidateSelectorFailureCode {
  switch (details.event) {
    case "response.incomplete":
      if (details.reason === "max_tokens") return "incomplete_max_output_tokens";
      if (details.reason === "content_filter") return "incomplete_content_filter";
      return "incomplete_other";
    case "response.failed": return "response_failed";
    case "response.refusal.done": return "refusal";
    case "error": return "stream_error";
    case "malformed_sse": return "malformed_sse";
    case "stream_ended_early": return "stream_ended_early";
    case "invalid_json": return "invalid_json";
    default: return "transport_failure";
  }
}

const selectionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    days: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          dayIndex: { type: "integer", minimum: 0, maximum: 6 },
          productIds: { type: "array", minItems: 2, maxItems: 5, items: { type: "string" } },
        },
        required: ["dayIndex", "productIds"],
      },
    },
  },
  required: ["days"],
} as const;

function requestBody(candidates: readonly CandidateMenuItem[], budget: number, stream: boolean) {
  const references = new Map(candidates.map((item, index) => [item.product.id, `P${index + 1}`]));
  const menu = Object.fromEntries(["protein", "vegetable", "base", "support", "readyMeal"].map((role) => [role, candidates.filter((item) => item.role === role).map(({ product, proteinFamily }) => [references.get(product.id)!, product.name, product.quantity, product.price.amount, product.category?.name ?? null, proteinFamily]) ]));
  return {
    references,
    body: {
      model: OPENAI_MEAL_PLAN_MODEL,
      store: false,
      max_output_tokens: 2_000,
      reasoning: { effort: "low" },
      input: [
        { role: "developer", content: [{ type: "input_text", text: "Choose seven familiar savory weekly meals from the supplied role-grouped catalog. Return only the required JSON. Return every day index exactly once, in ascending order from 0 through 6, and use each product reference at most once within a day. Use product references only from the menu. Every day must be distinct. Vary protein choices, bases, vegetables, and meal templates; do not prefer early references. For every regular meal: choose exactly one protein, at least one vegetable, 3-5 products total, at most one base, and at most one support. Never choose two proteins. Do not pair seafood with a dairy support. For every readyMeal day: choose exactly one readyMeal core plus one or two vegetables or supports only; never add a protein or base. Use at most two readyMeal days. Keep the package-use total at or below the budget and aim for 90-100% when coherent." }] },
        { role: "user", content: [{ type: "input_text", text: JSON.stringify({ budgetEur: budget, columns: ["productRef", "name", "quantity", "priceEur", "subcategory", "proteinFamily"], candidatesByRole: menu }) }] },
      ],
      text: { verbosity: "low", format: { type: "json_schema", name: "weekly_ingredient_selection", strict: true, schema: selectionSchema } },
      ...(stream ? { stream: true } : {}),
    },
  } as const;
}

async function parseSse(
  response: { body?: ReadableStream<Uint8Array> | null },
  onLifecycle: (event: SelectorLifecycleEvent) => void,
  onTerminal: (details: TerminalDetails) => void,
): Promise<ParsedSelection> {
  if (!response.body?.getReader) throw new CandidateSelectorError("transport_failure", "Streaming is unavailable in this runtime.");
  const reader = response.body.getReader(); const decoder = new TextDecoder(); const parser = new ServerSentEventParser();
  let output = ""; let completed: unknown = null;
  const consume = (event: { event: string; data: string }) => {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(event.data) as Record<string, unknown>;
    } catch {
      const details: TerminalDetails = { event: "malformed_sse", reason: null, usage: null };
      onTerminal(details);
      throw new CandidateSelectorError(failureCodeForTerminal(details), "OpenAI returned malformed ingredient-selection events.");
    }
    const type = typeof payload.type === "string" ? payload.type : event.event;
    if (type === "response.created") onLifecycle("responseCreated");
    if (type === "response.output_text.delta" && typeof payload.delta === "string") {
      if (output.length === 0) onLifecycle("outputStarted");
      output += payload.delta;
    }
    if (type === "response.completed") { completed = payload.response; onLifecycle("completed"); onTerminal(terminalDetails("response.completed", payload)); }
    if (["response.failed", "response.incomplete", "response.refusal.done", "error"].includes(type)) {
      const details = terminalDetails(type as CandidateSelectorTerminalEvent, payload);
      onTerminal(details);
      throw new CandidateSelectorError(failureCodeForTerminal(details), "OpenAI did not complete ingredient selection.");
    }
  };
  while (true) { const { done, value } = await reader.read(); if (value) parser.push(decoder.decode(value, { stream: !done })).forEach(consume); if (done) break; }
  parser.push(decoder.decode()).forEach(consume); parser.finish();
  if (!completed) {
    const details: TerminalDetails = { event: "stream_ended_early", reason: null, usage: null };
    onTerminal(details);
    throw new CandidateSelectorError(failureCodeForTerminal(details), "OpenAI ended the ingredient-selection stream early.");
  }
  const text = output || extractOpenAiOutputText(completed);
  try { return { parsed: JSON.parse(text), completedResponse: completed, outputCharacters: text.length }; } catch {
    const details: TerminalDetails = { event: "invalid_json", reason: null, usage: usageFromResponse(completed) };
    onTerminal(details);
    throw new CandidateSelectorError(failureCodeForTerminal(details), "OpenAI returned invalid ingredient-selection JSON.");
  }
}

async function parseBuffered(response: { json: () => Promise<unknown> }): Promise<ParsedSelection> {
  try {
    const completedResponse = await response.json();
    const text = extractOpenAiOutputText(completedResponse);
    return { parsed: JSON.parse(text), completedResponse, outputCharacters: text.length };
  } catch {
    throw new CandidateSelectorError("invalid_json", "OpenAI returned invalid ingredient-selection JSON.");
  }
}

export async function requestOpenAiCandidateSelection({ apiKey, candidates, budget, fetcher = globalThis.fetch as MealPlanFetcher, streamingSupported, onDiagnostic }: CandidateSelectorRequest): Promise<{ days: RawSelectedDay[] }> {
  const key = normalizeOpenAiApiKey(apiKey);
  if (!key) throw new CandidateSelectorError("transport_failure", "An OpenAI API key is required.");
  const started = now(); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), SELECTOR_TIMEOUT_MS);
  const transport = streamingSupported ? "sse" as const : "buffered" as const;
  let requestBodyBytes = 0;
  let responseHeadersMs: number | null = null;
  let responseCreatedMs: number | null = null;
  let firstOutputDeltaMs: number | null = null;
  let completedMs: number | null = null;
  let outputCharacters: number | null = null;
  let httpStatus: number | null = null;
  let terminalEvent: CandidateSelectorTerminalEvent | null = null;
  let terminalReason: string | null = null;
  let usage: CandidateSelectorUsage | null = null;
  const diagnostic = (
    outcome: CandidateSelectorDiagnostic["outcome"],
    failureCode: CandidateSelectorFailureCode | null = null,
  ): void => onDiagnostic?.({
    transport,
    candidateCount: candidates.length,
    requestBodyBytes,
    responseHeadersMs,
    responseCreatedMs,
    firstOutputDeltaMs,
    completedMs,
    outputCharacters,
    totalMs: Math.round((now() - started) * 10) / 10,
    outcome,
    httpStatus,
    failureCode,
    terminalEvent,
    terminalReason,
    usage,
  });
  try {
    const built = requestBody(candidates, budget, streamingSupported);
    const body = JSON.stringify(built.body);
    requestBodyBytes = new TextEncoder().encode(body).byteLength;
    const response = await fetcher(OPENAI_RESPONSES_ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(streamingSupported ? { Accept: "text/event-stream" } : {}) }, body, signal: controller.signal });
    responseHeadersMs = Math.round((now() - started) * 10) / 10;
    httpStatus = response.status;
    if (!response.ok) throw new CandidateSelectorError("transport_failure", `OpenAI request failed with status ${response.status}.`);
    const parsedOutput = streamingSupported
      ? await parseSse(response, (event) => {
          const elapsed = Math.round((now() - started) * 10) / 10;
          if (event === "responseCreated") responseCreatedMs ??= elapsed;
          if (event === "outputStarted") firstOutputDeltaMs ??= elapsed;
          if (event === "completed") completedMs ??= elapsed;
        }, (details) => {
          terminalEvent = details.event;
          terminalReason = details.reason;
          usage = details.usage;
        })
      : await parseBuffered(response);
    if (!streamingSupported) completedMs = Math.round((now() - started) * 10) / 10;
    outputCharacters = parsedOutput.outputCharacters;
    const parsed = parsedOutput.parsed;
    if (!isRecord(parsed) || !Array.isArray(parsed.days)) throw new CandidateSelectorError("invalid_json", "OpenAI returned invalid ingredient-selection data.");
    const restore = new Map([...built.references.entries()].map(([id, ref]) => [ref, id]));
    const days = parsed.days.map((day) => isRecord(day) ? { dayIndex: day.dayIndex, productIds: Array.isArray(day.productIds) ? day.productIds.map((id) => typeof id === "string" ? (restore.get(id) ?? id) : id) : day.productIds } : day) as RawSelectedDay[];
    diagnostic("completed");
    return { days };
  } catch (error) {
    diagnostic(
      controller.signal.aborted ? "timed_out" : "failed",
      controller.signal.aborted
        ? "timeout"
        : error instanceof CandidateSelectorError
          ? error.code
          : "transport_failure",
    );
    if (controller.signal.aborted) {
      throw new CandidateSelectorError("timeout", "OpenAI ingredient selection timed out.");
    }
    if (error instanceof CandidateSelectorError) throw error;
    throw new CandidateSelectorError("transport_failure", "OpenAI ingredient selection could not be completed.");
  } finally { clearTimeout(timeout); }
}
