import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { checkIsDirectlyCalledFile } from "../cli";

const originalArgv = [...process.argv];

function setEntrypoint(entrypointPath?: string): void {
  process.argv.length = 1;

  if (entrypointPath) {
    process.argv.push(entrypointPath);
  }
}

describe("checkIsDirectlyCalledFile", () => {
  afterEach(() => {
    process.argv.length = 0;
    process.argv.push(...originalArgv);
  });

  it("returns true when the module URL matches the process entrypoint", () => {
    const entrypointPath = path.join(process.cwd(), "utils", "cli.ts");

    setEntrypoint(entrypointPath);

    expect(checkIsDirectlyCalledFile(pathToFileURL(entrypointPath).href)).toBe(
      true,
    );
  });

  it("returns false when the module URL does not match the process entrypoint", () => {
    const modulePath = path.join(process.cwd(), "utils", "cli.ts");
    const entrypointPath = path.join(process.cwd(), "utils", "gdrive.ts");

    setEntrypoint(entrypointPath);

    expect(checkIsDirectlyCalledFile(pathToFileURL(modulePath).href)).toBe(
      false,
    );
  });

  it("returns false when there is no process entrypoint", () => {
    const modulePath = path.join(process.cwd(), "utils", "cli.ts");

    setEntrypoint();

    expect(checkIsDirectlyCalledFile(pathToFileURL(modulePath).href)).toBe(
      false,
    );
  });
});
