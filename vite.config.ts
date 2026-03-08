```
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { getCartographerPlugin } from "./utils/vitePlugins";

export default defineConfig(async () => {
  const cartographerPlugin = await getCartographerPlugin();

  return {
    plugins: [
      react(),
      runtimeErrorOverlay(),
     ...(process.env.NODE_ENV!== "production" && process.env.REPL_ID!== undefined
       ? [cartographerPlugin]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    root: path.resolve(import.meta.dirname, "client"),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});
```

```
// File: utils/vitePlugins.ts

import { cartographer } from "@replit/vite-plugin-cartographer";

export async function getCartographerPlugin() {
  return cartographer();
}
```