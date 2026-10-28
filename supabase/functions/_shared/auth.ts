// Gemeinsame Aufrufer-Prüfung für alle Edge Functions.
//
//  requireUser  – gültiges User-JWT, sonst 401
//  requireAdmin – User + profiles.is_admin (in AP 4 dann ist_admin_von), sonst 401/403
//  requireCron  – Header x-cron-secret == Function-Secret CRON_SECRET, sonst 401
//
// Alle drei werfen bei Fehler einen AuthError. Der Handler fängt ihn mit
// authFehlerResponse() ab und antwortet mit dem passenden Status.

import { createClient, SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export async function requireUser(req: Request): Promise<User> {
  const header = req.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new AuthError(401, "Nicht autorisiert");

  // Der öffentliche Anon-Key ist kein User-JWT und scheitert hier mit 401.
  const { data, error } = await serviceClient().auth.getUser(match[1]);
  if (error || !data?.user) throw new AuthError(401, "Nicht autorisiert");
  return data.user;
}

export async function requireAdmin(req: Request): Promise<{ user: User; supabase: SupabaseClient }> {
  const user = await requireUser(req);
  const supabase = serviceClient();
  const { data: profil, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    console.error("requireAdmin:", error.message);
    throw new AuthError(500, "Interner Fehler");
  }
  if (!profil?.is_admin) throw new AuthError(403, "Keine Berechtigung");
  return { user, supabase };
}

export function requireCron(req: Request): void {
  const erwartet = Deno.env.get("CRON_SECRET") ?? "";
  const erhalten = req.headers.get("x-cron-secret") ?? "";
  // Ist das Secret nicht gesetzt, wird nie durchgelassen.
  if (!erwartet || !gleich(erwartet, erhalten)) throw new AuthError(401, "Nicht autorisiert");
}

// Vergleich ohne frühen Abbruch (Timing-Angriffe)
function gleich(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function authFehlerResponse(err: unknown, headers: Record<string, string>): Response | null {
  if (!(err instanceof AuthError)) return null;
  return new Response(JSON.stringify({ erfolg: false, fehler: err.message }), {
    status: err.status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
