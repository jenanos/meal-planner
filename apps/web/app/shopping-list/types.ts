import type { RouterOutputs } from "../../lib/trpcTypes";

export type ShoppingListResult = RouterOutputs["planner"]["shoppingList"];
export type ShoppingListItem = ShoppingListResult["items"][number];
export type ShoppingListOccurrence = ShoppingListItem["occurrences"][number];
