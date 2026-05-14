// Tiny id helper. crypto.randomUUID is available in all modern browsers.
export const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const nowISO = (): string => new Date().toISOString();
