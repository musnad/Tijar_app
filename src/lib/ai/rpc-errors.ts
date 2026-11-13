export type MappedCreditError = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

type RpcErr = { code?: string; message?: string };

export function mapCreditRpcError(error: RpcErr): MappedCreditError {
  const msg = error.message ?? "";
  const lower = msg.toLowerCase();
  if (error.code === "42P01" || error.code === "42883" || /does not exist/i.test(msg)) {
    return {
      ok: false,
      status: 503,
      code: "CREDITS_UNAVAILABLE",
      message: "TIJAR AI billing is not ready on this server.",
    };
  }
  if (/NO_PROFILE/i.test(msg)) {
    return { ok: false, status: 401, code: "NO_PROFILE", message: "Sign in with a TIJAR profile to use AI." };
  }
  if (/insufficient/i.test(lower) || /INSUFFICIENT_CREDITS/i.test(msg)) {
    return {
      ok: false,
      status: 402,
      code: "INSUFFICIENT_CREDITS",
      message: "Not enough TIJAR AI credits for this action.",
    };
  }
  if (/UNKNOWN_SERVICE/i.test(msg)) {
    return { ok: false, status: 400, code: "UNKNOWN_SERVICE", message: "Unknown AI service." };
  }
  return { ok: false, status: 503, code: "CREDITS_ERROR", message: "Could not authorise AI credits. Try again." };
}
