import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["utils/tests/**/*.test.ts", "tts/utils/tests/**/*.test.ts"],
  },
});
