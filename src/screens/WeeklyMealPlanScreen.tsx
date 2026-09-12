import { useEffect, useRef, useState } from "react";
import LottieView from "lottie-react-native";
import {
  Animated,
  Alert,
  Image,
  LayoutAnimation,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
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
const DAY_PANEL_WIDTH = 337;
const DAY_PANEL_TOP = 322;
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

const DIETARY_NEED_LABELS: Record<string, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  pescatarian: "Pescatarian",
  lactoseFree: "Dairy free",
  glutenFree: "Gluten free",
};

const NUTRITIONAL_GOAL_LABELS: Record<string, string> = {
  highProtein: "High protein",
  lowCalorie: "Low calorie",
  balanced: "Balanced",
  lowCarbs: "Low carbs",
  lowSalt: "Low salt",
};

const KITCHEN_TIPS = [
  "Season as you cook, then taste before serving.",
  "Preheat the pan before adding ingredients.",
  "Cut vegetables to similar sizes for even cooking.",
  "A splash of cooking water can bring a sauce together.",
  "Let cooked protein rest briefly before serving.",
  "Add delicate herbs near the end for brighter flavour.",
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
  const { height: windowHeight } = useWindowDimensions();
  const weeklyPlan = useFlowStore((state) => state.weeklyPlan);
  const generationError = useFlowStore((state) => state.generationError);
  const generationMessage = useFlowStore((state) => state.generationMessage);
  const generationProgress = useFlowStore((state) => state.generationProgress);
  const generationStatus = useFlowStore((state) => state.generationStatus);
  const budget = useFlowStore((state) => state.budget);
  const dietaryNeeds = useFlowStore((state) => state.dietaryNeeds);
  const nutritionalGoal = useFlowStore((state) => state.nutritionalGoal);
  const setAlternative = useFlowStore((state) => state.setAlternative);
  const [selectedDay, setSelectedDay] = useState(0);
  const [mealChoices, setMealChoices] = useState<Record<number, MealChoice>>({});
  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({});
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [celebrationVisible, setCelebrationVisible] = useState(false);
  const [alternativeStatus, setAlternativeStatus] = useState<
    Record<string, "loading" | "error">
  >({});
  const carouselRef = useRef<ScrollView>(null);
  const celebratedPlanKeyRef = useRef<string | null>(null);
  const primaryPlanKey = weeklyPlan?.days.map((entry) => entry.primaryMeal.id).join("|") ?? "";
  const maxPanelHeight = Math.max(280, windowHeight - DAY_PANEL_TOP);

  const selectDay = (dayIndex: number) => {
    const nextDay = Math.min(Math.max(dayIndex, 0), DAY_NAMES.length - 1);
    setSelectedDay(nextDay);
    carouselRef.current?.scrollTo({ animated: false, x: nextDay * DAY_PANEL_WIDTH });
  };

  useEffect(() => {
    setSelectedDay(0);
    setMealChoices({});
    setExpandedDays({});
    requestAnimationFrame(() => carouselRef.current?.scrollTo({ animated: false, x: 0 }));
  }, [primaryPlanKey]);

  useEffect(() => {
    if (!primaryPlanKey) {
      setCelebrationVisible(false);
      celebratedPlanKeyRef.current = null;
      return;
    }

    if (generationStatus !== "success" || celebratedPlanKeyRef.current === primaryPlanKey) {
      return;
    }

    celebratedPlanKeyRef.current = primaryPlanKey;
    setCelebrationVisible(true);
    const dismissTimer = setTimeout(() => setCelebrationVisible(false), 2100);
    return () => clearTimeout(dismissTimer);
  }, [generationStatus, primaryPlanKey]);

  const day = weeklyPlan ? planDay(weeklyPlan, selectedDay) : null;
  const selectedMealChoice = mealChoices[selectedDay] ?? 0;
  const meal = day ? mealForChoice(day, selectedMealChoice) : null;

  const requestAlternative = (
    targetDay: DayPlan,
    choice: MealChoice,
    replace = false,
  ) => {
    const targetAlternativeKey = choice > 0 ? `${targetDay.dayIndex}-${choice}` : null;
    if (choice === 0 || !targetAlternativeKey) {
      return;
    }
    const slot = choice - 1;
    if (targetDay.alternates[slot] && !replace) {
      return;
    }
    setAlternativeStatus((state) => ({ ...state, [targetAlternativeKey]: "loading" }));
    const primaryIds = targetDay.primaryMeal.ingredients.map(({ productId }) => productId);
    const otherAlternative = targetDay.alternates[slot === 0 ? 1 : 0];
    const currentAlternative = targetDay.alternates[slot];
    const excludedProductIds = [
      ...primaryIds,
      ...(otherAlternative?.ingredients.map(({ productId }) => productId) ?? []),
      ...(replace ? currentAlternative?.ingredients.map(({ productId }) => productId) ?? [] : []),
    ];
    void generateAlternativeMeal({
      apiKey: getOpenAiApiKey(),
      dayIndex: targetDay.dayIndex,
      primaryMeal: targetDay.primaryMeal,
      candidates: productCatalog.filter((product) =>
        weeklyPlan?.alternativeCandidateProductIds.includes(product.id),
      ),
      excludedProductIds,
      dietaryNeeds: useFlowStore.getState().dietaryNeeds,
      nutritionalGoal: useFlowStore.getState().nutritionalGoal,
    })
      .then((alternative) => {
        setAlternative(targetDay.dayIndex, slot as 0 | 1, alternative);
        setAlternativeStatus((state) => {
          const { [targetAlternativeKey]: _removed, ...remaining } = state;
          return remaining;
        });
      })
      .catch(() =>
        setAlternativeStatus((state) => ({ ...state, [targetAlternativeKey]: "error" })),
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
        <Pressable
          accessibilityLabel="View selected filters"
          accessibilityRole="button"
          onPress={() => setFiltersVisible(true)}
          style={({ pressed }) => [styles.filtersButton, pressed && styles.pressed]}
        >
          <Text style={styles.filtersButtonLabel}>Filters</Text>
        </Pressable>
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
              onPress={() => selectDay(index)}
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

      <View style={styles.swipeHint}>
        <Pressable
          accessibilityLabel="Previous day"
          accessibilityRole="button"
          disabled={selectedDay === 0}
          onPress={() => selectDay(selectedDay - 1)}
          style={({ pressed }) => [
            styles.swipeArrow,
            selectedDay === 0 && styles.swipeArrowDisabled,
            pressed && selectedDay > 0 && styles.pressed,
          ]}
        >
          <Text style={styles.swipeArrowLabel}>‹</Text>
        </Pressable>
        <Text style={styles.swipeHintLabel}>Swipe to explore days</Text>
        <Pressable
          accessibilityLabel="Next day"
          accessibilityRole="button"
          disabled={selectedDay === DAY_NAMES.length - 1}
          onPress={() => selectDay(selectedDay + 1)}
          style={({ pressed }) => [
            styles.swipeArrow,
            selectedDay === DAY_NAMES.length - 1 && styles.swipeArrowDisabled,
            pressed && selectedDay < DAY_NAMES.length - 1 && styles.pressed,
          ]}
        >
          <Text style={styles.swipeArrowLabel}>›</Text>
        </Pressable>
      </View>

      <View
        style={[
          styles.panel,
          { height: maxPanelHeight },
        ]}
      >
      {weeklyPlan ? (
        <ScrollView
          horizontal
          onMomentumScrollEnd={(event) => {
            const nextDay = Math.round(event.nativeEvent.contentOffset.x / DAY_PANEL_WIDTH);
            setSelectedDay(Math.min(Math.max(nextDay, 0), DAY_NAMES.length - 1));
          }}
          pagingEnabled
          ref={carouselRef}
          showsHorizontalScrollIndicator={false}
          style={styles.carousel}
        >
          {weeklyPlan.days.map((planDayEntry) => {
            const dayChoice = mealChoices[planDayEntry.dayIndex] ?? 0;
            const dayMeal = mealForChoice(planDayEntry, dayChoice);
            const dayAlternativeKey = dayChoice > 0
              ? `${planDayEntry.dayIndex}-${dayChoice}`
              : null;
            const expanded = expandedDays[planDayEntry.dayIndex] ?? false;

            return (
              <ScrollView
                contentContainerStyle={styles.panelContent}
                key={planDayEntry.dayIndex}
                showsVerticalScrollIndicator={false}
                style={styles.dayPage}
              >
                <Text style={styles.dayTitle}>{DAY_NAMES[planDayEntry.dayIndex]}</Text>
                <MealChoices
                  selectedMealChoice={dayChoice}
                  setSelectedMealChoice={(choice) => setMealChoices((current) => ({
                    ...current,
                    [planDayEntry.dayIndex]: choice,
                  }))}
                />
                {dayMeal ? (
                  <MealDetail
                    day={planDayEntry}
                    expanded={expanded}
                    meal={dayMeal}
                    onRegenerate={() => Alert.alert("Generate a new alternative?", "This replaces the current alternative with another meal using different products.", [
                      { text: "Cancel", style: "cancel" }, { text: "Regenerate", onPress: () => requestAlternative(planDayEntry, dayChoice, true) },
                    ])}
                    onToggleExpanded={() => {
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setExpandedDays((current) => ({
                        ...current,
                        [planDayEntry.dayIndex]: !expanded,
                      }));
                    }}
                    selectedMealChoice={dayChoice}
                  />
                ) : dayChoice > 0 ? (
                  <AlternativePlaceholder
                    error={dayAlternativeKey ? alternativeStatus[dayAlternativeKey] === "error" : false}
                    loading={dayAlternativeKey ? alternativeStatus[dayAlternativeKey] === "loading" : false}
                    onRequest={() => requestAlternative(planDayEntry, dayChoice)}
                  />
                ) : (
                  <LoadingDetail error={generationStatus === "error" ? generationError : null} />
                )}
              </ScrollView>
            );
          })}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.panelContent}
          showsVerticalScrollIndicator={false}
          style={styles.loadingPanel}
        >
          <LoadingDetail error={generationStatus === "error" ? generationError : null} />
        </ScrollView>
      )}
      </View>
      <SelectedFiltersModal
        budget={budget}
        dietaryNeeds={dietaryNeeds}
        nutritionalGoal={nutritionalGoal}
        onClose={() => setFiltersVisible(false)}
        visible={filtersVisible}
      />
      <GenerationProgressModal
        message={generationMessage}
        progress={generationProgress}
        visible={generationStatus === "loading" && weeklyPlan === null}
      />
      <CelebrationOverlay visible={celebrationVisible} />
    </View>
  );
}

type MealDetailProps = {
  day: DayPlan;
  expanded: boolean;
  meal: Meal;
  selectedMealChoice: MealChoice;
  onRegenerate: () => void;
  onToggleExpanded: () => void;
};

function MealDetail({
  day,
  expanded,
  meal,
  selectedMealChoice,
  onRegenerate,
  onToggleExpanded,
}: MealDetailProps) {
  const perServing = meal.estimatedPrice.amount / Math.max(meal.servings, 1);
  return (
    <View style={styles.mealCard}>
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

      <Pressable
        accessibilityLabel={expanded ? "Hide recipe" : "View recipe"}
        accessibilityRole="button"
        onPress={onToggleExpanded}
        style={({ pressed }) => [styles.recipeToggleButton, pressed && styles.pressed]}
      >
        <Text style={styles.recipeToggleLabel}>{expanded ? "Hide recipe" : "View recipe"}</Text>
      </Pressable>

      {expanded ? (
        <>
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
      ) : null}
    </View>
  );
}

function MealChoices({ selectedMealChoice, setSelectedMealChoice }: { selectedMealChoice: MealChoice; setSelectedMealChoice: (choice: MealChoice) => void }) {
  const mealChoices: Array<{ choice: MealChoice; label: string }> = [{ choice: 0, label: "Today's meal" }, { choice: 1, label: "Alternative 1" }, { choice: 2, label: "Alternative 2" }];
  return <View accessibilityRole="tablist" style={styles.mealChoices}>{mealChoices.map(({ choice, label }) => {
    const selected = selectedMealChoice === choice;
    return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} key={choice} onPress={() => setSelectedMealChoice(choice)} style={({ pressed }) => [styles.mealChoice, selected && styles.mealChoiceSelected, pressed && styles.pressed]}><Text numberOfLines={1} style={[styles.mealChoiceLabel, selected && styles.mealChoiceLabelSelected]}>{label}</Text></Pressable>;
  })}</View>;
}

function SelectedFiltersModal({
  budget,
  dietaryNeeds,
  nutritionalGoal,
  onClose,
  visible,
}: {
  budget: number | null;
  dietaryNeeds: string[];
  nutritionalGoal: string | null;
  onClose: () => void;
  visible: boolean;
}) {
  const dietaryLabel = dietaryNeeds.length > 0
    ? dietaryNeeds.map((need) => DIETARY_NEED_LABELS[need] ?? need).join(", ")
    : "None selected";
  const nutritionalLabel = nutritionalGoal
    ? NUTRITIONAL_GOAL_LABELS[nutritionalGoal] ?? nutritionalGoal
    : "None selected";

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.filtersBackdrop}>
        <View accessibilityViewIsModal style={styles.filtersModal}>
          <Text accessibilityRole="header" style={styles.filtersModalTitle}>Your selected filters</Text>
          <FilterSummaryRow label="Weekly budget" value={budget === null ? "Not set" : `${formatEuro(budget)} / week`} />
          <FilterSummaryRow label="Dietary needs" value={dietaryLabel} />
          <FilterSummaryRow label="Nutritional goal" value={nutritionalLabel} />
          <Pressable
            accessibilityLabel="Close selected filters"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.filtersCloseButton, pressed && styles.pressed]}
          >
            <Text style={styles.filtersCloseLabel}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function FilterSummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.filterSummaryRow}>
      <Text style={styles.filterSummaryLabel}>{label}</Text>
      <Text style={styles.filterSummaryValue}>{value}</Text>
    </View>
  );
}

function CelebrationOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <View pointerEvents="none" style={styles.celebrationOverlay}>
      <LottieView
        autoPlay
        loop={false}
        resizeMode="cover"
        source={require("../animations/meal plan page/Confetti.json")}
        style={styles.confettiAnimation}
      />
    </View>
  );
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
    <View style={styles.mealCard}>
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
          <RotatingKitchenTip visible={visible} />
        </View>
      </View>
    </Modal>
  );
}

function RotatingKitchenTip({ visible }: { visible: boolean }) {
  const [tipIndex, setTipIndex] = useState(0);
  const [nextTipIndex, setNextTipIndex] = useState<number | null>(null);
  const currentTipIndexRef = useRef(0);
  const currentOpacity = useRef(new Animated.Value(1)).current;
  const nextOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      currentTipIndexRef.current = 0;
      setTipIndex(0);
      setNextTipIndex(null);
      currentOpacity.stopAnimation();
      nextOpacity.stopAnimation();
      currentOpacity.setValue(1);
      nextOpacity.setValue(0);
      return;
    }

    const timer = setInterval(() => {
      const nextIndex = (currentTipIndexRef.current + 1) % KITCHEN_TIPS.length;
      setNextTipIndex(nextIndex);
      currentOpacity.setValue(1);
      nextOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(currentOpacity, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(nextOpacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished) return;
        currentTipIndexRef.current = nextIndex;
        setTipIndex(nextIndex);
        setNextTipIndex(null);
        currentOpacity.setValue(1);
        nextOpacity.setValue(0);
      });
    }, 6000);

    return () => {
      clearInterval(timer);
      currentOpacity.stopAnimation();
      nextOpacity.stopAnimation();
    };
  }, [currentOpacity, nextOpacity, visible]);

  return (
    <View accessibilityLiveRegion="polite" style={styles.loadingTip}>
      <Text style={styles.loadingTipLabel}>Kitchen tip</Text>
      <Animated.Text style={[styles.loadingTipText, { opacity: currentOpacity }]}>
        {KITCHEN_TIPS[tipIndex]}
      </Animated.Text>
      {nextTipIndex !== null ? (
        <Animated.Text style={[styles.loadingTipText, styles.loadingTipIncoming, { opacity: nextOpacity }]}>
          {KITCHEN_TIPS[nextTipIndex]}
        </Animated.Text>
      ) : null}
    </View>
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
  filtersButton: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 99,
    height: 28,
    justifyContent: "center",
    paddingHorizontal: 12,
    position: "absolute",
    right: 10,
    top: 22,
  },
  filtersButtonLabel: {
    color: "#000000",
    fontFamily: "PromoSemiBold",
    fontSize: 12,
    lineHeight: 15,
  },
  daySelector: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 99,
    flexDirection: "row",
    gap: 2,
    height: 44,
    left: 20,
    padding: 4,
    position: "absolute",
    top: 234,
    width: 353,
  },
  dayButton: {
    alignItems: "center",
    borderRadius: 99,
    flex: 1,
    height: 36,
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
  swipeHint: {
    alignItems: "center",
    flexDirection: "row",
    height: 28,
    justifyContent: "center",
    left: 20,
    position: "absolute",
    top: 282,
    width: 353,
  },
  swipeHintLabel: {
    color: "rgba(255, 255, 255, 0.82)",
    fontFamily: "PromoMedium",
    fontSize: 12,
    lineHeight: 15,
    marginHorizontal: 10,
  },
  swipeArrow: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  swipeArrowDisabled: {
    opacity: 0.28,
  },
  swipeArrowLabel: {
    color: "#FFFFFF",
    fontFamily: "PromoRegular",
    fontSize: 28,
    lineHeight: 28,
  },
  panel: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    left: 28,
    overflow: "hidden",
    position: "absolute",
    top: DAY_PANEL_TOP,
    width: 337,
  },
  loadingPanel: {
    flex: 1,
  },
  carousel: {
    flex: 1,
  },
  dayPage: {
    width: DAY_PANEL_WIDTH,
  },
  panelContent: {
    gap: 28,
    padding: 24,
    paddingBottom: 40,
    width: DAY_PANEL_WIDTH,
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
  mealCard: {
    backgroundColor: "#F2F2F7",
    borderRadius: 20,
    gap: 16,
    padding: 16,
  },
  recipeToggleButton: {
    alignItems: "center",
    borderColor: "#34C759",
    borderRadius: 14,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
  },
  recipeToggleLabel: {
    color: "#249B43",
    fontFamily: "PromoSemiBold",
    fontSize: 14,
    lineHeight: 17,
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
  filtersBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  filtersModal: {
    backgroundColor: "#FDFFFB",
    borderRadius: 24,
    gap: 16,
    padding: 24,
    width: "100%",
  },
  filtersModalTitle: {
    color: "#000000",
    fontFamily: "PromoSemiBold",
    fontSize: 24,
    lineHeight: 29,
  },
  filterSummaryRow: {
    gap: 4,
  },
  filterSummaryLabel: {
    color: "rgba(60, 60, 67, 0.6)",
    fontFamily: "PromoMedium",
    fontSize: 13,
    lineHeight: 16,
  },
  filterSummaryValue: {
    color: "#000000",
    fontFamily: "PromoRegular",
    fontSize: 16,
    lineHeight: 21,
  },
  filtersCloseButton: {
    alignItems: "center",
    backgroundColor: "#34C759",
    borderRadius: 99,
    height: 52,
    justifyContent: "center",
    marginTop: 8,
  },
  filtersCloseLabel: {
    color: "#FFFFFF",
    fontFamily: "PromoSemiBold",
    fontSize: 17,
    lineHeight: 20,
  },
  celebrationOverlay: {
    bottom: 0,
    flex: 1,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  confettiAnimation: {
    height: "100%",
    width: "100%",
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
    height: 280,
    justifyContent: "center",
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
    minHeight: 44,
    textAlign: "center",
  },
  loadingTip: {
    alignItems: "center",
    minHeight: 48,
    paddingHorizontal: 4,
    position: "relative",
    width: "100%",
  },
  loadingTipLabel: {
    color: "rgba(60, 60, 67, 0.6)",
    fontFamily: "PromoSemiBold",
    fontSize: 11,
    lineHeight: 14,
    marginBottom: 3,
    textTransform: "uppercase",
  },
  loadingTipText: {
    color: "rgba(60, 60, 67, 0.78)",
    fontFamily: "PromoRegular",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  loadingTipIncoming: {
    left: 4,
    position: "absolute",
    right: 4,
    top: 17,
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
