// The only platform API core may use: WHATWG Encoding, available in Node and Web Workers.
// Declared by hand because the core tsconfig loads neither DOM nor Node types.

interface TextDecoderOptions {
  fatal?: boolean;
  ignoreBOM?: boolean;
}

interface TextDecodeOptions {
  stream?: boolean;
}

declare class TextDecoder {
  constructor(label?: string, options?: TextDecoderOptions);
  readonly encoding: string;
  readonly fatal: boolean;
  readonly ignoreBOM: boolean;
  decode(input?: Uint8Array, options?: TextDecodeOptions): string;
}
