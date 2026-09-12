import { useFonts } from "expo-font";

export const mealPrepFonts = {
  PromoRegular: require("../../assets/fonts/Promo-Regular.ttf"),
  PromoMedium: require("../../assets/fonts/Promo-Medium.ttf"),
  PromoSemiBold: require("../../assets/fonts/Promo-SemiBold.ttf"),
  PromoBold: require("../../assets/fonts/Promo-Bold.ttf"),
} as const;

export function useMealPrepFonts(): [boolean, Error | null] {
  return useFonts(mealPrepFonts);
}
