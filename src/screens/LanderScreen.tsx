import { Image, Pressable, StyleSheet, Text, View } from "react-native";

const DESIGN_WIDTH = 393;
const DESIGN_HEIGHT = 852;
const BAG_SIZE = 200;

type LanderScreenProps = {
  onCreateMealPlan?: () => void;
};

type FloatingFood = {
  emoji: string;
  left: number;
  top: number;
};

const floatingFoods: FloatingFood[] = [
  { emoji: "🍎", left: 72, top: 272 },
  { emoji: "🥩", left: 238, top: 255 },
  { emoji: "🧀", left: 29, top: 392 },
  { emoji: "🥕", left: 316, top: 359 },
  { emoji: "🌽", left: 77, top: 530 },
  { emoji: "🍆", left: 198, top: 567 },
  { emoji: "🫒", left: 308, top: 510 },
];

export function LanderScreen({ onCreateMealPlan }: LanderScreenProps) {
  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>
        MealPrep
      </Text>

      <View pointerEvents="none" style={styles.illustration}>
        {floatingFoods.map(({ emoji, left, top }) => (
          <Text
            allowFontScaling={false}
            key={emoji}
            style={[styles.food, { left, top }]}
          >
            {emoji}
          </Text>
        ))}

        <Image
          accessibilityLabel="Esselunga shopping bag"
          resizeMode="contain"
          source={require("../../assets/images/lander-bag.png")}
          style={styles.bag}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create your meal plan"
        onPress={onCreateMealPlan}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        testID="create-meal-plan"
      >
        <Text style={styles.buttonLabel}>Create your meal plan</Text>
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
  title: {
    color: "#000000",
    fontFamily: "PromoSemiBold",
    fontSize: 48,
    left: 24,
    lineHeight: 58,
    position: "absolute",
    textAlign: "center",
    top: 82,
    width: 345,
  },
  illustration: {
    height: DESIGN_HEIGHT,
    left: 0,
    position: "absolute",
    top: 0,
    width: DESIGN_WIDTH,
  },
  bag: {
    height: BAG_SIZE,
    left: (DESIGN_WIDTH - BAG_SIZE) / 2,
    position: "absolute",
    top: DESIGN_HEIGHT / 2 - 114,
    width: BAG_SIZE,
  },
  food: {
    fontSize: 40,
    lineHeight: 48,
    position: "absolute",
  },
  button: {
    alignItems: "center",
    backgroundColor: "#34C759",
    borderRadius: 99,
    bottom: 57,
    height: 72,
    justifyContent: "center",
    left: 20,
    position: "absolute",
    width: 353,
  },
  buttonPressed: {
    opacity: 0.84,
  },
  buttonLabel: {
    color: "#FFFFFF",
    fontFamily: "PromoSemiBold",
    fontSize: 20,
    letterSpacing: 0.4,
    lineHeight: 24,
  },
});
