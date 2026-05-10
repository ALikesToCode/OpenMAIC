import { describe, expect, it } from 'vitest';

import {
  createCodeLineAnimationStates,
  createCodeLineTypingDelays,
} from '@/components/slide-renderer/components/element/CodeElement/code-line-animation';
import type { CodeLine } from '@/lib/types/slides';

const lines: CodeLine[] = [
  { id: 'line-1', content: 'const value = 1;' },
  { id: 'line-2', content: 'return value;' },
  { id: 'line-3', content: '}' },
];

describe('code line animation state', () => {
  it('marks every first-render line for typing before rows mount', () => {
    const states = createCodeLineAnimationStates({
      lines,
      previousLines: [],
      animate: true,
      isFirstRender: true,
    });

    expect([...states.entries()]).toEqual([
      ['line-1', { type: 'typing', timestamp: 0 }],
      ['line-2', { type: 'typing', timestamp: 80 }],
      ['line-3', { type: 'typing', timestamp: 160 }],
    ]);
  });

  it('does not create animation state when animation is disabled', () => {
    const states = createCodeLineAnimationStates({
      lines,
      previousLines: [],
      animate: false,
      isFirstRender: true,
    });

    expect(states.size).toBe(0);
  });

  it('detects inserted and replaced lines after the first render', () => {
    const nextLines: CodeLine[] = [
      { id: 'line-1', content: 'const value = 2;' },
      { id: 'line-2', content: 'return value;' },
      { id: 'line-4', content: 'console.log(value);' },
    ];

    const states = createCodeLineAnimationStates({
      lines: nextLines,
      previousLines: lines,
      animate: true,
      isFirstRender: false,
    });

    expect([...states.entries()]).toEqual([
      ['line-1', { type: 'replaced', timestamp: 0 }],
      ['line-4', { type: 'inserted', timestamp: 0 }],
    ]);
  });

  it('stagger typing delays by accumulated line durations', () => {
    const states = createCodeLineAnimationStates({
      lines,
      previousLines: [],
      animate: true,
      isFirstRender: true,
    });

    const delays = createCodeLineTypingDelays({
      lines,
      animStates: states,
      lineGapMs: 120,
      getTypingDuration: (content) => content.length * 10,
    });

    expect([...delays.entries()]).toEqual([
      ['line-1', 0],
      ['line-2', 280],
      ['line-3', 530],
    ]);
  });
});
