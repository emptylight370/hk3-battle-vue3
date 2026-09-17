import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { listCharacters } from '@/core/registry'
import type { BatchResult } from '@/core/types'
import { useBattleStore } from '@/stores/battle'

// Worker 客户端 mock：Node 环境无 Worker 运行时；store 逻辑与协议解耦测试
vi.mock('@/workers/batchClient', () => ({
  runBatch: vi.fn(),
}))

import { runBatch } from '@/workers/batchClient'
const mockRunBatch = vi.mocked(runBatch)

const RESULT: BatchResult = { p1: 'bronya', p2: 'kelali', p1Win: 600, p2Win: 350, draw: 50 }

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('battle store — 默认状态', () => {
  it('表单默认值来自注册表前两个角色，logFirst 开启', () => {
    const s = useBattleStore()
    const ids = listCharacters().map((c) => c.id)
    expect(ids.length).toBeGreaterThanOrEqual(2)
    expect(s.p1Id).toBe(ids[0])
    expect(s.p2Id).toBe(ids[1])
    expect(s.logFirst).toBe(true)
    expect(s.running).toBe(false)
    expect(s.result).toBeNull()
  })
})

describe('battle store — run() 状态机', () => {
  it('成功：转发请求（含 logFirst）、进度更新、结果与 running 复位', async () => {
    const s = useBattleStore()
    let capturedProgress: ((done: number, total: number) => void) | undefined
    mockRunBatch.mockImplementation(async (_req, onProgress) => {
      capturedProgress = onProgress
      onProgress?.(500, 1000)
      return RESULT
    })

    await s.run()

    expect(mockRunBatch).toHaveBeenCalledOnce()
    expect(mockRunBatch.mock.calls[0]![0]).toMatchObject({
      p1: s.p1Id,
      p2: s.p2Id,
      count: 1000,
      seed: 42,
      logFirst: true,
    })
    expect(capturedProgress).toBeDefined()
    expect(s.progress).toEqual({ done: 500, total: 1000 })
    expect(s.progressPercent).toBe(50)
    expect(s.result).toEqual(RESULT)
    expect(s.running).toBe(false)
    expect(s.error).toBeNull()
  })

  it('胜率派生：三向百分比，总数守恒校验', async () => {
    const s = useBattleStore()
    mockRunBatch.mockResolvedValue(RESULT)
    await s.run()
    expect(s.winRates).toEqual({ p1: 60, p2: 35, draw: 5 })
  })

  it('失败：error 记录消息，running 复位，result 保持 null', async () => {
    const s = useBattleStore()
    mockRunBatch.mockRejectedValue(new Error('worker 崩溃'))
    await s.run()
    expect(s.error).toBe('worker 崩溃')
    expect(s.running).toBe(false)
    expect(s.result).toBeNull()
  })

  it('进行中重复触发被守卫拒绝', async () => {
    const s = useBattleStore()
    let release!: (r: BatchResult) => void
    mockRunBatch.mockImplementation(
      () => new Promise<BatchResult>((res) => (release = res)),
    )

    const first = s.run()
    expect(s.running).toBe(true)
    await s.run() // 第二次调用应被守卫吞掉
    release(RESULT)
    await first

    expect(mockRunBatch).toHaveBeenCalledOnce()
    expect(s.result).toEqual(RESULT)
  })
})
