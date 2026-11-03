import { describe, expect, it } from 'vitest'
import {
  base64ToBytes,
  buildExport,
  bytesToBase64,
  exportFileName,
  parseExport,
  PROJECT_FORMAT,
  PROJECT_VERSION,
  sha256Hex,
  type ProjectData,
} from './projectFile'

const pdf = new TextEncoder().encode('%PDF-1.4 pretend plan bytes \u0000ÿ')

async function sample(): Promise<ProjectData> {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: 'Kitty Lane',
    savedAt: '2026-11-03T00:00:00.000Z',
    files: [{ fileId: 'f1', name: 'plans.pdf', size: pdf.length, sha256: await sha256Hex(pdf) }],
    sheets: [{ id: 'f1-p1', fileId: 'f1', fileName: 'plans.pdf', pageNumber: 1, widthPt: 2384, heightPt: 1684 }],
    labels: { 'f1-p1': { number: 'A011', title: 'Acoustic Barrier Details', edited: true } },
    scales: { 'f1-p1': { realMmPerPt: 35.2778, status: 'confirmed', source: 'calibrated', label: 'Calibrated' } },
    detections: {},
    items: [{ id: 'i1', name: 'Floor tiles', colour: '#e6194b', kind: 'area', trade: 'Tiling' }],
    takeoffs: [{ id: 't1', itemId: 'i1', sheetId: 'f1-p1', points: [{ x: 1, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 4 }], holes: [] }],
    selectedSheetId: 'f1-p1',
  }
}

describe('base64', () => {
  it('round-trips bytes, including big ones', () => {
    const big = new Uint8Array(200_000).map((_, i) => (i * 31) % 256)
    expect(base64ToBytes(bytesToBase64(big))).toEqual(big)
    expect(base64ToBytes(bytesToBase64(pdf))).toEqual(pdf)
  })
})

describe('project export and import', () => {
  it('round-trips the whole project including the PDF', async () => {
    const data = await sample()
    const text = buildExport(data, new Map([['f1', pdf]]))
    const back = await parseExport(text)
    expect(back.data).toEqual(data)
    expect(back.pdfs.get('f1')).toEqual(pdf)
  })

  it('refuses to export when a PDF is missing', async () => {
    await expect(sample().then((d) => buildExport(d, new Map()))).rejects.toThrow(/missing/)
  })

  it('rejects files that are not CycloMeasure projects', async () => {
    await expect(parseExport('not json')).rejects.toThrow(/isn’t a CycloMeasure project/)
    await expect(parseExport('{"hello":1}')).rejects.toThrow(/isn’t a CycloMeasure project/)
  })

  it('rejects projects from a newer version', async () => {
    const text = buildExport({ ...(await sample()), version: PROJECT_VERSION + 1 }, new Map([['f1', pdf]]))
    await expect(parseExport(text)).rejects.toThrow(/newer version/)
  })

  it('detects a damaged PDF', async () => {
    const obj = JSON.parse(buildExport(await sample(), new Map([['f1', pdf]])))
    obj.pdfs.f1 = bytesToBase64(new TextEncoder().encode('%PDF-1.4 something else'))
    await expect(parseExport(JSON.stringify(obj))).rejects.toThrow(/damaged/)
  })

  it('detects a missing PDF', async () => {
    const obj = JSON.parse(buildExport(await sample(), new Map([['f1', pdf]])))
    delete obj.pdfs.f1
    await expect(parseExport(JSON.stringify(obj))).rejects.toThrow(/missing/)
  })

  it('makes a safe file name', () => {
    expect(exportFileName('Kitty Lane: stage 1/2')).toBe('Kitty Lane stage 1 2.cyclomeasure.json')
    expect(exportFileName('   ')).toBe('project.cyclomeasure.json')
  })
})
