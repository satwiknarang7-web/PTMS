import { BadRequestException } from '@nestjs/common';

/**
 * The image type, read from the file's own bytes rather than what the browser claims, so only real
 * JPEG, PNG, GIF and WebP images are stored (no SVG or HTML, which could run scripts when opened).
 */
export function detectImageType(data: Buffer): string {
  const starts = (...bytes: number[]) => bytes.every((byte, i) => data[i] === byte);
  if (data.length > 3 && starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (data.length > 8 && starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (data.length > 6 && (data.subarray(0, 6).toString('latin1') === 'GIF87a' || data.subarray(0, 6).toString('latin1') === 'GIF89a')) return 'image/gif';
  if (data.length > 12 && data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  throw new BadRequestException('Only JPEG, PNG, GIF and WebP images can be attached');
}
