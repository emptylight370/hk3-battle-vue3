// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'

import type { BatchResult } from '@/core/types'
import BatchPanel from '@/components/BatchPanel.vue'

vi.mock('@/workers/batchClient', () => ({
  runBatch: vi.fn(),
}))

import { runBatch } from '@/workers/batchClient'
const mockRunBatch = vi.mocked(runBatch)

const RESULT: BatchResult = { p1: 'a', p2: 'b', p1Win: 1, p2Win: 0, draw: 0 }

// Element Plus 组件在测试中不必真实渲染，用 stub 占位即可；
// 关键是验证：点击运行 → lastSeed 写入 → "使用种子" 文案出现
const globalStubs = {
  stubs: {
    'el-card': { template: '<div><slot name="header" /><slot /></div>' },
    'el-form': { template: '<form><slot /></form>' },
    'el-form-item': { template: '<div><slot /></div>' },
    'el-select': { template: '<select />', props: ['modelValue'] },
    'el-option': { template: '<option />' },
    'el-input-number': {
      template: '<input />',
      props: ['modelValue', 'disabled'],
    },
    'el-switch': { template: '<input type="checkbox" />', props: ['modelValue'] },
    'el-button': {
      template: '<button @click="$emit(\'click\')"><slot /></button>',
      emits: ['click'],
    },
    'el-progress': { template: '<div />' },
    'el-divider': { template: '<div />' },
  },
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('BatchPanel — 种子展示', () => {
  it('手动模式运行后显示"使用种子 N"', async () => {
    mockRunBatch.mockResolvedValue(RESULT)
    const w = mount(BatchPanel, { global: globalStubs })

    // 运行前不显示
    expect(w.text()).not.toContain('使用种子')

    // 点击"开始批量对局"按钮（最后一个 el-button）
    const buttons = w.findAll('button')
    await buttons[buttons.length - 1]!.trigger('click')
    await flushPromises()

    expect(w.text()).toContain('使用种子 42')
  })

  it('随机模式：先开随机再运行，文案与请求种子一致', async () => {
    mockRunBatch.mockResolvedValue(RESULT)
    const w = mount(BatchPanel, { global: globalStubs })

    // 第一个种子行按钮 = 随机开关（随机文案）
    const randomBtn = w.findAll('button').find((b) => b.text().includes('随机'))!
    await randomBtn.trigger('click')

    const runBtn = w.findAll('button').at(-1)!
    await runBtn.trigger('click')
    await flushPromises()

    const used = mockRunBatch.mock.calls[0]![0].seed
    expect(used).toBeGreaterThanOrEqual(0)
    expect(w.text()).toContain(`使用种子 ${used}`)
  })
})
