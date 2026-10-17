import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchWithTimeout } from "./timeout";

/**
 * The first bytes of a stored object, fetched with a Range request so large
 * files are never downloaded whole (item 41). Null if they can't be read.
 */
export async function readObjectHead(bucket: string, path: string, bytes = 64): Promise<Uint8Array | null> {
  const { data } = await createSupabaseAdminClient().storage.from(bucket).createSignedUrl(path, 60);
  if (!data) return null;
  try {
    const response = await fetchWithTimeout(10_000)(data.signedUrl, {
      headers: { Range: `bytes=0-${bytes - 1}` },
    });
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer()).slice(0, bytes);
  } catch {
    return null;
  }
}
