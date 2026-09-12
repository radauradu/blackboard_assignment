import { useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
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
  description?: string;
  emoji?: string;
  label: string;
  need?: DietaryNeed;
};

const dietaryOptions: DietaryCardOption[] = [
  {
    accessibilityLabel: "No dietary needs",
    label: "None",
  },
  {
    accessibilityLabel: "Vegetarian",
    description: "Vegetarian meals avoid meat and fish. Eggs and dairy products may still be included.",
    emoji: "🥕",
    label: "Veggie",
    need: "vegetarian",
  },
  {
    accessibilityLabel: "Vegan",
    description: "Vegan meals use plant-based products only and avoid meat, fish, eggs, and dairy.",
    emoji: "🌱",
    label: "Vegan",
    need: "vegan",
  },
  {
    accessibilityLabel: "Pescatarian",
    description: "Pescatarian meals avoid meat and poultry, while allowing fish and plant-based foods.",
    emoji: "🐟",
    label: "Pescatarian",
    need: "pescatarian",
  },
  {
    accessibilityLabel: "Gluten free",
    description: "Gluten-free filtering excludes products with a declared gluten allergen. Always check labels for personal medical needs.",
    emoji: "🌾",
    label: "Gluten free",
    need: "glutenFree",
  },
  {
    accessibilityLabel: "Dairy free",
    description: "Dairy-free filtering excludes products with a declared milk allergen.",
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
  const clearDietaryNeeds = useFlowStore((state) => state.clearDietaryNeeds);
  const toggleDietaryNeed = useFlowStore((state) => state.toggleDietaryNeed);
  const [infoOption, setInfoOption] = useState<DietaryCardOption | null>(null);
  const [isInfoVisible, setInfoVisible] = useState(false);

  const openInfo = (option: DietaryCardOption) => {
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
            <View key={option.label} style={[styles.card, selected && styles.cardSelected]}>
              <Pressable
                accessibilityLabel={option.accessibilityLabel}
                accessibilityRole="checkbox"
                accessibilityState={{ selected }}
                onPress={() => {
                  if (isNone) {
                    if (selected) {
                      clearDietaryNeeds();
                    } else {
                      chooseNoDietaryNeeds();
                    }
                  } else if (option.need) {
                    toggleDietaryNeed(option.need);
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
              accessibilityLabel="Close dietary information"
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
