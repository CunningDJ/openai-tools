const defaultMaxChunkChars = 7_500;

export function splitTextForTts(
  input: string,
  maxChunkChars = defaultMaxChunkChars,
): string[] {
  const textBlocks = input
    .split(/\n{2,}/)
    .map((textBlock) => textBlock.trim())
    .filter(Boolean);

  return chunkTextSegments(
    textBlocks.flatMap((textBlock) =>
      splitOversizedTextBlock(textBlock, maxChunkChars),
    ),
    "\n\n",
    maxChunkChars,
  );
}

function splitOversizedTextBlock(
  textBlock: string,
  maxChunkChars: number,
): string[] {
  if (textBlock.length <= maxChunkChars) return [textBlock];

  const sentences =
    textBlock.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [textBlock];
  const sentenceSegments = sentences
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return chunkTextSegments(sentenceSegments, " ", maxChunkChars);
}

function chunkTextSegments(
  textSegments: string[],
  separator: string,
  maxChunkChars: number,
): string[] {
  const chunks: string[] = [];
  let currentChunk = "";

  for (const textSegment of textSegments.flatMap((segment) =>
    splitOversizedTextSegment(segment, maxChunkChars),
  )) {
    const nextChunk = currentChunk
      ? `${currentChunk}${separator}${textSegment}`
      : textSegment;

    if (nextChunk.length <= maxChunkChars) {
      currentChunk = nextChunk;
      continue;
    }

    if (currentChunk) chunks.push(currentChunk);
    currentChunk = textSegment;
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

function splitOversizedTextSegment(
  textSegment: string,
  maxChunkChars: number,
): string[] {
  if (textSegment.length <= maxChunkChars) return [textSegment];

  const words = textSegment.split(/\s+/);
  return words.length === 1
    ? splitByLength(textSegment, maxChunkChars)
    : chunkTextSegments(words, " ", maxChunkChars);
}

function splitByLength(text: string, maxChunkChars: number): string[] {
  const chunks: string[] = [];

  for (let index = 0; index < text.length; index += maxChunkChars) {
    chunks.push(text.slice(index, index + maxChunkChars));
  }

  return chunks;
}
