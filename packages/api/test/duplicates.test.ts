import { describe, expect, it } from "vitest";
import {
  editDistance,
  findDuplicateGroups,
  namesLookLikeDuplicates,
} from "../src/duplicates.js";

const groupNames = (names: string[]) =>
  findDuplicateGroups(names.map((name) => ({ name, usageCount: 0 }))).map(
    (group) => group.map((item) => item.name).sort(),
  );

describe("namesLookLikeDuplicates", () => {
  it.each([
    ["Epler", "Epler 4 stk"],
    ["Epler", "Norske epler"],
    ["eple", "epler"],
    ["potet", "poteter"],
    ["sitron", "sitroner"],
    ["riseddik", "risedikk"],
    ["risnudler", "risnudel"],
    ["kyllingfilet", "kylling filet"],
    ["Løk, rød", "rødløk"],
    ["Crème fraîche", "creme fraiche"],
    ["chili", "chilli"],
    ["Melk 1l", "melk"],
  ])("treats «%s» and «%s» as duplicates", (a, b) => {
    expect(namesLookLikeDuplicates(a, b)).toBe(true);
  });

  it.each([
    ["ris", "risnudler"],
    ["ris", "rispapir"],
    ["ris", "riseddik"],
    ["sitron", "sitrongress"],
    ["løk", "rødløk"],
    ["gul løk", "rød løk"],
    ["mel", "melk"],
    ["salt", "malt"],
    ["paprika", "paprikapulver"],
    ["hvitvinseddik", "rødvinseddik"],
    ["laks", "laksefilet"],
  ])("keeps «%s» and «%s» apart", (a, b) => {
    expect(namesLookLikeDuplicates(a, b)).toBe(false);
  });
});

describe("findDuplicateGroups", () => {
  it("does not lump compound words together by prefix", () => {
    expect(
      groupNames([
        "ris",
        "riseddik",
        "risedikk",
        "risnudler",
        "rispapir",
        "sitron",
        "sitrongress",
      ]),
    ).toEqual([["riseddik", "risedikk"]]);
  });

  it("puts the most used item first", () => {
    const groups = findDuplicateGroups([
      { name: "Epler 4 stk", usageCount: 1 },
      { name: "Epler", usageCount: 8 },
      { name: "Norske epler", usageCount: 1 },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]![0]!.name).toBe("Epler");
  });
});

describe("editDistance", () => {
  it("counts adjacent transpositions as one edit", () => {
    expect(editDistance("melk", "mlek")).toBe(1);
    expect(editDistance("abc", "abc")).toBe(0);
    expect(editDistance("kitten", "sitting")).toBe(3);
  });
});
