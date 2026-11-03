/**
 * Local project storage in the browser (IndexedDB, via Dexie).
 * Nothing here leaves the computer.
 */
import Dexie, { type Table } from 'dexie'
import type { ProjectData } from './projectFile'

export interface ProjectRecord {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  sheetCount: number
}

interface ProjectDataRow {
  projectId: string
  data: ProjectData
}

interface PdfRow {
  /** `${projectId}|${fileId}` */
  key: string
  projectId: string
  fileId: string
  blob: Blob
}

class PlanMeasureDb extends Dexie {
  projects!: Table<ProjectRecord, string>
  projectData!: Table<ProjectDataRow, string>
  pdfs!: Table<PdfRow, string>

  constructor() {
    super('planmeasure')
    this.version(1).stores({
      projects: 'id, updatedAt',
      projectData: 'projectId',
      pdfs: 'key, projectId',
    })
  }
}

const db = new PlanMeasureDb()

export function newProjectId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** All saved projects, most recently changed first. */
export function listProjects(): Promise<ProjectRecord[]> {
  return db.projects.orderBy('updatedAt').reverse().toArray()
}

export async function createProject(id: string, name: string): Promise<ProjectRecord> {
  const now = new Date().toISOString()
  const record: ProjectRecord = { id, name, createdAt: now, updatedAt: now, sheetCount: 0 }
  await db.projects.put(record)
  return record
}

export async function savePdf(projectId: string, fileId: string, blob: Blob): Promise<void> {
  await db.pdfs.put({ key: `${projectId}|${fileId}`, projectId, fileId, blob })
}

/** Save a project's data (everything except the PDFs, which are saved as they're opened). */
export async function saveProjectData(projectId: string, data: ProjectData): Promise<void> {
  await db.transaction('rw', db.projects, db.projectData, async () => {
    const existing = await db.projects.get(projectId)
    await db.projectData.put({ projectId, data })
    await db.projects.put({
      id: projectId,
      name: data.name,
      createdAt: existing?.createdAt ?? data.savedAt,
      updatedAt: data.savedAt,
      sheetCount: data.sheets.length,
    })
  })
}

export async function loadProjectData(projectId: string): Promise<ProjectData | undefined> {
  return (await db.projectData.get(projectId))?.data
}

/** The project's PDFs, by fileId. */
export async function loadPdfs(projectId: string): Promise<Map<string, Uint8Array>> {
  const rows = await db.pdfs.where('projectId').equals(projectId).toArray()
  const out = new Map<string, Uint8Array>()
  for (const r of rows) out.set(r.fileId, new Uint8Array(await r.blob.arrayBuffer()))
  return out
}

export async function deleteProject(projectId: string): Promise<void> {
  await db.transaction('rw', db.projects, db.projectData, db.pdfs, async () => {
    await db.projects.delete(projectId)
    await db.projectData.delete(projectId)
    await db.pdfs.where('projectId').equals(projectId).delete()
  })
}

/** Ask the browser not to clear our storage when space runs low (best effort). */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch {
    // not supported — storage still works, it just isn't guaranteed
  }
}
