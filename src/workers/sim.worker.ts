/// <reference lib="webworker" />
import { batch } from '@/core/simulate';
import type { BatchRequest, BatchResult } from '@/core/types';

// ============================================================
// 批量对局 Worker —— simulate.batch 的薄包装
//
// 协议：
//   入站  BatchRequest
//   出站  { type: 'progress'; done: number; total: number }   每 500 场一次
//         { type: 'done'; result: BatchResult }
// ============================================================

const PROGRESS_INTERVAL = 500;

self.onmessage = (e: MessageEvent<BatchRequest>) => {
  const req = e.data;
  const report =
    req.count >= PROGRESS_INTERVAL
      ? (done: number, total: number) => {
          if (done % PROGRESS_INTERVAL === 0 || done === total) {
            (self as DedicatedWorkerGlobalScope).postMessage({
              type: 'progress',
              done,
              total,
            });
          }
        }
      : undefined;

  const result = batch(req, report);
  (self as DedicatedWorkerGlobalScope).postMessage({ type: 'done', result });
};
