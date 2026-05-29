import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

export const loader = async (_args: LoaderFunctionArgs) => {
  return redirect("/app");
};

export default function Index() {
  return null;
}
