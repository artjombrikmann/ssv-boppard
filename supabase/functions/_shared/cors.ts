// CORS nur für die eigenen Hosts statt "*".
// Erlaubt: *.schichtmeisterapp.de, Vercel-Preview-Hosts (*.vercel.app), localhost.
// Für Aufrufe ohne Origin (Cron, Datenbank-Trigger) ist CORS nicht relevant.

const ERLAUBT = [
  /^https:\/\/([a-z0-9-]+\.)*schichtmeisterapp\.de$/,
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
  /^http:\/\/localhost:\d+$/,
];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (ERLAUBT.some((re) => re.test(origin))) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
