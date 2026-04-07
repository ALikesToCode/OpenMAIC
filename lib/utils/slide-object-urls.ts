import type { Slide } from '@/lib/types/slides';

export function revokeSlideObjectUrls(slides: Record<string, Slide>) {
  for (const slide of Object.values(slides)) {
    for (const element of slide.elements) {
      if (
        'src' in element &&
        typeof element.src === 'string' &&
        element.src.startsWith('blob:')
      ) {
        URL.revokeObjectURL(element.src);
      }
    }
  }
}
