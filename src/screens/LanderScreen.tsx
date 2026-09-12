import LottieView from "lottie-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

const DESIGN_WIDTH = 393;
const DESIGN_HEIGHT = 852;

type LanderScreenProps = {
  onCreateMealPlan?: () => void;
};

export function LanderScreen({ onCreateMealPlan }: LanderScreenProps) {
  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>
        MealPrep
      </Text>

      <View pointerEvents="none" style={styles.illustration}>
        <LottieView
          autoPlay
          loop
          resizeMode="contain"
          source={require("../animations/lander page/cooking.json")}
          style={styles.animation}
        />
        <Text style={styles.introduction}>
          Fresh meal ideas, planned around you.
        </Text>
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
    alignItems: "center",
    left: 0,
    position: "absolute",
    top: 164,
    width: DESIGN_WIDTH,
  },
  animation: {
    height: 300,
    width: 300,
  },
  introduction: {
    color: "rgba(60, 60, 67, 0.72)",
    fontFamily: "PromoRegular",
    fontSize: 17,
    lineHeight: 22,
    marginTop: 4,
    textAlign: "center",
    width: 300,
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
