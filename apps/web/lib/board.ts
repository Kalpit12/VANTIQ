import type { PackData } from "./pack";

/**
 * The board-ready subset of a review pack (design.md 14): the same approved
 * numbers and explanations, without the working detail a board doesn't need.
 * Only the top two levels of the income statement, no cited transactions and
 * no internal comments.
 */
export function boardPack(data: PackData): PackData {
  return {
    ...data,
    lines: data.lines.filter((l) => l.depth <= 1),
    material: data.material.map((m) => ({ ...m, cited: [], comments: [] })),
  };
}

/** File name for a downloaded pack, e.g. `Helixa-Therapeutics-board-pack-2026-09.pdf`. */
export const packFileName = (data: Pick<PackData, "companyName" | "period">, kind: "review" | "board") =>
  `${data.companyName.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "")}-${kind}-pack-${data.period}.pdf`;

/**
 * Holds a new link's token for a minute so the pack page can show it once.
 * A cookie rather than the URL, so the token never lands in history or logs.
 */
export const NEW_SHARE_COOKIE = "vantiq_new_share";
