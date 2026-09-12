import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SvgUri } from "react-native-svg";

import { useFlowStore } from "../store/useFlowStore";
import type { DayPlan, Meal, WeeklyPlan } from "../types/mealPlan";
import { getOpenAiApiKey } from "../config/env";
import { productCatalog } from "../data/productCatalog";
import { generateAlternativeMeal } from "../services/alternativeMealGeneration";
import { calculateAlternativeProjectedTotal } from "../services/weeklyPlanPricing";

const DESIGN_WIDTH = 393;
const DESIGN_HEIGHT = 852;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const CLOCK_URI = Image.resolveAssetSource(
  require("../../assets/icons/clock-default.svg"),
).uri;
const USER_URI = Image.resolveAssetSource(
  require("../../assets/icons/user-user-03.svg"),
).uri;
const CASH_URI = Image.resolveAssetSource(
  require("../../assets/icons/cash.svg"),
).uri;

type MealChoice = 0 | 1 | 2;

function formatEuro(amount: number): string {
  const displayAmount = Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2);
  return `€${displayAmount}`;
}

function mealForChoice(day: DayPlan, choice: MealChoice): Meal | null {
  if (choice === 0) {
    return day.primaryMeal;
  }

  return choice === 1 ? day.alternates[0] : day.alternates[1];
}

function planDay(plan: WeeklyPlan, dayIndex: number): DayPlan {
  return plan.days[dayIndex] ?? plan.days[0];
}

export function WeeklyMealPlanScreen() {
  const weeklyPlan = useFlowStore((state) => state.weeklyPlan);
  const generationError = useFlowStore((state) => state.generationError);
  const generationMessage = useFlowStore((state) => state.generationMessage);
  const generationProgress = useFlowStore((state) => state.generationProgress);
  const generationStatus = useFlowStore((state) => state.generationStatus);
  const budget = useFlowStore((state) => state.budget);
  const setAlternative = useFlowStore((state) => state.setAlternative);
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedMealChoice, setSelectedMealChoice] = useState<MealChoice>(0);
  const [alternativeStatus, setAlternativeStatus] = useState<
    Record<string, "loading" | "error">
  >({});
  const primaryPlanKey = weeklyPlan?.days.map((entry) => entry.primaryMeal.id).join("|") ?? "";

  useEffect(() => {
    setSelectedDay(0);
    setSelectedMealChoice(0);
  }, [primaryPlanKey]);

  const day = weeklyPlan ? planDay(weeklyPlan, selectedDay) : null;
  const meal = day ? mealForChoice(day, selectedMealChoice) : null;
  const alternativeKey =
    day && selectedMealChoice > 0
      ? `${day.dayIndex}-${selectedMealChoice}`
      : null;

  const requestAlternative = (replace = false) => {
    if (!day || selectedMealChoice === 0 || !alternativeKey) {
      return;
    }
    const slot = selectedMealChoice - 1;
    if (day.alternates[slot] && !replace) {
      return;
    }
    setAlternativeStatus((state) => ({ ...state, [alternativeKey]: "loading" }));
    const primaryIds = day.primaryMeal.ingredients.map(({ productId }) => productId);
    const otherAlternative = day.alternates[slot === 0 ? 1 : 0];
    const currentAlternative = day.alternates[slot];
    const excludedProductIds = [
      ...primaryIds,
      ...(otherAlternative?.ingredients.map(({ productId }) => productId) ?? []),
      ...(replace ? currentAlternative?.ingredients.map(({ productId }) => productId) ?? [] : []),
    ];
    void generateAlternativeMeal({
      apiKey: getOpenAiApiKey(),
      dayIndex: day.dayIndex,
      primaryMeal: day.primaryMeal,
      candidates: productCatalog.filter((product) =>
        weeklyPlan?.alternativeCandidateProductIds.includes(product.id),
      ),
      excludedProductIds,
      dietaryNeeds: useFlowStore.getState().dietaryNeeds,
      nutritionalGoal: useFlowStore.getState().nutritionalGoal,
    })
      .then((alternative) => {
        setAlternative(day.dayIndex, slot as 0 | 1, alternative);
        setAlternativeStatus((state) => {
          const { [alternativeKey]: _removed, ...remaining } = state;
          return remaining;
        });
      })
      .catch(() =>
        setAlternativeStatus((state) => ({ ...state, [alternativeKey]: "error" })),
      );
  };

  const projectedTotal = weeklyPlan && day && selectedMealChoice > 0 && meal
    ? calculateAlternativeProjectedTotal(weeklyPlan, day.dayIndex, meal, productCatalog)
    : selectedMealChoice > 0 ? null : weeklyPlan?.estimatedTotal.amount ?? null;

  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>
        Bon appetit!
      </Text>

      <View style={styles.costCard}>
        <Text style={styles.costLabel}>{selectedMealChoice > 0 ? "Projected cost" : "Est. cost"}</Text>
        <View style={styles.costValueRow}>
          <Text style={styles.costValue}>
            {projectedTotal === null ? "—" : formatEuro(projectedTotal)}
          </Text>
          <Text style={styles.costFrequency}>/ week</Text>
        </View>
        {selectedMealChoice > 0 && budget !== null && projectedTotal !== null && projectedTotal > budget ? (
          <Text style={styles.costWarning}>This option is above your selected budget.</Text>
        ) : null}
      </View>

      <View style={styles.daySelector}>
        {DAY_LABELS.map((label, index) => {
          const selected = index === selectedDay;

          return (
            <Pressable
              accessibilityLabel={DAY_NAMES[index]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={label}
              onPress={() => {
                setSelectedDay(index);
                setSelectedMealChoice(0);
              }}
              style={({ pressed }) => [
                styles.dayButton,
                selected && styles.dayButtonSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.dayLabel, selected && styles.dayLabelSelected]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={styles.panelContent}
        showsVerticalScrollIndicator={false}
        style={styles.panel}
      >
        <Text style={styles.dayTitle}>{DAY_NAMES[selectedDay]}</Text>

        {day ? <MealChoices selectedMealChoice={selectedMealChoice} setSelectedMealChoice={setSelectedMealChoice} /> : null}
        {meal && day ? (
          <MealDetail
            day={day}
            meal={meal}
            selectedMealChoice={selectedMealChoice}
            onRegenerate={() => Alert.alert("Generate a new alternative?", "This replaces the current alternative with another meal using different products.", [
              { text: "Cancel", style: "cancel" },
              { text: "Regenerate", onPress: () => requestAlternative(true) },
            ])}
          />
        ) : day && selectedMealChoice > 0 ? (
          <AlternativePlaceholder
            error={alternativeKey ? alternativeStatus[alternativeKey] === "error" : false}
            loading={alternativeKey ? alternativeStatus[alternativeKey] === "loading" : false}
            onRequest={requestAlternative}
          />
        ) : (
          <LoadingDetail
            error={generationStatus === "error" ? generationError : null}
          />
        )}
      </ScrollView>
      <GenerationProgressModal
        message={generationMessage}
        progress={generationProgress}
        visible={generationStatus === "loading" && weeklyPlan === null}
      />
    </View>
  );
}

type MealDetailProps = {
  day: DayPlan;
  meal: Meal;
  selectedMealChoice: MealChoice;
  onRegenerate: () => void;
};

function MealDetail({
  day,
  meal,
  selectedMealChoice,
  onRegenerate,
}: MealDetailProps) {
  const perServing = meal.estimatedPrice.amount / Math.max(meal.servings, 1);
  return (
    <>
      <View style={styles.mealSummary}>
        <Text style={styles.mealName}>{meal.name}</Text>
        <View style={styles.metadata}>
          <Metadata iconUri={CLOCK_URI} label={`${meal.prepTimeMinutes} min`} />
          <Metadata
            iconUri={USER_URI}
            label={`${meal.servings} ${meal.servings === 1 ? "serving" : "servings"}`}
          />
          <Metadata iconUri={CASH_URI} label={`${formatEuro(perServing)} / serving`} />
        </View>
      </View>

      <DetailSection title="Ingredients">
        {meal.ingredients.map((ingredient) => (
          <View key={ingredient.productId} style={styles.detailLine}>
            <Text style={styles.detailQuantity}>{ingredient.quantity}</Text>
            <Text style={styles.detailText}>{ingredient.name}</Text>
          </View>
        ))}
        {meal.pantryItems.length > 0 ? (
          <Text style={styles.detailText}>From pantry: {meal.pantryItems.join(", ")}</Text>
        ) : null}
      </DetailSection>

      <DetailSection title="Recipe">
        {meal.steps.map((step, index) => (
          <View key={`${day.dayIndex}-${meal.id}-${index}`} style={styles.stepLine}>
            <Text style={styles.stepNumber}>{index + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailText}>{step.instruction}</Text>
              <Text style={styles.stepMetadata}>Uses: {step.ingredientNames.join(", ")}</Text>
              {step.pantryItems.length > 0 ? (
                <Text style={styles.stepMetadata}>From pantry: {step.pantryItems.join(", ")}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </DetailSection>
      {selectedMealChoice > 0 ? (
        <Pressable accessibilityRole="button" onPress={onRegenerate} style={styles.regenerateButton}>
          <Text style={styles.regenerateLabel}>Regenerate alternative</Text>
        </Pressable>
      ) : null}
    </>
  );
}

function MealChoices({ selectedMealChoice, setSelectedMealChoice }: { selectedMealChoice: MealChoice; setSelectedMealChoice: (choice: MealChoice) => void }) {
  const mealChoices: Array<{ choice: MealChoice; label: string }> = [{ choice: 0, label: "Today's meal" }, { choice: 1, label: "Alternative 1" }, { choice: 2, label: "Alternative 2" }];
  return <View accessibilityRole="tablist" style={styles.mealChoices}>{mealChoices.map(({ choice, label }) => {
    const selected = selectedMealChoice === choice;
    return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} key={choice} onPress={() => setSelectedMealChoice(choice)} style={({ pressed }) => [styles.mealChoice, selected && styles.mealChoiceSelected, pressed && styles.pressed]}><Text numberOfLines={1} style={[styles.mealChoiceLabel, selected && styles.mealChoiceLabelSelected]}>{label}</Text></Pressable>;
  })}</View>;
}

function AlternativePlaceholder({
  error,
  loading,
  onRequest,
}: {
  error: boolean;
  loading: boolean;
  onRequest: () => void;
}) {
  return (
    <View style={styles.mealSummary}>
      <Text style={styles.loadingTitle}>{loading ? "Creating your alternative…" : "Try something different"}</Text>
      {loading ? <LoadingDots compact /> : <Text style={styles.placeholderText}>If today’s main meal isn’t satisfying, we can generate a new option on demand using different products. Just press Generate.</Text>}
      {error ? <Text style={styles.errorText}>We couldn’t create an alternative. Please try again.</Text> : null}
      {!loading ? <Pressable accessibilityRole="button" onPress={onRequest} style={styles.generateAlternativeButton}><Text style={styles.generateAlternativeLabel}>{error ? "Retry" : "Generate alternative"}</Text></Pressable> : null}
    </View>
  );
}

function Metadata({ iconUri, label }: { iconUri: string; label: string }) {
  return (
    <View style={styles.metadataItem}>
      <SvgUri height={16} uri={iconUri} width={16} />
      <Text style={styles.metadataLabel}>{label}</Text>
    </View>
  );
}

function DetailSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <View style={styles.detailSection}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function LoadingDetail({
  error,
}: {
  error: string | null;
}) {
  return (
    <>
      <View style={styles.mealSummary}>
        {error ? (
          <>
            <Text style={styles.loadingTitle}>Your meal plan is unavailable</Text>
            <Text style={styles.errorText}>{error}</Text>
          </>
        ) : null}
      </View>

      <DetailSection title="Ingredients">
        <SkeletonLines />
      </DetailSection>

      <DetailSection title="Recipe">
        <SkeletonLines />
      </DetailSection>
    </>
  );
}

function GenerationProgressModal({
  message,
  progress,
  visible,
}: {
  message: string | null;
  progress: number | null;
  visible: boolean;
}) {
  const animatedProgress = useRef(new Animated.Value(0)).current;
  const displayProgressRef = useRef(0);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [creepProgress, setCreepProgress] = useState(0);
  const stageProgress = Math.min(Math.max(progress ?? 0, 0), 100);
  const ceiling = stageProgress >= 100 ? 100 : stageProgress >= 90 ? 99 : stageProgress >= 65 ? 92 : stageProgress >= 35 ? 75 : 35;
  const targetProgress = Math.max(stageProgress, creepProgress);

  useEffect(() => {
    if (!visible) {
      animatedProgress.stopAnimation();
      animatedProgress.setValue(0);
      displayProgressRef.current = 0;
      setDisplayProgress(0);
      setCreepProgress(0);
      return;
    }

    const listenerId = animatedProgress.addListener(({ value }) => {
      const nextProgress = Math.round(value);
      displayProgressRef.current = nextProgress;
      setDisplayProgress(nextProgress);
    });
    const animation = Animated.timing(animatedProgress, {
      toValue: targetProgress,
      duration: Math.max(
        450,
        Math.abs(targetProgress - displayProgressRef.current) * 24,
      ),
      useNativeDriver: false,
    });
    animation.start();

    return () => {
      animation.stop();
      animatedProgress.removeListener(listenerId);
    };
  }, [animatedProgress, targetProgress, visible]);

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => {
      setCreepProgress((current) => Math.min(ceiling, current + (current < 15 ? 1.5 : 0.6)));
    }, 500);
    return () => clearInterval(timer);
  }, [ceiling, visible]);

  const progressMessage = displayProgress <= 15
    ? "Creating your meal plan…"
    : displayProgress <= 35 ? "Getting everything in order…"
    : displayProgress <= 55 ? "Just hang on a little bit more…"
    : displayProgress <= 75 ? "Don’t worry, it’s still loading…"
    : displayProgress <= 92 ? "We’re almost there…"
    : "Making some final verifications…";

  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.loadingBackdrop}>
        <View accessibilityLiveRegion="polite" style={styles.loadingModal}>
          <Text style={styles.loadingModalPercentage}>{displayProgress}%</Text>
          <Text style={styles.loadingModalMessage}>
            {message && displayProgress === 0 ? message : progressMessage}
          </Text>
          <LoadingDots />
        </View>
      </View>
    </Modal>
  );
}

function LoadingDots({ compact = false }: { compact?: boolean }) {
  const pulses = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  useEffect(() => {
    const animations = pulses.map((pulse, index) => Animated.loop(Animated.sequence([
      Animated.delay(index * 170),
      Animated.timing(pulse, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 380, useNativeDriver: true }),
      Animated.delay((2 - index) * 170),
    ])));
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [pulses]);
  return (
    <View accessibilityLabel="Loading" style={[styles.loadingDots, compact && styles.loadingDotsCompact]}>
      {pulses.map((pulse, index) => (
        <Animated.View
          key={index}
          style={[
            styles.loadingDot,
            compact && styles.loadingDotCompact,
            {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.38, 1] }),
              transform: [{ translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }],
            },
          ]}
        />
      ))}
    </View>
  );
}

function SkeletonLines() {
  return (
    <>
      <View style={styles.skeletonLine} />
      <View style={styles.skeletonLine} />
      <View style={styles.skeletonLine} />
      <View style={styles.skeletonLine} />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: "#34C759",
    flex: 1,
    minHeight: DESIGN_HEIGHT,
    minWidth: DESIGN_WIDTH,
  },
  title: {
    color: "#FFFFFF",
    fontFamily: "PromoSemiBold",
    fontSize: 40,
    left: 20,
    lineHeight: 48,
    position: "absolute",
    textAlign: "center",
    top: 82,
    width: 353,
  },
  costCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    height: 72,
    justifyContent: "center",
    left: 20,
    padding: 8,
    position: "absolute",
    top: 150,
    width: 353,
  },
  costLabel: {
    color: "rgba(60, 60, 67, 0.6)",
    fontFamily: "PromoMedium",
    fontSize: 16,
    lineHeight: 19,
  },
  costValueRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  costValue: {
    color: "#000000",
    fontFamily: "PromoMedium",
    fontSize: 24,
    lineHeight: 29,
  },
  costFrequency: {
    color: "#000000",
    fontFamily: "PromoMedium",
    fontSize: 16,
    lineHeight: 19,
  },
  costWarning: {
    color: "#C2410C",
    fontFamily: "PromoRegular",
    fontSize: 11,
    lineHeight: 13,
    textAlign: "center",
  },
  daySelector: {
    flexDirection: "row",
    gap: 4,
    height: 40,
    left: 20,
    position: "absolute",
    top: 234,
    width: 353,
  },
  dayButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#F2F2F7",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    height: 40,
    justifyContent: "center",
  },
  dayButtonSelected: {
    backgroundColor: "#000000",
    borderColor: "#000000",
  },
  dayLabel: {
    color: "#000000",
    fontFamily: "PromoMedium",
    fontSize: 14,
    lineHeight: 17,
  },
  dayLabelSelected: {
    color: "#FFFFFF",
  },
  panel: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    bottom: 0,
    left: 28,
    position: "absolute",
    top: 306,
    width: 337,
  },
  panelContent: {
    gap: 28,
    padding: 24,
    paddingBottom: 40,
  },
  dayTitle: {
    color: "#000000",
    fontFamily: "PromoSemiBold",
    fontSize: 24,
    lineHeight: 29,
  },
  mealChoices: {
    flexDirection: "row",
    gap: 6,
    marginTop: -12,
  },
  mealChoice: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 99,
    flex: 1,
    height: 30,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  mealChoiceSelected: {
    backgroundColor: "#000000",
  },
  mealChoiceLabel: {
    color: "rgba(60, 60, 67, 0.6)",
    fontFamily: "PromoMedium",
    fontSize: 11,
    lineHeight: 14,
  },
  mealChoiceLabelSelected: {
    color: "#FFFFFF",
  },
  mealSummary: {
    gap: 4,
  },
  mealName: {
    color: "#000000",
    fontFamily: "PromoSemiBold",
    fontSize: 16,
    lineHeight: 19,
  },
  metadata: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metadataItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  metadataLabel: {
    color: "rgba(60, 60, 67, 0.6)",
    fontFamily: "PromoRegular",
    fontSize: 12,
    lineHeight: 15,
  },
  detailSection: {
    gap: 12,
  },
  sectionTitle: {
    color: "#000000",
    fontFamily: "PromoSemiBold",
    fontSize: 14,
    lineHeight: 17,
  },
  detailLine: {
    flexDirection: "row",
    gap: 8,
  },
  detailQuantity: {
    color: "rgba(60, 60, 67, 0.6)",
    fontFamily: "PromoMedium",
    fontSize: 14,
    lineHeight: 18,
    minWidth: 54,
  },
  detailText: {
    color: "#000000",
    flex: 1,
    fontFamily: "PromoRegular",
    fontSize: 14,
    lineHeight: 18,
  },
  stepLine: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
  },
  stepNumber: {
    color: "#34C759",
    fontFamily: "PromoSemiBold",
    fontSize: 14,
    lineHeight: 18,
    width: 16,
  },
  stepMetadata: {
    color: "rgba(60, 60, 67, 0.66)",
    fontFamily: "PromoRegular",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  loadingTitle: {
    color: "#000000",
    fontFamily: "PromoSemiBold",
    fontSize: 16,
    lineHeight: 19,
  },
  placeholderText: {
    color: "rgba(60, 60, 67, 0.72)",
    fontFamily: "PromoRegular",
    fontSize: 14,
    lineHeight: 19,
  },
  generateAlternativeButton: {
    alignItems: "center",
    backgroundColor: "#34C759",
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    marginTop: 8,
  },
  generateAlternativeLabel: {
    color: "#FFFFFF",
    fontFamily: "PromoSemiBold",
    fontSize: 14,
  },
  regenerateButton: {
    alignItems: "center",
    borderColor: "#34C759",
    borderRadius: 14,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    marginTop: -8,
  },
  regenerateLabel: {
    color: "#249B43",
    fontFamily: "PromoSemiBold",
    fontSize: 14,
  },
  loadingBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.34)",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  loadingModal: {
    alignItems: "center",
    backgroundColor: "#FDFFFB",
    borderRadius: 24,
    gap: 16,
    maxWidth: 300,
    paddingHorizontal: 28,
    paddingVertical: 30,
    width: "100%",
  },
  loadingModalPercentage: {
    color: "#34C759",
    fontFamily: "PromoSemiBold",
    fontSize: 46,
    lineHeight: 54,
  },
  loadingModalMessage: {
    color: "#000000",
    fontFamily: "PromoMedium",
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
  },
  loadingDots: {
    flexDirection: "row",
    gap: 7,
    height: 16,
    justifyContent: "center",
  },
  loadingDotsCompact: {
    justifyContent: "flex-start",
    marginTop: 6,
  },
  loadingDot: {
    backgroundColor: "#34C759",
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  loadingDotCompact: {
    height: 8,
    width: 8,
  },
  errorText: {
    color: "rgba(60, 60, 67, 0.6)",
    fontFamily: "PromoRegular",
    fontSize: 14,
    lineHeight: 18,
  },
  skeletonLine: {
    backgroundColor: "#F2F2F7",
    borderRadius: 99,
    height: 16,
    width: "100%",
  },
  pressed: {
    opacity: 0.84,
  },
});
