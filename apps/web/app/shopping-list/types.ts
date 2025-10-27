import type { MockShoppingListResult } from "../../lib/mock/store";

export type ShoppingListResult = MockShoppingListResult;
export type ShoppingListItem = ShoppingListResult["items"][number];
export type ShoppingListOccurrence = ShoppingListItem["occurrences"][number];
