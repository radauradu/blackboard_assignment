import { beforeEach, describe, expect, it } from "vitest";

import { initialFlowState, useFlowStore } from "../src/store/useFlowStore";

describe("flow store", () => {
  beforeEach(() => {
    useFlowStore.getState().reset();
  });

  it("keeps selections in session state", () => {
    const store = useFlowStore.getState();

    store.setBudget(75);
    store.toggleDietaryNeed("vegan");
    store.toggleDietaryNeed("glutenFree");
    store.toggleDietaryNeed("pescatarian");
    store.setNutritionalGoal("highProtein");

    expect(useFlowStore.getState()).toMatchObject({
      budget: 75,
      dietaryNeeds: ["vegan", "glutenFree", "pescatarian"],
      nutritionalGoal: "highProtein",
    });
  });

  it("toggles dietary selections and resets the flow", () => {
    const store = useFlowStore.getState();

    store.toggleDietaryNeed("vegetarian");
    store.toggleDietaryNeed("vegetarian");
    expect(useFlowStore.getState().dietaryNeeds).toEqual([]);

    store.setBudget(50);
    useFlowStore.getState().reset();

    expect(useFlowStore.getState()).toMatchObject(initialFlowState);
  });

  it("records an explicit no-dietary-needs choice", () => {
    const store = useFlowStore.getState();

    store.toggleDietaryNeed("vegan");
    store.chooseNoDietaryNeeds();

    expect(useFlowStore.getState()).toMatchObject({
      dietaryChoiceMade: true,
      dietaryNeeds: [],
    });
  });

  it("requires an explicit none choice after the final restriction is removed", () => {
    const store = useFlowStore.getState();

    store.toggleDietaryNeed("vegan");
    store.toggleDietaryNeed("vegan");

    expect(useFlowStore.getState().dietaryChoiceMade).toBe(false);
  });

  it("stores exactly one nutritional goal or an explicit none choice", () => {
    const store = useFlowStore.getState();

    store.setNutritionalGoal("lowCarbs");
    store.setNutritionalGoal("lowSalt");

    expect(useFlowStore.getState()).toMatchObject({
      nutritionalGoal: "lowSalt",
      nutritionalGoalChoiceMade: true,
    });

    store.chooseNoNutritionalGoal();

    expect(useFlowStore.getState()).toMatchObject({
      nutritionalGoal: null,
      nutritionalGoalChoiceMade: true,
    });
  });

  it("stores and clears loading progress with the generation lifecycle", () => {
    const store = useFlowStore.getState();

    store.setGenerationStatus("loading");
    store.setGenerationMessage("Creating your meal plan…");
    store.setGenerationProgress(0);

    expect(useFlowStore.getState()).toMatchObject({
      generationStatus: "loading",
      generationMessage: "Creating your meal plan…",
      generationProgress: 0,
    });

    store.setGenerationStatus("error", "Timed out");

    expect(useFlowStore.getState()).toMatchObject({
      generationStatus: "error",
      generationMessage: null,
      generationProgress: null,
    });
  });
});
