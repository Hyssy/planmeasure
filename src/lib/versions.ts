/**
 * Sheet versions: when a plan set is added to a project that already has the
 * same drawings, the new sheets can be marked as new versions of the old ones.
 *
 * Stored as `supersedes[newSheetId] = oldSheetId`. A sheet nothing supersedes
 * is "current". Versions chain: v1 ← v2 ← v3.
 */

export type Supersedes = Record<string, string>

export interface VersionMatch {
  newId: string
  oldId: string
}

/** Sheet numbers compare ignoring case and spaces ("A 101" = "a101"). Dashes and dots count. */
export function normaliseNumber(n: string | undefined): string {
  return (n ?? '').toUpperCase().replace(/\s+/g, '')
}

/**
 * Which added sheets are new versions of existing ones: same sheet number,
 * and that number appears exactly once on each side (so it can't be wrong).
 */
export function findVersionMatches(existing: { id: string; number?: string }[], added: { id: string; number?: string }[]): VersionMatch[] {
  const count = (list: { number?: string }[]) => {
    const m = new Map<string, number>()
    for (const s of list) {
      const k = normaliseNumber(s.number)
      if (k) m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }
  const ce = count(existing)
  const ca = count(added)
  const out: VersionMatch[] = []
  for (const a of added) {
    const k = normaliseNumber(a.number)
    if (!k || ca.get(k) !== 1 || ce.get(k) !== 1) continue
    const old = existing.find((e) => normaliseNumber(e.number) === k)!
    if (old.id !== a.id) out.push({ newId: a.id, oldId: old.id })
  }
  return out
}

/** newer[oldId] = the sheet that supersedes it. */
export function newerOf(supersedes: Supersedes): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [n, o] of Object.entries(supersedes)) out[o] = n
  return out
}

/** The version number of a sheet: 1 for an original, 2 for the first new version, … */
export function versionNumber(id: string, supersedes: Supersedes): number {
  let v = 1
  let cur = id
  const seen = new Set<string>()
  while (supersedes[cur] && !seen.has(cur)) {
    seen.add(cur)
    cur = supersedes[cur]
    v++
  }
  return v
}

/** The latest version in the chain this sheet belongs to. */
export function latestVersion(id: string, supersedes: Supersedes, newer = newerOf(supersedes)): string {
  let cur = id
  const seen = new Set<string>()
  while (newer[cur] && !seen.has(cur)) {
    seen.add(cur)
    cur = newer[cur]
  }
  return cur
}

/** True if a newer version of this sheet exists. */
export function isSuperseded(id: string, supersedes: Supersedes): boolean {
  return Object.values(supersedes).includes(id)
}

export interface SheetGroup {
  /** the current (latest) version */
  current: string
  /** earlier versions, newest first */
  older: string[]
}

/**
 * How the sheet list shows sheets: each drawing once, at the position of its
 * first version, showing the latest version with the earlier ones under it.
 */
export function sheetGroups(order: string[], supersedes: Supersedes): SheetGroup[] {
  const newer = newerOf(supersedes)
  const groups: SheetGroup[] = []
  for (const id of order) {
    if (supersedes[id]) continue // a newer version: shown at its first version's place
    const chain = [id]
    let cur = id
    while (newer[cur] && !chain.includes(newer[cur])) {
      cur = newer[cur]
      chain.push(cur)
    }
    groups.push({ current: chain[chain.length - 1], older: chain.slice(0, -1).reverse() })
  }
  return groups
}

/** Drop links to sheets that no longer exist. */
export function cleanSupersedes(supersedes: Supersedes, sheetIds: Set<string>): Supersedes {
  const out: Supersedes = {}
  for (const [n, o] of Object.entries(supersedes)) if (sheetIds.has(n) && sheetIds.has(o) && n !== o) out[n] = o
  return out
}
