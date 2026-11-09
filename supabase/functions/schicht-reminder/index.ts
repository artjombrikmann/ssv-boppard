import { requireAdmin, requireCron, serviceClient, authFehlerResponse } from "../_shared/auth.ts";
import { corsHeaders as corsFuer } from "../_shared/cors.ts";
import { esc, istGastOderFake } from "../_shared/util.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = "noreply@schichtmeisterapp.de";

const supabase = serviceClient();

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

// FIX: Berechnet den Zielzeitraum korrekt in Europe/Berlin-Zeitzone
// Vorher: Edge Function lief in UTC → Bereich war 2h verschoben → Query fand nichts
function zieltagBerechnen(tageVorher: number): { von: string; bis: string } {
  const jetzt = new Date();

  // Heutiges Datum in Berliner Zeitzone ermitteln (Sommer/Winterzeit-sicher)
  const berlinFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  // Zieldatum berechnen
  const zielBasis = new Date(jetzt);
  zielBasis.setDate(zielBasis.getDate() + tageVorher);
  const zielStr = berlinFormatter.format(zielBasis); // z.B. "2026-05-10"

  // Berliner Offset für dieses Datum ermitteln (Sommer=+02:00, Winter=+01:00)
  const testDatum = new Date(`${zielStr}T12:00:00`);
  const utcStunde = testDatum.getUTCHours();
  const berlinStunde = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Berlin",
      hour: "numeric",
      hour12: false,
    }).format(testDatum)
  );
  const offsetStunden = berlinStunde - utcStunde;
  const offsetStr = offsetStunden >= 0
    ? `+0${offsetStunden}:00`
    : `-0${Math.abs(offsetStunden)}:00`;

  // Von 00:00:00 bis 23:59:59 Berliner Zeit
  const von = new Date(`${zielStr}T00:00:00${offsetStr}`);
  const bis = new Date(`${zielStr}T23:59:59${offsetStr}`);

  console.log(`Zielzeitraum für ${tageVorher} Tage: ${von.toISOString()} bis ${bis.toISOString()} (Berlin-Offset: ${offsetStr})`);

  return { von: von.toISOString(), bis: bis.toISOString() };
}

function mailHtml(params: {
  vorname: string; vereinsname: string; vereinslogo: string | null;
  eventname: string; schichtname: string; startuhrzeit: string;
  datum: string; tageVorher: number; testMode?: boolean;
}): string {
  const { vorname, vereinsname, vereinslogo, eventname, schichtname, startuhrzeit, datum, tageVorher, testMode } = params;
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
        <tr><td style="background:${testMode ? '#b45309' : '#1a472a'};padding:28px 32px;text-align:center;">${logoHtml}${testMode ? '<p style="color:#fff;font-size:12px;margin:8px 0 0;opacity:.8;">🧪 TEST-MAIL</p>' : ''}</td></tr>
        <tr><td style="padding:32px 32px 24px;">
          ${testMode ? '<p style="background:#fff7ed;border:1px solid #f59e0b;border-radius:8px;padding:10px 14px;font-size:13px;color:#b45309;margin:0 0 20px;">Dies ist eine Test-Mail. Es wurden keine Daten verändert.</p>' : ''}
          <p style="margin:0 0 8px;font-size:15px;color:#555;">Hallo ${esc(vorname)},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#333;line-height:1.6;">
            du hast dich für eine Schicht angemeldet${tageVorher === 2 ? " — die findet <strong>übermorgen</strong> statt" : " — nur noch <strong>5 Tage</strong>"}.
            Hier nochmal alle Details:
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:8px;border:1px solid #e5e7eb;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#888;text-transform:uppercase;">Veranstaltung</p>
              <p style="margin:0 0 16px;font-size:17px;font-weight:600;color:#1a1a1a;">${esc(eventname)}</p>
              <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#888;text-transform:uppercase;">Schicht</p>
              <p style="margin:0 0 16px;font-size:15px;color:#333;">${esc(schichtname)}</p>
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="padding-right:32px;">
                  <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#888;text-transform:uppercase;">Datum</p>
                  <p style="margin:0;font-size:15px;color:#333;">${datum}</p>
                </td>
                <td>
                  <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#888;text-transform:uppercase;">Beginn</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#1a472a;">${startuhrzeit} Uhr</p>
                </td>
              </tr></table>
            </td></tr>
          </table>
          <p style="margin:0;font-size:14px;color:#888;line-height:1.6;">
            Bei Fragen wende dich direkt an deinen Vereins-Admin.<br/>
            Diese Mail wurde automatisch von <strong>Schichtmeister</strong> für ${vereinsname} versendet.
          </p>
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

async function mailSenden(params: { an: string; betreff: string; html: string }): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `Schichtmeister <${FROM_EMAIL}>`, to: params.an, subject: params.betreff, html: params.html }),
  });
  if (!res.ok) console.error(`Mail-Fehler an ${params.an}:`, await res.text());
}

async function reminderVersenden(tageVorher: number): Promise<number> {
  const { von, bis } = zieltagBerechnen(tageVorher);
  const reminderSpalte = tageVorher === 5 ? "reminder_5_gesendet" : "reminder_2_gesendet";

  // Schichten anhand startzeit_ts filtern
  const { data: schichten, error } = await supabase
    .from("schichten")
    .select(`
      id,
      bezeichnung,
      startzeit_ts,
      veranstaltung:veranstaltungen(name),
      schichtbelegungen(
        id,
        status,
        reminder_5_gesendet,
        reminder_2_gesendet,
        mitglied:profiles(id, display_name, name, email, is_temp)
      )
    `)
    .gte("startzeit_ts", von)
    .lte("startzeit_ts", bis);

  if (error) {
    console.error("Fehler beim Laden der Schichten:", error.message);
    return 0;
  }

  if (!schichten || schichten.length === 0) {
    console.log(`Keine Schichten gefunden für ${tageVorher} Tage (${von} – ${bis}).`);
    return 0;
  }

  console.log(`${schichten.length} Schicht(en) gefunden für ${tageVorher} Tage.`);

  let mailCount = 0;
  for (const schicht of schichten) {
    for (const belegung of (schicht.schichtbelegungen ?? [])) {
      // Abgesagte Belegungen überspringen
      if (belegung.status === "abgesagt") continue;

      // FIX: Bereits gesendete Reminder überspringen → verhindert Doppelmails
      if (tageVorher === 5 && belegung.reminder_5_gesendet) {
        console.log(`5-Tage-Reminder bereits gesendet für Belegung ${belegung.id} – übersprungen.`);
        continue;
      }
      if (tageVorher === 2 && belegung.reminder_2_gesendet) {
        console.log(`2-Tage-Reminder bereits gesendet für Belegung ${belegung.id} – übersprungen.`);
        continue;
      }

      const mitglied = belegung.mitglied;
      // Gäste und Fake-Adressen (@...intern) überspringen
      if (istGastOderFake(mitglied)) continue;

      const vorname = mitglied.display_name || (mitglied.name ? mitglied.name.split(" ")[0] : "Hallo");

      const html = mailHtml({
        vorname,
        vereinsname: "SSV Boppard",
        vereinslogo: "https://schichtmeisterapp.de/LOGO-SSV-BOPPARD-_1_.png",
        eventname: schicht.veranstaltung?.name ?? "Veranstaltung",
        schichtname: schicht.bezeichnung,
        startuhrzeit: uhrzeitFormatieren(schicht.startzeit_ts),
        datum: datumFormatieren(schicht.startzeit_ts),
        tageVorher,
      });

      const betreff = tageVorher === 5
        ? `Erinnerung: Deine Schicht "${schicht.bezeichnung}" in 5 Tagen`
        : `Erinnerung: Deine Schicht "${schicht.bezeichnung}" ist übermorgen`;

      await mailSenden({ an: mitglied.email, betreff, html });

      // FIX: Reminder als gesendet markieren → kein Doppelversand
      const { error: updateError } = await supabase
        .from("schichtbelegungen")
        .update({ [reminderSpalte]: true })
        .eq("id", belegung.id);

      if (updateError) {
        console.error(`Fehler beim Markieren der Belegung ${belegung.id}:`, updateError.message);
      } else {
        console.log(`Reminder (${tageVorher} Tage) gesendet an ${mitglied.email} für Schicht "${schicht.bezeichnung}".`);
      }

      mailCount++;
    }
  }
  return mailCount;
}

async function testReminderSenden(testEmail: string): Promise<void> {
  const morgen = new Date()
  morgen.setDate(morgen.getDate() + 2)
  const datumStr = morgen.toLocaleDateString("de-DE", { weekday:"long", day:"2-digit", month:"long", year:"numeric", timeZone:"Europe/Berlin" })
  const html = mailHtml({
    vorname: "Admin",
    vereinsname: "SSV Boppard",
    vereinslogo: "https://schichtmeisterapp.de/LOGO-SSV-BOPPARD-_1_.png",
    eventname: "Testveranstaltung",
    schichtname: "Test-Schicht (Kasse)",
    startuhrzeit: "14:00",
    datum: datumStr,
    tageVorher: 2,
    testMode: true,
  })
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `Schichtmeister <${FROM_EMAIL}>`,
      to: testEmail,
      subject: `[TEST] Schicht-Reminder Test`,
      html,
    }),
  })
  if (!res.ok) console.error("Test-Mail Fehler:", await res.text())
  else console.log("Test-Reminder gesendet an:", testEmail)
}

Deno.serve(async (req) => {
  const corsHeaders = corsFuer(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    console.log("Schicht-Reminder gestartet:", new Date().toISOString());

    // TEST-MODUS: Body prüfen ob test_mode gesetzt
    let testMode = false
    let testEmail = ""
    try {
      const body = await req.json()
      if (body?.test_mode && body?.test_email) {
        testMode = true
        testEmail = body.test_email
      }
    } catch (_) { /* kein Body = normaler Cron-Aufruf */ }

    // Testmodus nur für Admins (User-JWT), normaler Lauf nur mit Cron-Secret
    if (testMode) {
      await requireAdmin(req)
      await testReminderSenden(testEmail)
      return new Response(JSON.stringify({ erfolg: true, test: true, gesendet_an: testEmail }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      })
    }

    requireCron(req)

    const [count5, count2] = await Promise.all([reminderVersenden(5), reminderVersenden(2)]);
    const ergebnis = {
      erfolg: true,
      mails_5_tage: count5,
      mails_2_tage: count2,
      gesamt: count5 + count2,
      zeitstempel: new Date().toISOString(),
    };
    console.log("Ergebnis:", ergebnis);
    return new Response(JSON.stringify(ergebnis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    const authAntwort = authFehlerResponse(err, corsHeaders);
    if (authAntwort) return authAntwort;
    console.error("Unerwarteter Fehler:", err);
    return new Response(JSON.stringify({ erfolg: false, fehler: String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});