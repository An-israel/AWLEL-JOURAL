import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // `server-only` throws outside a React Server environment.
    alias: { "server-only": fileURLToPath(new URL("./tests/unit/server-only-stub.ts", import.meta.url)) },
  },
});
