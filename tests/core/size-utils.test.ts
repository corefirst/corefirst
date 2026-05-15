import { describe, it, expect } from 'vitest';
import { parseSize, getClosestAspectRatio, getClosestSize } from '@/src/core/visuals/size-utils';

describe('size-utils', () => {
  describe('parseSize', () => {
    it('parses WxH strings', () => {
      expect(parseSize('1024x768')).toEqual({ width: 1024, height: 768 });
      expect(parseSize('896*512')).toEqual({ width: 896, height: 512 });
    });

    it('returns null for invalid strings', () => {
      expect(parseSize('invalid')).toBeNull();
      expect(parseSize('1024')).toBeNull();
    });
  });

  describe('getClosestAspectRatio', () => {
    const supported = ['1:1', '16:9', '4:3', '3:4', '9:16'];

    it('matches exact ratios', () => {
      expect(getClosestAspectRatio(1024, 1024, supported)).toBe('1:1');
      expect(getClosestAspectRatio(1920, 1080, supported)).toBe('16:9');
    });

    it('matches closest ratios (e.g., 896x512 is ~1.75, 16:9 is ~1.77)', () => {
      expect(getClosestAspectRatio(896, 512, supported)).toBe('16:9');
      expect(getClosestAspectRatio(1024, 768, supported)).toBe('4:3');
    });
  });

  describe('getClosestSize', () => {
    const supported = ['1024x1024', '1280x720', '720x1280'];

    it('matches exact sizes', () => {
      expect(getClosestSize(1024, 1024, supported)).toBe('1024x1024');
    });

    it('matches closest aspect ratio', () => {
      expect(getClosestSize(896, 512, supported)).toBe('1280x720');
      expect(getClosestSize(512, 896, supported)).toBe('720x1280');
    });

    it('matches closest resolution when ratios are same', () => {
        const multiple = ['512x512', '1024x1024', '2048x2048'];
        expect(getClosestSize(950, 950, multiple)).toBe('1024x1024');
        expect(getClosestSize(400, 400, multiple)).toBe('512x512');
    });
  });
});
