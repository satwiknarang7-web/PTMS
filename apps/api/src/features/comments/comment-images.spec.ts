import { BadRequestException } from '@nestjs/common';
import { detectImageType } from './comment-images';

describe('detectImageType', () => {
  it('recognises images by their bytes', () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg');
    expect(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(detectImageType(Buffer.from('GIF89a\0\0', 'latin1'))).toBe('image/gif');
    expect(detectImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'))).toBe('image/webp');
  });

  it('refuses anything else, whatever it claims to be', () => {
    expect(() => detectImageType(Buffer.from('<svg onload="alert(1)"></svg>'))).toThrow(BadRequestException);
    expect(() => detectImageType(Buffer.from('<html><script></script></html>'))).toThrow(BadRequestException);
    expect(() => detectImageType(Buffer.alloc(0))).toThrow(BadRequestException);
  });
});
