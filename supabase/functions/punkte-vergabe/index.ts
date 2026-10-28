import { requireCron, serviceClient, authFehlerResponse } from "../_shared/auth.ts";
import { heuteBerlin } from "../_shared/util.ts";

const supabase = serviceClient();

const jsonHeaders = { "Content-Type": "application/json" };

// Nur per Cron (Header x-cron-secret) aufrufbar.
Deno.serve(async (req) => {
  try {
    requireCron(req);

    // "Heute" in Europe/Berlin (die Function selbst läuft in UTC)
    const heute = heuteBerlin();

    // Schritt 1: Vergangene Veranstaltungen auf "Abgeschlossen" setzen.
    // Maßgeblich ist das Ende: coalesce(datum_ende, datum) < heute.
    // Mehrtägige Events werden so erst nach dem letzten Tag abgeschlossen.
    const { error: statusError } = await supabase
      .from("veranstaltungen")
      .update({ status: "Abgeschlossen" })
      .or(`datum_ende.lt.${heute},and(datum_ende.is.null,datum.lt.${heute})`)
      .neq("status", "Abgeschlossen");

    if (statusError) {
      console.error("Fehler beim Status-Update:", statusError.message);
    } else {
      console.log("Veranstaltungs-Status aktualisiert.");
    }

    // Schritt 2: Abgeschlossene Veranstaltungen laden für Punkte-Vergabe
    const { data: vergangeneEvents, error: evError } = await supabase
      .from("veranstaltungen")
      .select("id, name")
      .eq("status", "Abgeschlossen");

    if (evError) {
      return new Response(
        JSON.stringify({ erfolg: false, fehler: evError.message }),
        { status: 500, headers: jsonHeaders }
      );
    }

    if (!vergangeneEvents || vergangeneEvents.length === 0) {
      return new Response(
        JSON.stringify({ erfolg: true, vergeben: 0, info: "Keine abgeschlossenen Events" }),
        { status: 200, headers: jsonHeaders }
      );
    }

    const eventIds = vergangeneEvents.map((e: any) => e.id);
    const eventNameMap: Record<number, string> = {};
    vergangeneEvents.forEach((e: any) => { eventNameMap[e.id] = e.name; });

    // Schritt 3: Schichten dieser Veranstaltungen laden
    const { data: schichten, error: schichtError } = await supabase
      .from("schichten")
      .select("id, punkte, bezeichnung, veranstaltung_id")
      .in("veranstaltung_id", eventIds);

    if (schichtError) {
      return new Response(
        JSON.stringify({ erfolg: false, fehler: schichtError.message }),
        { status: 500, headers: jsonHeaders }
      );
    }

    if (!schichten || schichten.length === 0) {
      return new Response(
        JSON.stringify({ erfolg: true, vergeben: 0, info: "Keine Schichten gefunden" }),
        { status: 200, headers: jsonHeaders }
      );
    }

    const schichtIds = schichten.map((s: any) => s.id);
    const schichtMap: Record<number, { punkte: number; bezeichnung: string; veranstaltung_id: number }> = {};
    schichten.forEach((s: any) => {
      schichtMap[s.id] = { punkte: s.punkte, bezeichnung: s.bezeichnung, veranstaltung_id: s.veranstaltung_id };
    });

    // Schritt 4: Offene Belegungen laden (nur aktive Anmeldungen, keine abgesagten)
    const { data: belegungen, error: belegungError } = await supabase
      .from("schichtbelegungen")
      .select("id, mitglied_id, schicht_id")
      .eq("punkte_vergeben", false)
      .eq("status", "Angemeldet")
      .in("schicht_id", schichtIds);

    if (belegungError) {
      return new Response(
        JSON.stringify({ erfolg: false, fehler: belegungError.message }),
        { status: 500, headers: jsonHeaders }
      );
    }

    if (!belegungen || belegungen.length === 0) {
      return new Response(
        JSON.stringify({ erfolg: true, vergeben: 0, info: "Alle Punkte bereits vergeben" }),
        { status: 200, headers: jsonHeaders }
      );
    }

    let vergeben = 0;
    let fehler = 0;

    for (const b of belegungen) {
      try {
        const schicht = schichtMap[b.schicht_id];
        const punkte = schicht?.punkte ?? 0;
        const schichtName = schicht?.bezeichnung ?? "Schicht";
        const eventName = eventNameMap[schicht?.veranstaltung_id] ?? "Veranstaltung";

        // 1. Belegung "beanspruchen": nur wer das Flag von false auf true setzt, darf Punkte vergeben.
        //    Läuft die Function doppelt (oder parallel), bekommt die zweite Instanz keine Zeile zurück.
        const { data: beansprucht, error: claimError } = await supabase
          .from("schichtbelegungen")
          .update({ punkte_vergeben: true })
          .eq("id", b.id)
          .eq("punkte_vergeben", false)
          .select("id");

        if (claimError) { console.error("Claim-Fehler:", claimError.message); fehler++; continue; }
        if (!beansprucht || beansprucht.length === 0) continue; // schon von anderem Lauf erledigt

        // 2. Punkte vergeben. add_punkte zählt schichten_count selbst um 1 hoch.
        const { error: punkteError } = await supabase.rpc("add_punkte", {
          user_id: b.mitglied_id,
          amount: punkte,
        });

        if (punkteError) {
          console.error("add_punkte-Fehler:", punkteError.message);
          // Flag zurücksetzen, damit der nächste Lauf es erneut versucht
          const { error: resetError } = await supabase
            .from("schichtbelegungen")
            .update({ punkte_vergeben: false })
            .eq("id", b.id);
          if (resetError) console.error("Flag-Reset fehlgeschlagen für Belegung", b.id, resetError.message);
          fehler++;
          continue;
        }

        const { error: notifError } = await supabase.from("benachrichtigungen").insert({
          mitglied_id: b.mitglied_id,
          typ: "punkte",
          titel: `+${punkte} Punkte erhalten`,
          nachricht: `Danke für deinen Einsatz bei „${schichtName}" (${eventName}).`,
          punkte,
          gelesen: false,
        });
        if (notifError) console.error("Benachrichtigung fehlgeschlagen:", notifError.message);

        vergeben++;
      } catch (err) {
        console.error("Fehler bei Belegung", b.id, String(err));
        fehler++;
      }
    }

    return new Response(
      JSON.stringify({ erfolg: true, vergeben, fehler, gesamt: belegungen.length }),
      { status: 200, headers: jsonHeaders }
    );

  } catch (err) {
    const authAntwort = authFehlerResponse(err, {});
    if (authAntwort) return authAntwort;
    return new Response(
      JSON.stringify({ erfolg: false, fehler: String(err) }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
