import { describe, expect, it } from "vitest";
import { splitTextForTts } from "../text-chunking";

describe("splitTextForTts", () => {
  it("removes empty text blocks and trims surrounding whitespace", () => {
    expect(splitTextForTts("  First block.  \n\n\n  Second block.  ")).toEqual([
      "First block.\n\nSecond block.",
    ]);
  });

  it("keeps text blocks together until they exceed the chunk limit", () => {
    expect(splitTextForTts("Alpha.\n\nBeta.", 13)).toEqual([
      "Alpha.\n\nBeta.",
    ]);
    expect(splitTextForTts("Alpha.\n\nBeta.", 12)).toEqual([
      "Alpha.",
      "Beta.",
    ]);
  });

  it("splits oversized text blocks on sentence boundaries", () => {
    expect(splitTextForTts("Alpha sentence. Beta sentence.", 17)).toEqual([
      "Alpha sentence.",
      "Beta sentence.",
    ]);
  });

  it("splits words that are longer than the chunk limit", () => {
    expect(splitTextForTts("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });
});
