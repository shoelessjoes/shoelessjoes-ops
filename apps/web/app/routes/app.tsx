import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await prisma.shop.upsert({
    where: { shopifyDomain: session.shop },
    create: { shopifyDomain: session.shop, accessToken: session.accessToken },
    update: { accessToken: session.accessToken },
  });
  return json({ shop: session.shop });
};

export default function AppLayout() {
  const { shop } = useLoaderData<typeof loader>();
  return (
    <div>
      <header style={{ marginBottom: "1rem" }}>
        <strong>Dealernet Ops</strong>
        <span style={{ marginLeft: "1rem", color: "#666" }}>{shop}</span>
        <nav style={{ marginTop: "0.5rem", display: "flex", gap: "1rem" }}>
          <Link to="/app">Home</Link>
          <Link to="/app/sync">Sync runs</Link>
          <Link to="/app/mapping">Mapping queue</Link>
          <Link to="/app/alerts">Price alerts</Link>
          <Link to="/app/pricing">Pricing</Link>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
