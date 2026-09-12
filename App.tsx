import { useRef } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { getOpenAiApiKey } from "./src/config/env";
import { BudgetScreen } from "./src/screens/BudgetScreen";
import { DietaryNeedsScreen } from "./src/screens/DietaryNeedsScreen";
import { LanderScreen } from "./src/screens/LanderScreen";
import { NutritionalGoalsScreen } from "./src/screens/NutritionalGoalsScreen";
import { WeeklyMealPlanScreen } from "./src/screens/WeeklyMealPlanScreen";
import {
  generateWeeklyMealPlan,
  MEAL_PLAN_GENERATION_STAGES,
  type MealPlanGenerationDiagnostic,
  type MealPlanGenerationStage,
} from "./src/services/mealPlanGeneration";
import { useFlowStore } from "./src/store/useFlowStore";
import { useMealPrepFonts } from "./src/theme/fonts";
import type { RootStackParamList } from "./src/types/navigation";

const Stack = createNativeStackNavigator<RootStackParamList>();

const GENERATION_PROGRESS: Record<
  MealPlanGenerationStage,
  { message: string; percentage: number }
> = {
  [MEAL_PLAN_GENERATION_STAGES.selectingIngredients]: {
    message: "Selecting budget-friendly ingredients…",
    percentage: 5,
  },
  [MEAL_PLAN_GENERATION_STAGES.writingRecipes]: {
    message: "Getting everything in order…",
    percentage: 35,
  },
  [MEAL_PLAN_GENERATION_STAGES.finishingPlan]: {
    message: "Making some verifications…",
    percentage: 65,
  },
  [MEAL_PLAN_GENERATION_STAGES.validatingPlan]: {
    message: "Just a moment…",
    percentage: 90,
  },
};

function logMealPlanDiagnostic(
  diagnostic: MealPlanGenerationDiagnostic,
): void {
  if (__DEV__) {
    console.info(`[MealPlan diagnostic] ${JSON.stringify(diagnostic)}`);
  }
}

export default function App() {
  const [fontsLoaded] = useMealPrepFonts();
  const generationRequestIdRef = useRef(0);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <>
      <StatusBar style="dark" />
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Lander"
          screenOptions={{
            animation: "slide_from_right",
            contentStyle: { backgroundColor: "#FDFFFB" },
            headerShown: false,
          }}
        >
          <Stack.Screen name="Lander">
            {({ navigation }) => (
              <LanderScreen
                onCreateMealPlan={() => navigation.navigate("Budget")}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Budget">
            {({ navigation }) => (
              <BudgetScreen
                onBack={() => navigation.goBack()}
                onContinue={() => navigation.navigate("DietaryNeeds")}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="DietaryNeeds">
            {({ navigation }) => (
              <DietaryNeedsScreen
                onBack={() => navigation.goBack()}
                onContinue={() => navigation.navigate("NutritionalGoals")}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="NutritionalGoals">
            {({ navigation }) => (
              <NutritionalGoalsScreen
                onBack={() => navigation.goBack()}
                onContinue={() => {
                  const flow = useFlowStore.getState();
                  const requestId = generationRequestIdRef.current + 1;
                  generationRequestIdRef.current = requestId;

                  flow.beginMealPlanGeneration();
                  flow.setGenerationStatus("loading");
                  flow.setGenerationMessage(
                    "Creating your meal plan…",
                  );
                  flow.setGenerationProgress(0);
                  navigation.navigate("WeeklyPlan");

                  if (flow.budget === null) {
                    flow.setGenerationStatus(
                      "error",
                      "Choose a weekly budget before generating your plan.",
                    );
                    return;
                  }

                  // Yield one frame after navigation so the modal is painted before catalog work.
                  requestAnimationFrame(() => {
                    void generateWeeklyMealPlan(
                    {
                      budget: flow.budget!,
                      dietaryNeeds: flow.dietaryNeeds,
                      nutritionalGoal: flow.nutritionalGoal,
                      previousPrimaryProductIds: useFlowStore.getState().previousPrimaryProductIds,
                    },
                    {
                      apiKey: getOpenAiApiKey(),
                      onDiagnostic: logMealPlanDiagnostic,
                      onProgress: (stage) => {
                        if (generationRequestIdRef.current === requestId) {
                          const progress = GENERATION_PROGRESS[stage];
                          useFlowStore
                            .getState()
                            .setGenerationMessage(progress.message);
                          useFlowStore
                            .getState()
                            .setGenerationProgress(progress.percentage);
                        }
                      },
                    },
                  )
                    .then((plan) => {
                      if (generationRequestIdRef.current === requestId) {
                        const currentFlow = useFlowStore.getState();
                        currentFlow.setGenerationProgress(100);
                        setTimeout(() => {
                          if (generationRequestIdRef.current === requestId) {
                            useFlowStore.getState().setWeeklyPlan(plan);
                          }
                        }, 550);
                      }
                    })
                    .catch((error: unknown) => {
                      if (generationRequestIdRef.current !== requestId) {
                        return;
                      }

                      useFlowStore.getState().setGenerationStatus(
                        "error",
                        error instanceof Error
                          ? error.message
                          : "Your meal plan could not be generated.",
                      );
                    });
                  });
                }}
              />
            )}
          </Stack.Screen>
          <Stack.Screen component={WeeklyMealPlanScreen} name="WeeklyPlan" />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}
