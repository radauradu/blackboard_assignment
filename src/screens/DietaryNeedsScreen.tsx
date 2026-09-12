import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SvgUri } from "react-native-svg";

import { useFlowStore } from "../store/useFlowStore";
import type { DietaryNeed } from "../types/flow";

const DESIGN_WIDTH = 393;
const DESIGN_HEIGHT = 852;
const CHEVRON_URI = Image.resolveAssetSource(
  require("../../assets/icons/chevron-big-left.svg"),
).uri;

type DietaryNeedsScreenProps = {
  onBack?: () => void;
  onContinue?: () => void;
};

type DietaryCardOption = {
  accessibilityLabel: string;
  emoji?: string;
  label: string;
  need?: DietaryNeed;
};

const dietaryOptions: DietaryCardOption[] = [
  { accessibilityLabel: "No dietary needs", label: "None" },
  {
    accessibilityLabel: "Vegetarian",
    emoji: "🥕",
    label: "Veggie",
    need: "vegetarian",
  },
  {
    accessibilityLabel: "Vegan",
    emoji: "🌱",
    label: "Vegan",
    need: "vegan",
  },
  {
    accessibilityLabel: "Pescatarian",
    emoji: "🐟",
    label: "Pescatarian",
    need: "pescatarian",
  },
  {
    accessibilityLabel: "Gluten free",
    emoji: "🌾",
    label: "Gluten free",
    need: "glutenFree",
  },
  {
    accessibilityLabel: "Dairy free",
    emoji: "🥛",
    label: "Dairy free",
    need: "lactoseFree",
  },
];

export function DietaryNeedsScreen({
  onBack,
  onContinue,
}: DietaryNeedsScreenProps) {
  const dietaryNeeds = useFlowStore((state) => state.dietaryNeeds);
  const dietaryChoiceMade = useFlowStore((state) => state.dietaryChoiceMade);
  const chooseNoDietaryNeeds = useFlowStore(
    (state) => state.chooseNoDietaryNeeds,
  );
  const toggleDietaryNeed = useFlowStore((state) => state.toggleDietaryNeed);

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
          Any dietary needs?
        </Text>
      </View>

      <View style={styles.cardGrid}>
        {dietaryOptions.map((option) => {
          const isNone = option.need === undefined;
          const selected = isNone
            ? dietaryChoiceMade && dietaryNeeds.length === 0
            : option.need !== undefined && dietaryNeeds.includes(option.need);

          return (
            <Pressable
              accessibilityLabel={option.accessibilityLabel}
              accessibilityRole="checkbox"
              accessibilityState={{ selected }}
              key={option.label}
              onPress={() => {
                if (isNone) {
                  chooseNoDietaryNeeds();
                } else if (option.need) {
                  toggleDietaryNeed(option.need);
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
        disabled={!dietaryChoiceMade}
        onPress={onContinue}
        style={({ pressed }) => [
          styles.continueButton,
          dietaryChoiceMade && styles.continueButtonEnabled,
          pressed && dietaryChoiceMade && styles.pressed,
        ]}
        testID="continue-dietary-needs"
      >
        <Text
          style={[
            styles.continueLabel,
            dietaryChoiceMade && styles.continueLabelEnabled,
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
    width: 172,
  },
  progressHighlight: {
    backgroundColor: "rgba(255, 255, 255, 0.5)",
    borderRadius: 99,
    height: 6,
    left: 12,
    position: "absolute",
    top: 3,
    width: 148,
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
