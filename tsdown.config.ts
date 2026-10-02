import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/pipis/index.ts", "src/pipis/jsx-runtime.ts", "src/pipis/jsx-dev-runtime.ts"],
});
