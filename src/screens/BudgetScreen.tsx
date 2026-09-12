import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Defs,
  LinearGradient,
  Stop,
  Svg,
  SvgUri,
  Text as SvgText,
} from "react-native-svg";

import { useFlowStore } from "../store/useFlowStore";
import {
  BUDGET_STEP,
  DEFAULT_BUDGET,
  MAX_BUDGET,
  MIN_BUDGET,
  clamp,
  snapBudget,
} from "../utils/budget";

const DESIGN_WIDTH = 393;
const DESIGN_HEIGHT = 852;
const THUMB_SIZE = 64;
const AMOUNT_HEIGHT = 115;
const CHEVRON_URI = Image.resolveAssetSource(
  require("../../assets/icons/chevron-big-left.svg"),
).uri;

type BudgetScreenProps = {
  onBack?: () => void;
  onContinue?: () => void;
};

function GradientBudgetAmount({ budget }: { budget: number }) {
  return (
    <Svg height={AMOUNT_HEIGHT} width={DESIGN_WIDTH}>
      <Defs>
        <LinearGradient
          gradientUnits="userSpaceOnUse"
          id="budgetAmountGradient"
          x1={0}
          x2={DESIGN_WIDTH}
          y1={0}
          y2={0}
        >
          <Stop offset="0%" stopColor="#1A1A1A" />
          <Stop offset="29%" stopColor="#1A1A1A" />
          <Stop offset="42%" stopColor="#34C759" />
          <Stop offset="56%" stopColor="#1A1A1A" />
          <Stop offset="100%" stopColor="#1A1A1A" />
        </LinearGradient>
      </Defs>
      <SvgText
        fill="url(#budgetAmountGradient)"
        fontFamily="PromoSemiBold"
        fontSize={96}
        textAnchor="middle"
        x={DESIGN_WIDTH / 2}
        y={96}
      >
        {`€${budget}`}
      </SvgText>
    </Svg>
  );
}

export function BudgetScreen({ onBack, onContinue }: BudgetScreenProps) {
  const storedBudget = useFlowStore((state) => state.budget);
  const setBudget = useFlowStore((state) => state.setBudget);
  const budget = storedBudget ?? DEFAULT_BUDGET;
  const [sliderWidth, setSliderWidth] = useState(345);
  const sliderRef = useRef<View>(null);
  const sliderPageXRef = useRef(24);
  const sliderWidthRef = useRef(sliderWidth);

  useEffect(() => {
    if (storedBudget === null) {
      setBudget(DEFAULT_BUDGET);
    }
  }, [setBudget, storedBudget]);

  const setBudgetFromPageX = useCallback(
    (pageX: number) => {
      const position = pageX - sliderPageXRef.current;
      const availableTravel = Math.max(sliderWidthRef.current - THUMB_SIZE, 1);
      const fraction = clamp(
        (position - THUMB_SIZE / 2) / availableTravel,
        0,
        1,
      );
      const rawBudget = MIN_BUDGET + fraction * (MAX_BUDGET - MIN_BUDGET);

      setBudget(snapBudget(rawBudget));
    },
    [setBudget],
  );

  const sliderResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (_event, gestureState) =>
          setBudgetFromPageX(gestureState.x0),
        onPanResponderMove: (_event, gestureState) =>
          setBudgetFromPageX(gestureState.moveX),
        onPanResponderTerminationRequest: () => false,
        onStartShouldSetPanResponder: () => true,
      }),
    [setBudgetFromPageX],
  );

  const budgetFraction = (budget - MIN_BUDGET) / (MAX_BUDGET - MIN_BUDGET);
  const thumbLeft =
    THUMB_SIZE / 2 + budgetFraction * (sliderWidth - THUMB_SIZE) - THUMB_SIZE / 2;

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
          What’s your budget?
        </Text>
      </View>

      <View pointerEvents="none" style={styles.amountContainer}>
        <GradientBudgetAmount budget={budget} />
        <Text style={styles.frequency}>per week</Text>
      </View>

      <View
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        accessibilityLabel="Weekly budget"
        accessibilityRole="adjustable"
        accessibilityValue={{
          max: MAX_BUDGET,
          min: MIN_BUDGET,
          now: budget,
          text: `${budget} euros per week`,
        }}
        onAccessibilityAction={(event) => {
          const direction = event.nativeEvent.actionName === "increment" ? 1 : -1;
          setBudget(snapBudget(budget + direction * BUDGET_STEP));
        }}
        onLayout={(event) => {
          const nextWidth = event.nativeEvent.layout.width;
          sliderWidthRef.current = nextWidth;
          setSliderWidth(nextWidth);
          sliderRef.current?.measureInWindow((x) => {
            sliderPageXRef.current = x;
          });
        }}
        ref={sliderRef}
        style={styles.slider}
        {...sliderResponder.panHandlers}
      >
        <View style={styles.sliderTrack} />
        <View style={[styles.sliderThumb, { left: thumbLeft }]} />
      </View>

      <Pressable
        accessibilityLabel="Continue"
        accessibilityRole="button"
        onPress={onContinue}
        style={({ pressed }) => [styles.continueButton, pressed && styles.pressed]}
        testID="continue-budget"
      >
        <Text style={styles.continueLabel}>Continue</Text>
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
    width: "25%",
  },
  progressHighlight: {
    backgroundColor: "rgba(255, 255, 255, 0.5)",
    borderRadius: 99,
    height: 6,
    left: 12,
    position: "absolute",
    top: 3,
    width: 62,
  },
  heading: {
    color: "#000000",
    fontFamily: "PromoSemiBold",
    fontSize: 32,
    lineHeight: 38,
    marginTop: 20,
  },
  amountContainer: {
    alignItems: "center",
    left: 0,
    position: "absolute",
    top: 287,
    width: DESIGN_WIDTH,
  },
  frequency: {
    color: "rgba(60, 60, 67, 0.6)",
    fontFamily: "PromoMedium",
    fontSize: 20,
    lineHeight: 24,
    marginTop: -1,
  },
  slider: {
    height: 64,
    left: 24,
    position: "absolute",
    top: 488,
    width: 345,
  },
  sliderTrack: {
    backgroundColor: "#F2F2F7",
    borderRadius: 99,
    height: 16,
    left: 0,
    position: "absolute",
    right: 0,
    top: 24,
  },
  sliderThumb: {
    backgroundColor: "#34C759",
    borderRadius: THUMB_SIZE / 2,
    height: THUMB_SIZE,
    position: "absolute",
    top: 0,
    width: THUMB_SIZE,
  },
  continueButton: {
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
  continueLabel: {
    color: "#FFFFFF",
    fontFamily: "PromoSemiBold",
    fontSize: 20,
    letterSpacing: 0.4,
    lineHeight: 24,
  },
  pressed: {
    opacity: 0.84,
  },
});
