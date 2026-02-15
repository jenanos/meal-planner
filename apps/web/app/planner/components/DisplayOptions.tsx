"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuCheckboxItem,
} from "@repo/ui";
import { ChevronDown } from "lucide-react";
import { ALL_DAY_NAMES } from "../utils";

interface DisplayOptionsProps {
  startDay: number;
  onStartDayChange: (_day: number) => void;
  showNextWeek?: boolean;
  onShowNextWeekChange?: (_show: boolean) => void;
}

export function DisplayOptions({
  startDay,
  onStartDayChange,
  showNextWeek,
  onShowNextWeekChange,
}: DisplayOptionsProps) {
  const startDayLabel = ALL_DAY_NAMES[startDay];
  const summaryParts = [`Fra ${startDayLabel.toLowerCase()}`];
  if (showNextWeek) summaryParts.push("+ neste uke");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
        >
          {summaryParts.join(" ")}
          <ChevronDown className="h-4 w-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Startdag</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(startDay)}
          onValueChange={(v) => onStartDayChange(Number(v))}
        >
          {ALL_DAY_NAMES.map((name, i) => (
            <DropdownMenuRadioItem key={i} value={String(i)}>
              {name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {onShowNextWeekChange != null && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={showNextWeek ?? false}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(checked) => onShowNextWeekChange(Boolean(checked))}
            >
              Inkluder neste uke
            </DropdownMenuCheckboxItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
