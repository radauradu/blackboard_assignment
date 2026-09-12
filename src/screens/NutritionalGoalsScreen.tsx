import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SvgUri } from "react-native-svg";

import { useFlowStore } from "../store/useFlowStore";
import type { NutritionalGoal } from "../types/flow";

const DESIGN_WIDTH = 393;
const DESIGN_HEIGHT = 852;
const CHEVRON_URI = Image.resolveAssetSource(
  require("../../assets/icons/chevron-big-left.svg"),
).uri;

type NutritionalGoalsScreenProps = {
  onBack?: () => void;
  onContinue?: () => void;
};

type GoalCardOption = {
  accessibilityLabel: string;
  emoji?: string;
  goal?: NutritionalGoal;
  label: string;
};

const goalOptions: GoalCardOption[] = [
  { accessibilityLabel: "No nutritional goal", label: "None" },
  {
    accessibilityLabel: "High protein",
    emoji: "🥩",
    goal: "highProtein",
    label: "High protein",
  },
  {
    accessibilityLabel: "Low calorie",
    emoji: "🫑",
    goal: "lowCalorie",
    label: "Low calorie",
  },
  {
    accessibilityLabel: "Balanced nutrition",
    emoji: "🍝",
    goal: "balanced",
    label: "Balanced",
  },
  {
    accessibilityLabel: "Low carbs",
    emoji: "🍯",
    goal: "lowCarbs",
    label: "Low carbs",
  },
  {
    accessibilityLabel: "Low salt",
    emoji: "🧂",
    goal: "lowSalt",
    label: "Low salt",
  },
];

export function NutritionalGoalsScreen({
  onBack,
  onContinue,
}: NutritionalGoalsScreenProps) {
  const nutritionalGoal = useFlowStore((state) => state.nutritionalGoal);
  const nutritionalGoalChoiceMade = useFlowStore(
    (state) => state.nutritionalGoalChoiceMade,
  );
  const chooseNoNutritionalGoal = useFlowStore(
    (state) => state.chooseNoNutritionalGoal,
  );
  const setNutritionalGoal = useFlowStore(
    (state) => state.setNutritionalGoal,
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.progressRow}>
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <SvgUri height={20} uri={CHEVRON_URI} width={20} />
          </Pressable>

          <View style={styles.progressTrack}>
            <View style={styles.progressFill}>
              <View style={styles.progressHighlight} />
            </View>
          </View>
        </View>

        <Text accessibilityRole="header" style={styles.heading}>
          Any nutritional goals?
        </Text>
      </View>

      <View style={styles.cardGrid}>
        {goalOptions.map((option) => {
          const isNone = option.goal === undefined;
          const selected = isNone
            ? nutritionalGoalChoiceMade && nutritionalGoal === null
            : option.goal === nutritionalGoal;

          return (
            <Pressable
              accessibilityLabel={option.accessibilityLabel}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              key={option.label}
              onPress={() => {
                if (isNone) {
                  chooseNoNutritionalGoal();
                } else if (option.goal) {
                  setNutritionalGoal(option.goal);
                }
              }}
              style={({ pressed }) => [
                styles.card,
                selected && styles.cardSelected,
                pressed && styles.pressed,
              ]}
            >
              {option.emoji ? (
                <Text allowFontScaling={false} style={styles.cardEmoji}>
                  {option.emoji}
                </Text>
              ) : null}
              <Text style={[styles.cardLabel, selected && styles.cardLabelSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityLabel="Continue"
        accessibilityRole="button"
        disabled={!nutritionalGoalChoiceMade}
        onPress={onContinue}
        style={({ pressed }) => [
          styles.continueButton,
          nutritionalGoalChoiceMade && styles.continueButtonEnabled,
          pressed && nutritionalGoalChoiceMade && styles.pressed,
        ]}
        testID="continue-nutritional-goals"
      >
        <Text
          style={[
            styles.continueLabel,
            nutritionalGoalChoiceMade && styles.continueLabelEnabled,
          ]}
        >
          Continue
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: "#FDFFFB",
    flex: 1,
    minHeight: DESIGN_HEIGHT,
    minWidth: DESIGN_WIDTH,
  },
  header: {
    left: 20,
    position: "absolute",
    top: 82,
    width: 353,
  },
  progressRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    height: 28,
  },
  backButton: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 99,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  progressTrack: {
    backgroundColor: "#F2F2F7",
    borderRadius: 99,
    flex: 1,
    height: 20,
    overflow: "hidden",
  },
  progressFill: {
    backgroundColor: "#34C759",
    borderRadius: 99,
    height: 20,
    overflow: "hidden",
    width: 258,
  },
  progressHighlight: {
    backgroundColor: "rgba(255, 255, 255, 0.5)",
    borderRadius: 99,
    height: 6,
    left: 12,
    position: "absolute",
    top: 3,
    width: 234,
  },
  heading: {
    color: "#000000",
    fontFamily: "PromoSemiBold",
    fontSize: 32,
    lineHeight: 38,
    marginTop: 20,
  },
  cardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    height: 344,
    left: 20,
    position: "absolute",
    top: 254,
    width: 353,
  },
  card: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 20,
    height: 104,
    justifyContent: "center",
    width: 168.5,
  },
  cardSelected: {
    backgroundColor: "#34C759",
  },
  cardEmoji: {
    fontSize: 32,
    lineHeight: 38,
    marginBottom: 4,
  },
  cardLabel: {
    color: "#000000",
    fontFamily: "PromoMedium",
    fontSize: 16,
    lineHeight: 19,
  },
  cardLabelSelected: {
    color: "#FFFFFF",
  },
  continueButton: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 99,
    bottom: 57,
    height: 72,
    justifyContent: "center",
    left: 20,
    position: "absolute",
    width: 353,
  },
  continueButtonEnabled: {
    backgroundColor: "#34C759",
  },
  continueLabel: {
    color: "rgba(60, 60, 67, 0.18)",
    fontFamily: "PromoSemiBold",
    fontSize: 20,
    letterSpacing: 0.4,
    lineHeight: 24,
  },
  continueLabelEnabled: {
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.84,
  },
});
