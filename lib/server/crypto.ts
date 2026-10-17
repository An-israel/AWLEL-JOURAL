import "server-only";
import { createHmac } from "node:crypto";
import { serverEnv } from "@/lib/env.server";

/** Keyed hash so stored identifiers (sessions, IPs) can't be reversed. */
export function hashIdentifier(value: string): string {
  return createHmac("sha256", serverEnv().METRICS_SALT).update(value).digest("hex");
}
