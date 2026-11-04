export type SignIn = { ok: true; playerId: string } | { ok: false; message: string };
export async function signIn(username: string, password: string): Promise<SignIn> {
  try {
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && typeof data.playerId === "string")
      return { ok: true, playerId: data.playerId };
    return { ok: false, message: data.error || "Couldn't sign in. Try again." };
  } catch {
    return { ok: false, message: "Signing in needs an internet connection." };
  }
}
export async function signOut() {
  try {
    await fetch("/api/logout", { method: "POST", signal: AbortSignal.timeout(5000) });
  } catch {
    /* The device is signed out locally either way. */
  }
}
// "unknown" when offline or the server can't be reached, so nothing is revoked by mistake.
export async function checkSession(): Promise<"in" | "out" | "unknown"> {
  try {
    const r = await fetch("/api/session", { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!r.ok) return "unknown";
    return (await r.json()).username ? "in" : "out";
  } catch {
    return "unknown";
  }
}
