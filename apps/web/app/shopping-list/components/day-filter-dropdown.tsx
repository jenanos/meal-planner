"use client";

import { Button, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@repo/ui";
import { ChevronDown } from "lucide-react";
import type { ShoppingListOccurrence } from "../types";

interface DayFilterOption {
  key: string;
  weekdayLabel: ShoppingListOccurrence["weekdayLabel"];
  shortLabel: ShoppingListOccurrence["shortLabel"];
  longLabel: ShoppingListOccurrence["longLabel"];
}

interface DayFilterDropdownProps {
  label: string;
  options: DayFilterOption[];
  selectedKeys: Set<string>;
  onToggle: (_dayKey: string, _checked: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

export function DayFilterDropdown({
  label,
  options,
  selectedKeys,
  onToggle,
  onSelectAll,
  onSelectNone,
}: DayFilterDropdownProps) {
  if (!options.length) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2">
          {label}
          <ChevronDown className="h-4 w-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Vis dager</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.key}
            checked={selectedKeys.has(option.key)}
            onCheckedChange={(checked) => onToggle(option.key, Boolean(checked))}
            className="cursor-pointer"
          >
            <div className="flex w-full items-center justify-between gap-3">
              <span>{option.weekdayLabel}</span>
              <span className="text-xs text-muted-foreground">{option.shortLabel}</span>
            </div>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={selectedKeys.size === options.length}
          onCheckedChange={(checked) => {
            if (checked) onSelectAll();
            else onSelectNone();
          }}
          className="cursor-pointer text-muted-foreground"
        >
          Velg alle
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={selectedKeys.size === 0}
          onCheckedChange={(checked) => {
            if (checked) onSelectNone();
            else onSelectAll();
          }}
          className="cursor-pointer text-muted-foreground"
        >
          Skjul alle
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
