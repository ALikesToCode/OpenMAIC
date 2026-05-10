import type { CodeLine } from '@/lib/types/slides';

const INITIAL_LINE_STAGGER_MS = 80;

export interface LineAnimationState {
  type: 'typing' | 'inserted' | 'replaced';
  timestamp: number;
}

export function createCodeLineAnimationStates({
  lines,
  previousLines,
  animate,
  isFirstRender,
}: {
  lines: CodeLine[];
  previousLines: CodeLine[];
  animate: boolean;
  isFirstRender: boolean;
}): Map<string, LineAnimationState> {
  const states = new Map<string, LineAnimationState>();

  if (!animate) {
    return states;
  }

  if (isFirstRender) {
    lines.forEach((line, index) => {
      states.set(line.id, { type: 'typing', timestamp: index * INITIAL_LINE_STAGGER_MS });
    });
    return states;
  }

  const previousLinesById = new Map(previousLines.map((line) => [line.id, line]));

  for (const line of lines) {
    const previousLine = previousLinesById.get(line.id);
    if (!previousLine) {
      states.set(line.id, { type: 'inserted', timestamp: 0 });
    } else if (previousLine.content !== line.content) {
      states.set(line.id, { type: 'replaced', timestamp: 0 });
    }
  }

  return states;
}

export function createCodeLineTypingDelays({
  lines,
  animStates,
  lineGapMs,
  getTypingDuration,
}: {
  lines: CodeLine[];
  animStates: ReadonlyMap<string, LineAnimationState>;
  lineGapMs: number;
  getTypingDuration: (content: string) => number;
}): Map<string, number> {
  const delays = new Map<string, number>();
  let cumulative = 0;

  for (const line of lines) {
    if (animStates.has(line.id)) {
      delays.set(line.id, cumulative);
      cumulative += getTypingDuration(line.content) + lineGapMs;
    }
  }

  return delays;
}
