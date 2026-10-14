import { cookies } from "next/headers";
import { NEW_SHARE_COOKIE } from "@/lib/board";

/** Forgets a new board pack link's token once the pack page has shown it. */
export async function DELETE() {
  (await cookies()).delete({ name: NEW_SHARE_COOKIE, path: "/pack" });
  return new Response(null, { status: 204 });
}
