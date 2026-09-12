import { useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
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
  description?: string;
  emoji?: string;
  goal?: NutritionalGoal;
  label: string;
};

const goalOptions: GoalCardOption[] = [
  { accessibilityLabel: "No nutritional goal", label: "None" },
  {
    accessibilityLabel: "High protein",
    description: "Protein supports muscle repair and can help meals feel more satisfying. People often choose this goal when they are active or want to stay fuller for longer.",
    emoji: "🥩",
    goal: "highProtein",
    label: "High protein",
  },
  {
    accessibilityLabel: "Low calorie",
    description: "Lower-calorie choices can help reduce overall energy intake. People may choose this goal when managing weight while still prioritising filling, nutrient-rich meals.",
    emoji: "🫑",
    goal: "lowCalorie",
    label: "Low calorie",
  },
  {
    accessibilityLabel: "Balanced nutrition",
    description: "Balanced choices aim for a steady mix of nutrients and everyday variety. It is a flexible option for people who want well-rounded meals without a single strict target.",
    emoji: "🍝",
    goal: "balanced",
    label: "Balanced",
  },
  {
    accessibilityLabel: "Low carbs",
    description: "Lower-carb meals reduce carbohydrate-heavy foods. Some people choose them to manage blood-sugar response or to match a personal eating preference.",
    emoji: "🍯",
    goal: "lowCarbs",
    label: "Low carbs",
  },
  {
    accessibilityLabel: "Low salt",
    description: "Lower-salt choices can support heart health and blood-pressure management. People may choose this goal when they want to reduce sodium in everyday meals.",
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
  const clearNutritionalGoal = useFlowStore(
    (state) => state.clearNutritionalGoal,
  );
  const setNutritionalGoal = useFlowStore(
    (state) => state.setNutritionalGoal,
  );
  const [infoOption, setInfoOption] = useState<GoalCardOption | null>(null);
  const [isInfoVisible, setInfoVisible] = useState(false);

  const openInfo = (option: GoalCardOption) => {
    setInfoOption(option);
    setInfoVisible(true);
  };

  const closeInfo = () => setInfoVisible(false);

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
            <View key={option.label} style={[styles.card, selected && styles.cardSelected]}>
              <Pressable
                accessibilityLabel={option.accessibilityLabel}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => {
                  if (isNone) {
                    if (selected) {
                      clearNutritionalGoal();
                    } else {
                      chooseNoNutritionalGoal();
                    }
                  } else if (option.goal) {
                    if (selected) {
                      clearNutritionalGoal();
                    } else {
                      setNutritionalGoal(option.goal);
                    }
                  }
                }}
                style={({ pressed }) => [styles.cardSelection, pressed && styles.pressed]}
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
              {option.description ? (
                <Pressable
                  accessibilityLabel={`More information about ${option.label}`}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => openInfo(option)}
                  style={({ pressed }) => [
                    styles.infoButton,
                    selected && styles.infoButtonSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.infoLabel, selected && styles.infoLabelSelected]}>i</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>

      <Modal
        animationType="fade"
        onDismiss={() => setInfoOption(null)}
        onRequestClose={closeInfo}
        transparent
        visible={isInfoVisible}
      >
        <View style={styles.infoBackdrop}>
          <View accessibilityViewIsModal style={styles.infoModal}>
            <Text accessibilityRole="header" style={styles.infoTitle}>
              {infoOption?.label}
            </Text>
            <Text style={styles.infoDescription}>{infoOption?.description}</Text>
            <Pressable
              accessibilityLabel="Close nutritional goal information"
              accessibilityRole="button"
              onPress={closeInfo}
              style={({ pressed }) => [styles.infoCloseButton, pressed && styles.pressed]}
            >
              <Text style={styles.infoCloseLabel}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
    backgroundColor: "#F2F2F7",
    borderRadius: 20,
    height: 104,
    overflow: "hidden",
    width: 168.5,
  },
  cardSelected: {
    backgroundColor: "#34C759",
  },
  cardSelection: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
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
  infoButton: {
    alignItems: "center",
    backgroundColor: "rgba(60, 60, 67, 0.1)",
    borderRadius: 99,
    height: 24,
    justifyContent: "center",
    position: "absolute",
    right: 10,
    top: 10,
    width: 24,
  },
  infoButtonSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.24)",
  },
  infoLabel: {
    color: "rgba(60, 60, 67, 0.72)",
    fontFamily: "PromoSemiBold",
    fontSize: 14,
    lineHeight: 17,
  },
  infoLabelSelected: {
    color: "#FFFFFF",
  },
  infoBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  infoModal: {
    backgroundColor: "#FDFFFB",
    borderRadius: 24,
    padding: 24,
    width: "100%",
  },
  infoTitle: {
    color: "#000000",
    fontFamily: "PromoSemiBold",
    fontSize: 24,
    lineHeight: 29,
  },
  infoDescription: {
    color: "rgba(60, 60, 67, 0.8)",
    fontFamily: "PromoRegular",
    fontSize: 17,
    lineHeight: 23,
    marginTop: 12,
  },
  infoCloseButton: {
    alignItems: "center",
    backgroundColor: "#34C759",
    borderRadius: 99,
    height: 52,
    justifyContent: "center",
    marginTop: 24,
  },
  infoCloseLabel: {
    color: "#FFFFFF",
    fontFamily: "PromoSemiBold",
    fontSize: 17,
    lineHeight: 20,
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
