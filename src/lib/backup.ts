// Whole-DB JSON export/import. Photos and comparison previews are Blobs;
// they're encoded as base64 with their MIME type so the file is fully
// self-contained and round-trips cleanly.

import { db } from '../db/schema';

const FORMAT_APP = 'gainey-glow';
const FORMAT_VERSION = 1;

const TABLES = [
  'photos',
  'products',
  'treatments',
  'sensitivities',
  'profile',
  'routineLogs',
  'checkins',
  'comparisons',
  'skinRatings',
  'insights',
  'skinAssessments',
] as const;

type TableName = (typeof TABLES)[number];

interface BlobMarker {
  __blob: true;
  type: string;
  base64: string;
}

interface BackupFile {
  app: typeof FORMAT_APP;
  version: typeof FORMAT_VERSION;
  schemaVersion: number;
  exportedAt: string;
  data: Record<TableName, unknown[]>;
}

export interface ExportSummary {
  bytes: number;
  counts: Record<TableName, number>;
}

export interface ImportSummary {
  counts: Record<TableName, number>;
}

export async function exportAll(): Promise<{ blob: Blob; summary: ExportSummary }> {
  const data = {} as Record<TableName, unknown[]>;
  const counts = {} as Record<TableName, number>;
  for (const name of TABLES) {
    const rows = await db.table(name).toArray();
    const encoded: unknown[] = [];
    for (const row of rows) encoded.push(await encodeRow(row));
    data[name] = encoded;
    counts[name] = rows.length;
  }
  const file: BackupFile = {
    app: FORMAT_APP,
    version: FORMAT_VERSION,
    schemaVersion: db.verno,
    exportedAt: new Date().toISOString(),
    data,
  };
  const json = JSON.stringify(file);
  const blob = new Blob([json], { type: 'application/json' });
  return { blob, summary: { bytes: blob.size, counts } };
}

export async function importAll(file: File): Promise<ImportSummary> {
  const text = await file.text();
  const parsed = JSON.parse(text) as Partial<BackupFile>;
  if (parsed.app !== FORMAT_APP) {
    throw new Error('This file is not a GaineyGlow backup.');
  }
  if (typeof parsed.version !== 'number' || parsed.version > FORMAT_VERSION) {
    throw new Error(`Unsupported backup version: ${String(parsed.version)}.`);
  }
  if (!parsed.data || typeof parsed.data !== 'object') {
    throw new Error('Backup file is missing data.');
  }

  const decoded = {} as Record<TableName, unknown[]>;
  for (const name of TABLES) {
    const rows = (parsed.data as Record<string, unknown[]>)[name] ?? [];
    decoded[name] = rows.map(decodeRow);
  }

  const counts = {} as Record<TableName, number>;
  await db.transaction('rw', TABLES.map((n) => db.table(n)), async () => {
    for (const name of TABLES) {
      await db.table(name).clear();
      const rows = decoded[name];
      if (rows.length) await db.table(name).bulkPut(rows);
      counts[name] = rows.length;
    }
  });
  return { counts };
}

function isBlobMarker(v: unknown): v is BlobMarker {
  return (
    !!v &&
    typeof v === 'object' &&
    (v as { __blob?: unknown }).__blob === true &&
    typeof (v as BlobMarker).base64 === 'string'
  );
}

async function encodeRow(row: unknown): Promise<unknown> {
  if (row instanceof Blob) return await blobToMarker(row);
  if (Array.isArray(row)) {
    const out: unknown[] = [];
    for (const v of row) out.push(await encodeRow(v));
    return out;
  }
  if (row && typeof row === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      out[k] = await encodeRow(v);
    }
    return out;
  }
  return row;
}

function decodeRow(row: unknown): unknown {
  if (isBlobMarker(row)) return markerToBlob(row);
  if (Array.isArray(row)) return row.map(decodeRow);
  if (row && typeof row === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      out[k] = decodeRow(v);
    }
    return out;
  }
  return row;
}

async function blobToMarker(blob: Blob): Promise<BlobMarker> {
  const buf = await blob.arrayBuffer();
  return {
    __blob: true,
    type: blob.type || 'application/octet-stream',
    base64: arrayBufferToBase64(buf),
  };
}

function markerToBlob(m: BlobMarker): Blob {
  const bytes = base64ToBytes(m.base64);
  // Pass the underlying ArrayBuffer directly; some lib.dom typings reject
  // Uint8Array<ArrayBufferLike> as a BlobPart.
  return new Blob([bytes.buffer as ArrayBuffer], {
    type: m.type || 'application/octet-stream',
  });
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function suggestedFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `gainey-glow-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(
    d.getDate(),
  )}.json`;
}
