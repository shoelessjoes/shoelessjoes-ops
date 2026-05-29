/** @jsxImportSource preact */
import { render } from "preact";

/**
 * POS smart-grid tile (see https://shopify.dev/docs/api/pos-ui-extensions/2025-01/targets/smart-grid/pos-home-tile-render).
 * `shopify` is provided by the POS runtime.
 */
export default async function () {
  render(<Extension />, document.body);
}

function Extension() {
  return (
    <s-tile
      heading="Dealernet Ops"
      subheading="Open embedded app for details"
      onClick={() => {
        globalThis.shopify?.action?.presentModal?.();
      }}
    />
  );
}
