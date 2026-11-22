// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      // LOCAL_ONLY=1 npm run dev: run without remote bindings (no Cloudflare
      // login needed). Sending mail is not available in this mode.
      remoteBindings: process.env.LOCAL_ONLY !== "1",
    }),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
});
