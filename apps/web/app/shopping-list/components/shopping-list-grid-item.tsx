"use client";

import { useCallback, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  Button,
} from "@repo/ui";

interface ShoppingListGridItemProps {
  name: string;
  quantityLabel: string | null;
  checked: boolean;
  onToggle: () => void;
  onRemove: () => void;
}

export function ShoppingListGridItem({
  name,
  quantityLabel,
  checked,
  onToggle,
  onRemove,
}: ShoppingListGridItemProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const handlePointerDown = useCallback(() => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setConfirmOpen(true);
    }, 500);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!didLongPress.current) {
      onToggle();
    }
  }, [onToggle]);

  const handlePointerLeave = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setConfirmOpen(true);
    },
    [],
  );

  return (
    <>
      <button
        type="button"
        className={`flex flex-col items-center justify-center rounded-lg border bg-white p-2 text-center select-none touch-manipulation transition-opacity focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${checked ? "opacity-40" : ""}`}
        style={{ minHeight: "3.5rem" }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
        onContextMenu={handleContextMenu}
        aria-label={`${name}${checked ? " (kjøpt)" : ""}`}
      >
        <span
          className={`text-xs font-medium leading-tight line-clamp-2 ${checked ? "text-gray-400 line-through" : "text-gray-900"}`}
        >
          {name}
        </span>
        {quantityLabel ? (
          <span
            className={`text-[10px] leading-tight mt-0.5 ${checked ? "text-gray-300" : "text-gray-500"}`}
          >
            {quantityLabel}
          </span>
        ) : null}
      </button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-xs w-[calc(100vw-3rem)] rounded-xl p-5">
          <DialogTitle className="text-sm font-semibold">
            Fjerne {name}?
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Elementet fjernes fra handlelisten.
          </DialogDescription>
          <div className="flex gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setConfirmOpen(false)}
            >
              Avbryt
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="flex-1"
              onClick={() => {
                setConfirmOpen(false);
                onRemove();
              }}
            >
              Fjern
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
