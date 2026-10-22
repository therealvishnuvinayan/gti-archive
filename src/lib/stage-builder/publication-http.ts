import "server-only";
import { ensure } from "./contracts";
export function publicationQuery(request: Request, allowed: string[]) {
  const params = new URL(request.url).searchParams;
  ensure([...params.keys()].every(k => allowed.includes(k) && params.getAll(k).length === 1), "INVALID_QUERY");
  return params;
}
