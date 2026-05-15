/**
 * Utility for parsing and matching image sizes/aspect ratios.
 */

export interface Size {
  width: number;
  height: number;
}

/**
 * Parses a size string like "1024x1024" or "896x512" into { width, height }.
 */
export function parseSize(size: string): Size | null {
  const match = size.match(/(\d+)[x*](\d+)/);
  if (!match) return null;
  return {
    width: parseInt(match[1], 10),
    height: parseInt(match[2], 10),
  };
}

/**
 * Finds the closest aspect ratio from a supported list.
 * Supported ratios should be in "W:H" format (e.g., "16:9").
 */
export function getClosestAspectRatio(width: number, height: number, supportedRatios: string[]): string {
  if (supportedRatios.length === 0) return "1:1";
  
  const targetRatio = width / height;
  let bestMatch = supportedRatios[0];
  let minDiff = Infinity;

  for (const ratioStr of supportedRatios) {
    const parts = ratioStr.split(':');
    if (parts.length !== 2) continue;
    
    const w = parseInt(parts[0], 10);
    const h = parseInt(parts[1], 10);
    const ratio = w / h;
    const diff = Math.abs(targetRatio - ratio);

    if (diff < minDiff) {
      minDiff = diff;
      bestMatch = ratioStr;
    }
  }

  return bestMatch;
}

/**
 * Finds the closest size from a supported list based on aspect ratio first, then total pixels.
 * Supported sizes should be in "WxH" format with the given separator.
 */
export function getClosestSize(width: number, height: number, supportedSizes: string[], separator: string = 'x'): string {
  if (supportedSizes.length === 0) return `1024${separator}1024`;

  const targetRatio = width / height;
  let bestMatch = supportedSizes[0];
  let minRatioDiff = Infinity;

  // First pass: find all sizes with the minimal aspect ratio difference
  const candidates: { size: string, ratioDiff: number, pixelDiff: number }[] = [];

  for (const sizeStr of supportedSizes) {
    const parsed = parseSize(sizeStr);
    if (!parsed) continue;

    const ratio = parsed.width / parsed.height;
    const ratioDiff = Math.abs(targetRatio - ratio);
    const pixelDiff = Math.abs((width * height) - (parsed.width * parsed.height));

    candidates.push({ size: sizeStr, ratioDiff, pixelDiff });
  }

  // Sort by ratio diff primarily, then by pixel diff (to get closest resolution)
  candidates.sort((a, b) => {
    if (Math.abs(a.ratioDiff - b.ratioDiff) > 0.001) {
      return a.ratioDiff - b.ratioDiff;
    }
    return a.pixelDiff - b.pixelDiff;
  });

  return candidates[0]?.size || bestMatch;
}
