import { requireAdmin, serviceClient, authFehlerResponse } from "../_shared/auth.ts";
import { corsHeaders as corsFuer } from "../_shared/cors.ts";
import { esc } from "../_shared/util.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = "noreply@schichtmeisterapp.de";

// Aufruf durch den DB-Trigger notify_gutschein_anfrage (sendet { gutschein_id }).
// Die Function vertraut nie Daten aus dem Body: Sie lädt die Anfrage per ID aus der DB
// und sendet nur, wenn mail_gesendet = false. Dadurch ist sie idempotent und nicht
// zum Spammen missbrauchbar. Der Testmodus ist nur für Admins (User-JWT).
Deno.serve(async (req) => {
  const corsHeaders = corsFuer(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { gutschein_id, test_mode, test_email } = body;

    const supabase = serviceClient();

    // TEST-MODUS: Fiktive Daten, Mail geht an test_email (nur Admins)
    if (test_mode && test_email) {
      await requireAdmin(req);
      console.log("Test-Modus aktiv, sende an:", test_email);
      const html = buildHtml({
        name: "Max Mustermann (TEST)",
        email: test_email,
        gutscheinName: "Verzehrgutschein (TEST)",
        punkte: 200,
        testMode: true,
      });
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `Schichtmeister <${FROM_EMAIL}>`,
          to: test_email,
          subject: `[TEST] Gutschein-Mail Test`,
          html,
        }),
      });
      const resendText = await resendRes.text();
      console.log("Resend Test:", resendText);
      return new Response(JSON.stringify({ erfolg: true, test: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // NORMALER MODUS: Anfrage per ID laden, nie Daten aus dem Body verwenden
    if (gutschein_id === undefined || gutschein_id === null || gutschein_id === "") {
      return new Response(
        JSON.stringify({ fehler: "gutschein_id fehlt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Anfrage "beanspruchen": nur wer mail_gesendet von false auf true setzt, sendet die Mail.
    const { data: anfrage, error: claimError } = await supabase
      .from("gutschein_anfragen")
      .update({ mail_gesendet: true })
      .eq("id", gutschein_id)
      .eq("mail_gesendet", false)
      .select("id, mitglied_id, typ, punkte")
      .maybeSingle();

    if (claimError) {
      console.error("Claim-Fehler:", claimError.message);
      return new Response(
        JSON.stringify({ fehler: "Anfrage konnte nicht geladen werden" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!anfrage) {
      // Unbekannte ID oder Mail schon gesendet
      return new Response(
        JSON.stringify({ erfolg: true, uebersprungen: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const freigeben = async () => {
      const { error } = await supabase.from("gutschein_anfragen").update({ mail_gesendet: false }).eq("id", anfrage.id);
      if (error) console.error("mail_gesendet-Reset fehlgeschlagen:", error.message);
    };

    const { mitglied_id, typ, punkte } = anfrage;

    const { data: settings, error: settingsError } = await supabase
      .from("einstellungen")
      .select("admin_email")
      .single();

    console.log("Settings:", JSON.stringify(settings), "Error:", JSON.stringify(settingsError));

    const adminEmail = settings?.admin_email;
    if (!adminEmail) {
      await freigeben();
      return new Response(
        JSON.stringify({ fehler: "Keine Admin-Email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profil, error: profilError } = await supabase
      .from("profiles")
      .select("name, display_name, email")
      .eq("id", mitglied_id)
      .maybeSingle();

    console.log("Profil:", JSON.stringify(profil), "Error:", JSON.stringify(profilError));

    const name = profil?.display_name || profil?.name || "Unbekannt";
    const gutscheinName = gutscheinBezeichnung(typ);

    const html = buildHtml({ name, email: profil?.email ?? "–", gutscheinName, punkte, testMode: false });

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Schichtmeister <${FROM_EMAIL}>`,
        to: adminEmail,
        subject: `Neue Gutschein-Anfrage von ${name}`,
        html,
      }),
    });

    const resendText = await resendRes.text();
    console.log("Resend:", resendText);

    if (!resendRes.ok) {
      await freigeben();
      return new Response(JSON.stringify({ fehler: "Mailversand fehlgeschlagen" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ erfolg: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const authAntwort = authFehlerResponse(err, corsHeaders);
    if (authAntwort) return authAntwort;
    console.error("Fehler:", String(err));
    return new Response(JSON.stringify({ fehler: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// typ-Werte, die das Frontend schreibt:
//   Profil.tsx: "food", "shop"
//   Shop.tsx:   Artikelname, z. B. "5 € Verzehrgutschein", "10 € Fanshop-Gutschein", "Heimtrikot 2025"
// Unbekannte Werte werden roh angezeigt und geloggt, nie stillschweigend als "Fanshop" ausgegeben.
const TYP_NAMEN: Record<string, string> = {
  food: "Verzehrgutschein",
  shop: "Fanshop-Gutschein",
};

function gutscheinBezeichnung(typ: unknown): string {
  const roh = String(typ ?? "").trim();
  if (!roh) {
    console.warn("gutschein-anfrage: typ fehlt");
    return "(unbekannt)";
  }
  const name = TYP_NAMEN[roh.toLowerCase()];
  if (name) return name;
  console.warn("gutschein-anfrage: unbekannter typ:", roh);
  return roh;
}

function buildHtml({ name, email, gutscheinName, punkte, testMode }: {
  name: string; email: string; gutscheinName: string; punkte: number; testMode: boolean;
}): string {
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:${testMode ? '#b45309' : '#1a472a'};padding:28px 32px;text-align:center;">
          <span style="font-size:20px;font-weight:600;color:#ffffff;">
            ${testMode ? '🧪 TEST – ' : ''}SSV Boppard · Schichtmeister
          </span>
        </td></tr>
        <tr><td style="padding:32px 32px 24px;">
          ${testMode ? '<p style="background:#fff7ed;border:1px solid #f59e0b;border-radius:8px;padding:10px 14px;font-size:13px;color:#b45309;margin:0 0 20px;">Dies ist eine Test-Mail. Es wurden keine Daten in der Datenbank verändert.</p>' : ''}
          <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#1a1a1a;">Neue Gutschein-Anfrage</p>
          <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.6;">
            Ein Mitglied möchte Punkte einlösen.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:8px;border:1px solid #e5e7eb;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 12px;font-size:13px;color:#555;"><strong style="color:#1a1a1a;">Mitglied:</strong> ${esc(name)}</p>
              <p style="margin:0 0 12px;font-size:13px;color:#555;"><strong style="color:#1a1a1a;">E-Mail:</strong> ${esc(email)}</p>
              <p style="margin:0 0 12px;font-size:13px;color:#555;"><strong style="color:#1a1a1a;">Gutschein:</strong> ${esc(gutscheinName)}</p>
              <p style="margin:0;font-size:13px;color:#555;"><strong style="color:#1a1a1a;">Punkte:</strong> ${esc(punkte)} Punkte</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#bbb;">Schichtmeister · schichtmeisterapp.de</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}