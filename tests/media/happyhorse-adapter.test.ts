import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  pollHappyHorseTask,
  submitHappyHorseTask,
  testHappyHorseConnectivity,
} from '@/lib/media/adapters/happyhorse-adapter';
import type { VideoGenerationConfig } from '@/lib/media/types';

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

const config: VideoGenerationConfig = {
  providerId: 'happyhorse',
  apiKey: 'test-key',
};

describe('HappyHorse video adapter', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  test('submits an async DashScope video synthesis task', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        output: {
          task_status: 'PENDING',
          task_id: 'task-123',
        },
        request_id: 'request-123',
      }),
    });

    const taskId = await submitHappyHorseTask(config, {
      prompt: 'A cardboard city at night',
      aspectRatio: '16:9',
      duration: 5,
      resolution: '720p',
    });

    expect(taskId).toBe('task-123');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify({
          model: 'happyhorse-1.0-t2v',
          input: {
            prompt: 'A cardboard city at night',
          },
          parameters: {
            resolution: '720P',
            ratio: '16:9',
            duration: 5,
            watermark: false,
          },
        }),
      },
    );
  });

  test('returns a video result when polling succeeds', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        output: {
          task_id: 'task-123',
          task_status: 'SUCCEEDED',
          video_url: 'https://example.com/video.mp4',
        },
        usage: {
          duration: 5,
          SR: 720,
          ratio: '16:9',
        },
      }),
    });

    const result = await pollHappyHorseTask(config, 'task-123');

    expect(result).toEqual({
      url: 'https://example.com/video.mp4',
      duration: 5,
      width: 1280,
      height: 720,
    });
  });

  test('throws provider error details when polling fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        output: {
          task_id: 'task-123',
          task_status: 'FAILED',
          code: 'InvalidParameter',
          message: 'The parameter is invalid.',
        },
      }),
    });

    await expect(pollHappyHorseTask(config, 'task-123')).rejects.toThrow(
      'HappyHorse video generation failed: InvalidParameter: The parameter is invalid.',
    );
  });

  test('checks connectivity with the DashScope task list endpoint', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        request_id: 'request-123',
        data: [],
      }),
    });

    const result = await testHappyHorseConnectivity(config);

    expect(result).toEqual({ success: true, message: 'Connected to HappyHorse' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://dashscope.aliyuncs.com/api/v1/tasks/?page_size=1',
      {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-key',
        },
      },
    );
  });

  test('reports non-ok connectivity responses as failures', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'upstream unavailable',
    });

    const result = await testHappyHorseConnectivity(config);

    expect(result).toEqual({
      success: false,
      message: 'HappyHorse connectivity failed (500): upstream unavailable',
    });
  });

  test('keeps auth failures distinct from other connectivity failures', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'invalid api key',
    });

    const result = await testHappyHorseConnectivity(config);

    expect(result).toEqual({
      success: false,
      message: 'HappyHorse auth failed (403): invalid api key',
    });
  });
});
