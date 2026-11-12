/**
 * Finds likely duplicates among ingredient / catalog names.
 *
 * The previous approach grouped names by prefix/substring, which put compound
 * words such as «ris», «risnudler» and «rispapir» in the same group. Norwegian
 * builds most food names as compounds, so a shared prefix says very little.
 *
 * Here two names are only considered duplicates when they describe the same
 * thing once noise is removed:
 *  - quantities and units are ignored («Epler 4 stk» → «epler»)
 *  - origin/quality words are ignored («Norske epler» → «epler»)
 *  - singular/plural and definite forms are folded («eple», «epler», «eplene»)
 *  - word order and spacing are ignored («kylling filet» = «kyllingfilet»)
 *  - small typos are tolerated on longer words («riseddik» ≈ «risedikk»)
 */

const UNIT_TOKENS = new Set([
    "stk", "stykk", "stykker", "g", "gr", "gram", "kg", "hg", "mg",
    "l", "dl", "cl", "ml", "liter", "ss", "ts", "spsk", "tsk", "krm",
    "pk", "pakke", "pakker", "pakning", "boks", "bokser", "pose", "poser",
    "glass", "flaske", "flasker", "beger", "bunt", "neve", "klype", "x", "ca",
]);

const QUALIFIER_TOKENS = new Set([
    "norsk", "norske", "svensk", "svenske", "dansk", "danske",
    "økologisk", "økologiske", "øko", "eco",
    "fersk", "ferske", "frisk", "friske",
    "stor", "store", "liten", "lite", "små", "mellomstor", "mellomstore",
    "ekstra",
]);

// Ordered longest first so «-ene» wins over «-e».
const SUFFIXES = ["ene", "ane", "er", "ar", "en", "e"];
const MIN_STEM_LENGTH = 3;

const NUMBER_WITH_UNIT = /^\d+([.,]\d+)?[a-zæøå]{0,6}$/;

function foldDiacritics(value: string): string {
    // Strip accents (é → e, ü → u) but keep the Norwegian letters æ, ø and å.
    return value.replace(/[^ -~]/g, (ch) =>
        ch === "å" || ch === "æ" || ch === "ø"
            ? ch
            : ch.normalize("NFD").replace(/\p{M}/gu, ""),
    );
}

export function stemToken(token: string): string {
    for (const suffix of SUFFIXES) {
        if (token.length - suffix.length >= MIN_STEM_LENGTH && token.endsWith(suffix)) {
            return token.slice(0, -suffix.length);
        }
    }
    return token;
}

export function tokenizeName(name: string): string[] {
    const cleaned = foldDiacritics(name.toLowerCase())
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
    if (!cleaned) return [];
    const tokens = cleaned.split(/\s+/);
    const meaningful = tokens.filter(
        (t) => !UNIT_TOKENS.has(t) && !QUALIFIER_TOKENS.has(t) && !NUMBER_WITH_UNIT.test(t),
    );
    // A name made only of "noise" words (e.g. «Øko») is still a name.
    return meaningful.length > 0 ? meaningful : tokens;
}

export type NameSignature = {
    /** Stemmed tokens sorted, so word order does not matter. */
    tokenKey: string;
    /** All tokens glued together and stemmed, so spacing does not matter. */
    compact: string;
    /**
     * Glued forms in both word orders, so «Løk, rød» matches «rødløk»
     * (lists often put the descriptor after a comma).
     */
    compactForms: string[];
};

export function nameSignature(name: string): NameSignature | null {
    const tokens = tokenizeName(name);
    if (tokens.length === 0) return null;
    const compact = stemToken(tokens.join(""));
    const reversed = stemToken([...tokens].reverse().join(""));
    return {
        tokenKey: tokens.map(stemToken).sort().join(" "),
        compact,
        compactForms: reversed === compact ? [compact] : [compact, reversed],
    };
}

/**
 * Optimal string alignment distance (Levenshtein + adjacent transpositions).
 * Keeps only three rows in memory and stops as soon as the distance is known
 * to exceed `max`, so long names cannot blow up time or memory.
 */
export function editDistance(a: string, b: string, max = Infinity): number {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const cols = b.length + 1;
    let prev2 = new Array<number>(cols).fill(0);
    let prev = Array.from({ length: cols }, (_, j) => j);
    let curr = new Array<number>(cols).fill(0);
    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        let rowMin = i;
        for (let j = 1; j < cols; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            let value = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                value = Math.min(value, prev2[j - 2]! + 1);
            }
            curr[j] = value;
            if (value < rowMin) rowMin = value;
        }
        if (rowMin > max) return max + 1;
        [prev2, prev, curr] = [prev, curr, prev2];
    }
    return prev[b.length]!;
}

function allowedTypos(length: number): number {
    if (length >= 8) return 2;
    if (length >= 5) return 1;
    return 0;
}

export function signaturesMatch(a: NameSignature, b: NameSignature): boolean {
    if (a.tokenKey === b.tokenKey) return true;
    if (a.compactForms.some((form) => b.compactForms.includes(form))) return true;
    const max = allowedTypos(Math.min(a.compact.length, b.compact.length));
    if (max === 0) return false;
    // Typos rarely hit the first letter; requiring it avoids «salt» ≈ «malt».
    if (a.compact[0] !== b.compact[0]) return false;
    // Letters added at the end usually make a different word, not a typo:
    // «kokosmel» / «kokosmelk», «hvetemel» / «hvetemelk».
    const [shorter, longer] =
        a.compact.length <= b.compact.length ? [a.compact, b.compact] : [b.compact, a.compact];
    if (longer.startsWith(shorter)) return false;
    return editDistance(a.compact, b.compact, max) <= max;
}

export function namesLookLikeDuplicates(a: string, b: string): boolean {
    const sa = nameSignature(a);
    const sb = nameSignature(b);
    return sa != null && sb != null && signaturesMatch(sa, sb);
}

/**
 * Groups items whose names look like duplicates. Each group is sorted with the
 * most used item first (the natural one to keep). Groups are sorted by the
 * name of that first item.
 */
export function findDuplicateGroups<T extends { name: string; usageCount: number }>(
    items: readonly T[],
): T[][] {
    const entries = items
        .map((item) => ({ item, signature: nameSignature(item.name) }))
        .filter((e): e is { item: T; signature: NameSignature } => e.signature != null);

    const parent = entries.map((_, i) => i);
    const find = (i: number): number => {
        while (parent[i] !== i) {
            parent[i] = parent[parent[i]!]!;
            i = parent[i]!;
        }
        return i;
    };

    for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
            if (signaturesMatch(entries[i]!.signature, entries[j]!.signature)) {
                const ri = find(i);
                const rj = find(j);
                if (ri !== rj) parent[rj] = ri;
            }
        }
    }

    const groups = new Map<number, T[]>();
    entries.forEach((entry, i) => {
        const root = find(i);
        const group = groups.get(root);
        if (group) group.push(entry.item);
        else groups.set(root, [entry.item]);
    });

    const byUsageThenName = (a: T, b: T) =>
        b.usageCount - a.usageCount || a.name.localeCompare(b.name, "nb");

    return Array.from(groups.values())
        .filter((group) => group.length > 1)
        .map((group) => [...group].sort(byUsageThenName))
        .sort((a, b) => a[0]!.name.localeCompare(b[0]!.name, "nb"));
}
