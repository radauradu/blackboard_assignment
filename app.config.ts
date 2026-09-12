import "dotenv/config";

import type { ConfigContext, ExpoConfig } from "expo/config";

const normalizeApiKey = (value: string | undefined): string =>
  value?.replace(/\s+/g, "") ?? "";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "MealPrep",
  slug: "mealprep",
  version: "1.0.0",
  platforms: ["ios"],
  orientation: "portrait",
  userInterfaceStyle: "light",
  ios: {
    ...config.ios,
    supportsTablet: false,
  },
  plugins: ["expo-font"],
  extra: {
    ...config.extra,
    openAiApiKey: normalizeApiKey(process.env.OPENAI_API_KEY),
  },
});
