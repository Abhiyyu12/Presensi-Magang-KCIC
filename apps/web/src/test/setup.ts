// Vitest setup: minimal jsdom shims used by the app at runtime.
// Ensure crypto.randomUUID exists for idempotency-key generation in tests.

const currentCrypto = globalThis.crypto as Crypto | undefined;
if (!currentCrypto || typeof currentCrypto.randomUUID !== 'function') {
  let counter = 0;
  const randomUUID = (): string => {
    counter += 1;
    return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
  };
  const shim = Object.assign(Object.create(null), currentCrypto ?? {}, { randomUUID });
  Object.defineProperty(globalThis, 'crypto', {
    value: shim,
    configurable: true,
    writable: true,
  });
}
