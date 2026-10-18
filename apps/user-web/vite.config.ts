import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // admin-web uses 5173; both can run at once against the same API.
  server: { port: 5174 },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.spec.{ts,tsx}"],
    setupFiles: "./src/test/setup.ts",
  },
});
