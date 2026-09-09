# Bundled skill sources

Edit source files under `minimax-h3/`, then run `npm run generate:skills` from
`mobile/`. Verify with `npm run verify:skills`.

`bundle-metadata.json` records the released paths, MIME types, timestamps and
per-file embedded newline style. These are explicit metadata, not local file
mtimes. Preserving newline styles keeps the existing content hashes stable
across Windows and Unix checkouts. New or removed source paths require an
explicit metadata update. Review generated content and manifest changes before
shipping; do not edit `generated/h3Skills.ts` directly.
