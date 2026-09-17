import type { BatchRequest, BatchResult } from '@/core/types';

// ============================================================
// 批量对局客户端 —— M3 UI 调用入口（不直接 import simulate，
// 保证引擎跑在 Worker 线程，UI 不卡顿）
// ============================================================

type WorkerResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; result: BatchResult };

/** 在 Worker 线程批量对局；onProgress 收到每 500 场的进度上报 */
export function runBatch(
  req: BatchRequest,
  onProgress?: (done: number, total: number) => void,
): Promise<BatchResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.type === 'progress') {
        onProgress?.(e.data.done, e.data.total);
        return;
      }
      worker.terminate();
      resolve(e.data.result);
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    worker.postMessage(req);
  });
}
