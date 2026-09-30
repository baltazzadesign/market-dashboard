/** Descriptive breadth balance, independent of the legacy signal score and Market Pulse. */
type BreadthInput = { up: number; down: number; flat: number; breadthSource: string };

export function breadthScoreDetails(row: BreadthInput | null | undefined) {
  if (!row || !["LIVE", "FALLBACK"].includes(row.breadthSource)) return null;
  const counts = [row.up, row.down, row.flat];
  if (!counts.every(value => Number.isFinite(value) && value >= 0)) return null;
  const total = row.up + row.down + row.flat;
  if (!Number.isFinite(total) || total <= 0) return null;
  const upPercent = row.up / total * 100;
  const downPercent = row.down / total * 100;
  // One denominator includes unchanged stocks. Do not count the same breadth
  // imbalance twice or clip its count and ratio contributions independently.
  const score = (row.up - row.down) / total * 100;
  return { score, total, upPercent, downPercent, held: row.breadthSource === "FALLBACK" };
}

export function calculateBreadthScore(row: BreadthInput | null | undefined): number | null {
  return breadthScoreDetails(row)?.score ?? null;
}
