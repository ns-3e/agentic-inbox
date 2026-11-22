import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Unit tests for pure logic only; kept apart from the Cloudflare/React Router Vite config.
export default defineConfig({
	plugins: [tsconfigPaths()],
	test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
