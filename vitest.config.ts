import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// Tests only look at this project's own files, not the build sessions' working copies in .claude/.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: { exclude: [...configDefaults.exclude, '.claude/**', 'pipeline/**'] },
  }),
)
