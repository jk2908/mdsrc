# Changelog

## 0.3.0 - 2026-05-21

- Breaking: moved markdown customization under the `markdown` key, replacing the old root-level `plugins` option with `markdown.plugins`.
- Replaced the HTML renderer dependency with `markdown-it-ts` and added `markdown.config` support for renderer options.
- Re-exported `MarkdownItConfig` from `@jk2908/mdsrc` so consumers can type markdown renderer config without importing from `markdown-it-ts` directly.
- Updated the README examples to document the nested markdown config and the default renderer options merge.

## 0.2.0 - 2026-05-07

- Breaking: replaced the generated `body` field with `html` and `markdown` on every entry.
- Added markdown rendering through `markdown-it`, with hard line breaks preserved and raw HTML escaped by default.
- Added root-level `plugins` support for shared markdown-it plugins across every collection.
- Moved the publishable package into `packages/mdsrc` and updated the examples to consume `@jk2908/mdsrc` like a normal installed package.
- Fixed generated `.mdsrc` declarations so consumers pick up the `html` and `markdown` fields correctly.

## 0.1.4 - 2026-04-27

- Fixed generated `.mdsrc/index.d.ts` to export collection symbols directly, so root `.mdsrc` imports like `import { allPosts } from '../../.mdsrc'` typecheck correctly.
- Fixed `@jk2908/mdsrc` runtime imports in Vite apps by resolving the package name to generated collection data instead of the plugin package entry.
- Switched generated collection module filenames to lowercase while keeping the exported symbol names unchanged.