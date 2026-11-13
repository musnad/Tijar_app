const KEY = /^[A-Za-z0-9._:-]{8,128}$/;

export function parseIdempotencyKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!KEY.test(trimmed)) return null;
  return trimmed;
}

export function readIdempotencyKey(request: Request, override?: string | null): string | null {
  return parseIdempotencyKey(override) ?? parseIdempotencyKey(request.headers.get("idempotency-key"));
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
