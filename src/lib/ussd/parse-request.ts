export type AtUssdRequest = {
  sessionId: string;
  phoneNumber: string;
  serviceCode: string;
  networkCode: string;
  text: string;
};

function pick(source: URLSearchParams | Record<string, unknown>, names: string[]): string {
  const keys = names.map((name) => name.toLowerCase());
  if (source instanceof URLSearchParams) {
    for (const [key, value] of source.entries()) {
      if (keys.includes(key.toLowerCase()) && value.trim()) return value.trim();
    }
    return "";
  }
  for (const [key, value] of Object.entries(source)) {
    if (keys.includes(key.toLowerCase()) && typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function fromParams(source: URLSearchParams | Record<string, unknown>): AtUssdRequest {
  return {
    sessionId: pick(source, ["sessionId", "sessionid"]),
    phoneNumber: pick(source, ["phoneNumber", "phonenumber", "phone"]),
    serviceCode: pick(source, ["serviceCode", "servicecode"]),
    networkCode: pick(source, ["networkCode", "networkcode"]),
    text: pick(source, ["text"]),
  };
}

export async function parseAfricastalkingUssd(request: Request): Promise<AtUssdRequest> {
  const url = new URL(request.url);
  const fromQuery = fromParams(url.searchParams);
  const contentType = request.headers.get("content-type") ?? "";
  if (request.method === "GET") return fromQuery;
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const parsed = fromParams(body ?? {});
    return parsed.sessionId || parsed.phoneNumber || parsed.text ? parsed : fromQuery;
  }
  const raw = await request.text();
  const parsed = fromParams(new URLSearchParams(raw));
  return parsed.sessionId || parsed.phoneNumber || parsed.text ? parsed : fromQuery;
}
