export type RootStackParamList = {
  Lander: undefined;
  Budget: undefined;
  DietaryNeeds: undefined;
  NutritionalGoals: undefined;
  WeeklyPlan: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
