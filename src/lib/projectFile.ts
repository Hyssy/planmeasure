/**
 * The saved form of a project: what goes into browser storage, and (with the
 * PDFs added) into an exported .json project file.
 */
import type { SheetMeta } from './pdf'
import type { Item, Takeoff } from './takeoff'

export const PROJECT_FORMAT = 'planmeasure-project'
export const PROJECT_VERSION = 1

/** A PDF in the project (its bytes are stored separately). */
export interface ProjectFileMeta {
  fileId: string
  name: string
  size: number
  /** SHA-256 of the PDF's bytes, hex — checks an imported PDF is intact */
  sha256: string
}

/**
 * Everything about a project except the PDF bytes. The shapes of labels,
 * scales and detections are owned by the app store; here they're plain data.
 */
export interface ProjectData {
  format: typeof PROJECT_FORMAT
  version: number
  name: string
  savedAt: string
  files: ProjectFileMeta[]
  sheets: SheetMeta[]
  labels: Record<string, unknown>
  scales: Record<string, unknown>
  detections: Record<string, unknown>
  items: Item[]
  takeoffs: Takeoff[]
  selectedSheetId: string | null
}

/** An exported project file: the project data plus every PDF, base64-encoded. */
export interface ExportedProject extends ProjectData {
  pdfs: Record<string, string>
}

// ---------------------------------------------------------------------------
// Bytes <-> base64, in chunks so big plan sets don't overflow the call stack
// ---------------------------------------------------------------------------

export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  const parts: string[] = []
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)))
  }
  return btoa(parts.join(''))
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

/** Build the exported file's text. `pdfBytes` gives each file's bytes by fileId. */
export function buildExport(data: ProjectData, pdfBytes: Map<string, Uint8Array>): string {
  const pdfs: Record<string, string> = {}
  for (const f of data.files) {
    const bytes = pdfBytes.get(f.fileId)
    if (!bytes) throw new Error(`The PDF “${f.name}” is missing from this project`)
    pdfs[f.fileId] = bytesToBase64(bytes)
  }
  const out: ExportedProject = { ...data, pdfs }
  return JSON.stringify(out)
}

export class ProjectFileError extends Error {}

/**
 * Read an exported project file. Checks it's a PlanMeasure project, that every
 * PDF is included, and that each PDF is byte-for-byte what was exported.
 */
export async function parseExport(text: string): Promise<{ data: ProjectData; pdfs: Map<string, Uint8Array> }> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ProjectFileError('This file isn’t a PlanMeasure project (it isn’t valid JSON).')
  }
  const p = raw as Partial<ExportedProject>
  if (!p || p.format !== PROJECT_FORMAT) throw new ProjectFileError('This file isn’t a PlanMeasure project.')
  if (typeof p.version !== 'number' || p.version > PROJECT_VERSION) {
    throw new ProjectFileError('This project was saved by a newer version of PlanMeasure. Update the app and try again.')
  }
  if (!Array.isArray(p.files) || !Array.isArray(p.sheets) || !Array.isArray(p.items) || !Array.isArray(p.takeoffs)) {
    throw new ProjectFileError('This project file is incomplete or damaged.')
  }
  const pdfs = new Map<string, Uint8Array>()
  for (const f of p.files) {
    const b64 = p.pdfs?.[f.fileId]
    if (!b64) throw new ProjectFileError(`The PDF “${f.name}” is missing from this project file.`)
    const bytes = base64ToBytes(b64)
    if ((await sha256Hex(bytes)) !== f.sha256) {
      throw new ProjectFileError(`The PDF “${f.name}” in this project file is damaged.`)
    }
    pdfs.set(f.fileId, bytes)
  }
  const { pdfs: _omit, ...data } = p as ExportedProject
  void _omit
  return { data: data as ProjectData, pdfs }
}

/** A safe file name for the export: "Kitty Lane takeoff.planmeasure.json" */
export function exportFileName(projectName: string): string {
  const safe = projectName.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'project'
  return `${safe}.planmeasure.json`
}
