// account-loeschen – abgesicherte Version (Boppard-Hotfix, vor Multi-Mandant)
//
// Änderungen gegenüber der alten Version:
//  1. Aufrufer MUSS ein gültiger, eingeloggter User sein (Anon-Key allein reicht nicht mehr).
//  2. Fremde Konten (userId im Body) darf nur ein Admin löschen.
//  3. Reihenfolge: erst Auth-Account, dann Daten. Schlägt das Löschen fehl, bleibt nichts halb gelöscht.
//  4. Temp-User (ohne Auth-Account) werden korrekt behandelt statt mit 500 zu enden.
//  5. Fehler beim Löschen der Daten werden gemeldet statt verschluckt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ fehler: "Nicht autorisiert" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // 1) Aufrufer muss ein echter eingeloggter User sein
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ fehler: "Nicht autorisiert" }, 401);

    const body = await req.json().catch(() => ({}));
    const zielUserId: unknown = body.userId ?? user.id;
    if (typeof zielUserId !== "string" || !UUID_RE.test(zielUserId)) {
      return json({ fehler: "Ungültige User-ID" }, 400);
    }

    // 2) Fremdes Konto: nur Admin
    if (zielUserId !== user.id) {
      const { data: caller } = await admin
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();
      if (!caller?.is_admin) return json({ fehler: "Keine Berechtigung" }, 403);
    }

    const { data: ziel } = await admin
      .from("profiles")
      .select("id, is_temp")
      .eq("id", zielUserId)
      .maybeSingle();
    if (!ziel) return json({ fehler: "Nutzer nicht gefunden" }, 404);

    // 3) Zuerst den Auth-Account löschen (Temp-User haben keinen)
    if (!ziel.is_temp) {
      const { error: authError } = await admin.auth.admin.deleteUser(zielUserId);
      if (authError && authError.status !== 404) {
        return json({ fehler: authError.message }, 500);
      }
    }

    // 4) Danach die Daten (viele davon löschen per CASCADE ohnehin mit, hier explizit zur Sicherheit)
    const loeschungen: Array<[string, string]> = [
      ["schichtbelegungen", "mitglied_id"],
      ["gutschein_anfragen", "mitglied_id"],
      ["benachrichtigungen", "mitglied_id"],
      ["shop_anfragen", "user_id"],
      ["push_subscriptions", "user_id"],
      ["profiles", "id"],
    ];

    for (const [tabelle, spalte] of loeschungen) {
      const { error } = await admin.from(tabelle).delete().eq(spalte, zielUserId);
      if (error) {
        return json({ fehler: `Löschen in ${tabelle} fehlgeschlagen: ${error.message}` }, 500);
      }
    }

    return json({ erfolg: true });
  } catch (err) {
    console.error("account-loeschen:", err);
    return json({ fehler: "Interner Fehler" }, 500);
  }
});
