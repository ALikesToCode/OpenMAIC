// Next/Vinext's generated fetch types currently expose Body.json() as unknown,
// while the app was written against the standard DOM-compatible any contract.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonResponseBody = any;

interface Body {
  json(): Promise<JsonResponseBody>;
}
