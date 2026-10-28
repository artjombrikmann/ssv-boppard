import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = "noreply@schichtmeisterapp.de";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function datumFormatieren(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
}

function uhrzeitFormatieren(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit", minute: "2-digit",
  });
}

function mailHtml(params: {
  vorname: string;
  vereinsname: string;
  vereinslogo: string | null;
  eventname: string;
  schichtname: string;
  startzeit: string;
  endzeit: string;
  datum: string;
  adminName: string;
  testMode?: boolean;
}): string {
  const {
    vorname, vereinsname, vereinslogo, eventname,
    schichtname, startzeit, endzeit, datum, adminName, testMode
  } = params;

  const logoHtml = vereinslogo
    ? `<img src="${vereinslogo}" alt="${vereinsname} Logo" style="max-height:64px;max-width:160px;object-fit:contain;margin-bottom:8px;" />`
    : `<span style="font-size:20px;font-weight:600;color:#ffffff;">${vereinsname}</span>`;

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">

        <!-- Header -->
        <tr><td style="background:${testMode ? '#b45309' : '#1a472a'};padding:28px 32px;text-align:center;">
          ${logoHtml}
          ${testMode ? '<p style="color:#fff;font-size:12px;margin:8px 0 0;opacity:.8;">🧪 TEST-MAIL</p>' : ''}
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px 32px 24px;">
          ${testMode ? '<p style="background:#fff7ed;border:1px solid #f59e0b;border-radius:8px;padding:10px 14px;font-size:13px;color:#b45309;margin:0 0 20px;">Dies ist eine Test-Mail. Es wurden keine Daten verändert.</p>' : ''}

          <p style="margin:0 0 8px;font-size:15px;color:#555;">Hallo ${vorname},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#333;line-height:1.6;">
            du wurdest von <strong>${adminName}</strong> einer Schicht zugewiesen.
            Hier sind alle Details:
          </p>

          <!-- Schicht-Details -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:8px;border:1px solid #e5e7eb;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#888;text-transform:uppercase;">Veranstaltung</p>
              <p style="margin:0 0 16px;font-size:17px;font-weight:600;color:#1a1a1a;">${eventname}</p>

              <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#888;text-transform:uppercase;">Schicht</p>
              <p style="margin:0 0 16px;font-size:15px;color:#333;">${schichtname}</p>

              <table cellpadding="0" cellspacing="0"><tr>
                <td style="padding-right:32px;">
                  <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#888;text-transform:uppercase;">Datum</p>
                  <p style="margin:0;font-size:15px;color:#333;">${datum}</p>
                </td>
                <td style="padding-right:32px;">
                  <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#888;text-transform:uppercase;">Beginn</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#1a472a;">${startzeit} Uhr</p>
                </td>
                <td>
                  <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#888;text-transform:uppercase;">Ende</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#1a472a;">${endzeit} Uhr</p>
                </td>
              </tr></table>
            </td></tr>
          </table>

          <!-- Admin Info -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#e8f5ee;border-radius:8px;border:1px solid #c6e6d4;margin-bottom:24px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#1a472a;text-transform:uppercase;">Zugewiesen von</p>
              <p style="margin:0;font-size:15px;font-weight:600;color:#1a472a;">${adminName}</p>
            </td></tr>
          </table>

          <p style="margin:0;font-size:14px;color:#888;line-height:1.6;">
            Bei Fragen wende dich direkt an deinen Vereins-Admin.<br/>
            Diese Mail wurde automatisch von <strong>Schichtmeister</strong> für ${vereinsname} versendet.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#bbb;">Schichtmeister · schichtmeisterapp.de</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function mailSenden(params: { an: string; betreff: string; html: string }): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Schichtmeister <${FROM_EMAIL}>`,
      to: params.an,
      subject: params.betreff,
      html: params.html,
    }),
  });
  if (!res.ok) console.error(`Mail-Fehler an ${params.an}:`, await res.text());
  else console.log(`Mail gesendet an ${params.an}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // TEST-MODUS
    if (body?.test_mode && body?.test_email) {
      const html = mailHtml({
        vorname: "Mitglied",
        vereinsname: "SSV Boppard",
        vereinslogo: "https://schichtmeisterapp.de/LOGO-SSV-BOPPARD-_1_.png",
        eventname: "Testveranstaltung",
        schichtname: "Test-Schicht (Kasse)",
        startzeit: "14:00",
        endzeit: "17:00",
        datum: new Date().toLocaleDateString("de-DE", {
          weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Berlin"
        }),
        adminName: "Artjom Brikmann",
        testMode: true,
      });

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `Schichtmeister <${FROM_EMAIL}>`,
          to: body.test_email,
          subject: "[TEST] Schicht-Zuweisung Test",
          html,
        }),
      });

      return new Response(
        JSON.stringify({ erfolg: true, test: true, gesendet_an: body.test_email }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // PFLICHTFELDER prüfen
    const { mitglied_id, schicht_id, admin_id } = body;
    if (!mitglied_id || !schicht_id || !admin_id) {
      return new Response(
        JSON.stringify({ erfolg: false, fehler: "mitglied_id, schicht_id und admin_id sind Pflichtfelder." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Mitglied laden
    const { data: mitglied, error: mitgliedError } = await supabase
      .from("profiles")
      .select("id, display_name, name, email")
      .eq("id", mitglied_id)
      .single();

    if (mitgliedError || !mitglied?.email) {
      return new Response(
        JSON.stringify({ erfolg: false, fehler: "Mitglied nicht gefunden oder keine E-Mail." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Schicht + Veranstaltung laden
    const { data: schicht, error: schichtError } = await supabase
      .from("schichten")
      .select("id, bezeichnung, startzeit_ts, endzeit, veranstaltungen(name)")
      .eq("id", schicht_id)
      .single();

    if (schichtError || !schicht) {
      return new Response(
        JSON.stringify({ erfolg: false, fehler: "Schicht nicht gefunden." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Admin laden
    const { data: admin, error: adminError } = await supabase
      .from("profiles")
      .select("id, display_name, name")
      .eq("id", admin_id)
      .single();

    if (adminError || !admin) {
      return new Response(
        JSON.stringify({ erfolg: false, fehler: "Admin nicht gefunden." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const vorname = mitglied.display_name || (mitglied.name ? mitglied.name.split(" ")[0] : "Hallo");
    const adminName = admin.display_name || admin.name || "Admin";
    const eventname = (schicht.veranstaltungen as any)?.name ?? "Veranstaltung";

    const html = mailHtml({
      vorname,
      vereinsname: "SSV Boppard",
      vereinslogo: "https://schichtmeisterapp.de/LOGO-SSV-BOPPARD-_1_.png",
      eventname,
      schichtname: schicht.bezeichnung,
      startzeit: uhrzeitFormatieren(schicht.startzeit_ts),
      endzeit: uhrzeitFormatieren(schicht.endzeit),
      datum: datumFormatieren(schicht.startzeit_ts),
      adminName,
    });

    await mailSenden({
      an: mitglied.email,
      betreff: `Du wurdest einer Schicht zugewiesen: "${schicht.bezeichnung}"`,
      html,
    });

    return new Response(
      JSON.stringify({ erfolg: true, gesendet_an: mitglied.email }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (err) {
    console.error("Unerwarteter Fehler:", err);
    return new Response(
      JSON.stringify({ erfolg: false, fehler: String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});