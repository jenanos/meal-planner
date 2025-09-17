import { router } from "../trpc";
import { recipeRouter } from "./recipe";
import { plannerRouter } from "./planner";
import { ingredientRouter } from "./ingredient";

export const appRouter = router({
  recipe: recipeRouter,
  planner: plannerRouter,
  ingredient: ingredientRouter,
});

export type AppRouter = typeof appRouter;
