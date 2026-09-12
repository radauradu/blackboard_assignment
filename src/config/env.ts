import Constants from "expo-constants";

type AppExtra = {
  openAiApiKey?: unknown;
};

function normalizeApiKey(value: string): string {
  return value.replace(/\s+/g, "");
}

export function getOpenAiApiKey(): string | null {
  const extra = Constants.expoConfig?.extra as AppExtra | undefined;
  const value = extra?.openAiApiKey;
  const normalized = typeof value === "string" ? normalizeApiKey(value) : "";

  return normalized.length > 0 ? normalized : null;
}
