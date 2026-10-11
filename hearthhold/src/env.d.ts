// Bedrock's script runtime provides console; Node (tests) provides console + process.
declare const console: { log(...a: unknown[]): void; warn(...a: unknown[]): void; error(...a: unknown[]): void };
declare const process: { exit(code: number): never };
