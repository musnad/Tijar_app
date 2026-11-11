export type AtUssdRequest = {
  sessionId: string;
  phoneNumber: string;
  serviceCode: string;
  networkCode: string;
  text: string;
};

function read(source: URLSearchParams | Record<string, unknown>, key: string): string {
  if (source instanceof URLSearchParams) return source.get(key)?.trim() ?? "";
  const value = source[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function parseAfricastalkingUssd(request: Request): Promise<AtUssdRequest> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const source = body ?? {};
    return {
      sessionId: read(source, "sessionId"),
      phoneNumber: read(source, "phoneNumber"),
      serviceCode: read(source, "serviceCode"),
      networkCode: read(source, "networkCode"),
      text: read(source, "text"),
    };
  }
  const raw = await request.text();
  const params = new URLSearchParams(raw);
  return {
    sessionId: read(params, "sessionId"),
    phoneNumber: read(params, "phoneNumber"),
    serviceCode: read(params, "serviceCode"),
    networkCode: read(params, "networkCode"),
    text: read(params, "text"),
  };
}
