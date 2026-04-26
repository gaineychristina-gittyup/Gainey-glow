// Read the best-available capture date from a photo File.
//
// Priority:
//   1. EXIF DateTimeOriginal / CreateDate / ModifyDate (in that order)
//   2. file.lastModified (often reflects original capture time when copied)
//   3. today's date
//
// Always returns YYYY-MM-DD in the user's local timezone.

import exifr from 'exifr';
import { todayISO } from './date';

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type DateSource = 'exif' | 'fileModified' | 'today';

export async function readPhotoDate(file: File): Promise<{ date: string; takenAt: number; source: DateSource }> {
  try {
    const exif = await exifr.parse(file, {
      pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'],
    });
    const candidate = exif?.DateTimeOriginal ?? exif?.CreateDate ?? exif?.ModifyDate;
    if (candidate instanceof Date && !isNaN(candidate.getTime())) {
      return {
        date: toLocalISODate(candidate),
        takenAt: candidate.getTime(),
        source: 'exif',
      };
    }
  } catch {
    // exifr can throw on non-image / corrupt files — fall through.
  }

  if (file.lastModified) {
    const d = new Date(file.lastModified);
    if (!isNaN(d.getTime())) {
      return {
        date: toLocalISODate(d),
        takenAt: file.lastModified,
        source: 'fileModified',
      };
    }
  }

  return { date: todayISO(), takenAt: Date.now(), source: 'today' };
}
