# Dealernet Ops POS tile

Smart-grid tile target: `pos.home.tile.render`.

After `npm install` at the repo root, validate/build this extension with Shopify CLI from `apps/web`:

```bash
shopify app build
```

If the POS runtime globals differ by API version, adjust `shopify.extension.toml` `api_version` to match your CLI template.
