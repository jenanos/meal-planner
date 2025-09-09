import { router } from "../trpc";
import { recipeRouter } from "./recipe";

export const appRouter = router({
  recipe: recipeRouter
});
export type AppRouter = typeof appRouter;
