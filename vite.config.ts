import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    // Element Plus 按需加载：
    // - AutoImport：ElMessage / ElMessageBox 等函数式 API 自动导入（含样式）
    // - Components：模板中 <el-*> 组件自动注册（含样式），无需全量引入
    // - dts 放在 src/ 下，被 tsconfig.app.json 的 include 覆盖，vue-tsc 可索引
    AutoImport({
      resolvers: [ElementPlusResolver()],
      dts: 'src/auto-imports.d.ts',
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: 'src/components.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // 组件测试挂载 el-* 时，unplugin 会注入 element-plus 的样式导入；
    // element-plus 默认被 externalize 由 Node 原生加载，.css 直接报错——
    // 内联进 vitest 管线后样式导入被 stub。
    server: { deps: { inline: [/element-plus/] } },
  },
})
