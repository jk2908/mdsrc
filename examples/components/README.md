# components example

Vite + React consumer that applies `@comark/markdown-it` through mdsrc and renders the result with `@comark/react`.

## run

```sh
cd ../..
bun install

cd examples/components
bun install
bun run dev
```

This example links the local package with `link:../..`, applies the shared Comark plugin through mdsrc, and renders the resulting content through `@comark/react`.