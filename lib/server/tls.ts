import "server-only";
import { connect } from "node:tls";

/**
 * Days until the site's TLS certificate expires (item 62), or null when it
 * can't be checked (plain http, localhost, network error). Vercel renews
 * certificates by itself; this catches the case where renewal is blocked,
 * e.g. by a DNS change at the university.
 */
export function certificateDaysLeft(siteUrl: string, timeoutMs = 5_000): Promise<number | null> {
  const url = new URL(siteUrl);
  if (url.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(url.hostname))
    return Promise.resolve(null);
  return new Promise((resolve) => {
    const socket = connect(
      { host: url.hostname, port: Number(url.port || 443), servername: url.hostname, timeout: timeoutMs },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        resolve(
          cert?.valid_to ? Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000) : null,
        );
      },
    );
    socket.on("error", () => resolve(null));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(null);
    });
  });
}
