import { router } from "../trpc";
import { recipeRouter } from "./recipe";
import { plannerRouter } from "./planner";

export const appRouter = router({
  recipe: recipeRouter,
  planner: plannerRouter,
});
export type AppRouter = typeof appRouter;
