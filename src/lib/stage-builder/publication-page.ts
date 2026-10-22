import "server-only";
import { notFound, redirect } from "next/navigation";
import { AuthorizationDeniedError } from "../authorization/policy";
import { DraftError } from "./contracts";
import { publicationEnabled } from "./publication-activation";
export async function publicationPage<T>(read: () => Promise<T>): Promise<T> {
  if (!publicationEnabled()) notFound();
  try { return await read(); }
  catch (error) { if (error instanceof AuthorizationDeniedError) redirect("/no-access"); if (error instanceof DraftError) notFound(); throw error; }
}
