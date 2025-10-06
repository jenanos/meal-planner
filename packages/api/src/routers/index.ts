import { router } from "../trpc";
import { recipeRouter } from "./recipe";
import { plannerRouter } from "./planner";
import { ingredientRouter } from "./ingredient";

const routes = {
  recipe: recipeRouter,
  planner: plannerRouter,
  ingredient: ingredientRouter,
} as const;

export const appRouter = router(routes);
export type AppRouter = typeof appRouter;
