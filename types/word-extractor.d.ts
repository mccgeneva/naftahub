// Minimal ambient types for `word-extractor` (ships no type definitions).
// Only the surface we use in lib/nqai-extract.ts is declared.
declare module "word-extractor" {
  interface WordDocument {
    getBody(): string
    getFootnotes(): string
    getHeaders(): string
    getFooters(): string
    getEndnotes(): string
    getAnnotations(): string
  }

  class WordExtractor {
    extract(input: string | Buffer): Promise<WordDocument>
  }

  export = WordExtractor
}
