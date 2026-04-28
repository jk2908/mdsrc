# Changelog

## 0.1.4 - 2026-04-27

- Fixed generated `.mdsrc/index.d.ts` to export collection symbols directly, so root `.mdsrc` imports like `import { allPosts } from '../../.mdsrc'` typecheck correctly.
- Fixed `@jk2908/mdsrc` runtime imports in Vite apps by resolving the package name to generated collection data instead of the plugin package entry.
- Switched generated collection module filenames to lowercase while keeping the exported symbol names unchanged.