import { describe, expect, it } from 'vitest';
import { parseNavyASRResponse } from '@/lib/audio/asr-providers';

describe('parseNavyASRResponse', () => {
  it('extracts text from the standard JSON transcription shape', () => {
    expect(parseNavyASRResponse({ text: 'hello from navy' })).toEqual({
      text: 'hello from navy',
    });
  });

  it('falls back to plain-text responses', () => {
    expect(parseNavyASRResponse('hello from plain text')).toEqual({
      text: 'hello from plain text',
    });
  });

  it('supports OpenAI-style nested content arrays', () => {
    expect(
      parseNavyASRResponse({
        output: {
          choices: [
            {
              message: {
                content: [{ text: 'nested transcription' }],
              },
            },
          ],
        },
      }),
    ).toEqual({
      text: 'nested transcription',
    });
  });
});
