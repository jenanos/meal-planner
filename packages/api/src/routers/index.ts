import { router } from "../trpc.js";
import { recipeRouter } from "./recipe.js";
import { plannerRouter } from "./planner.js";
import { ingredientRouter } from "./ingredient.js";
import { freezerRouter } from "./freezer.js";
import { adminRouter } from "./admin.js";

const routes = {
  recipe: recipeRouter,
  planner: plannerRouter,
  ingredient: ingredientRouter,
  freezer: freezerRouter,
  admin: adminRouter,
} as const;

export const appRouter = router(routes);
export type AppRouter = typeof appRouter;
