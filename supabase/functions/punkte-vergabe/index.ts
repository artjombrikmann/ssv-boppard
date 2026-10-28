import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

Deno.serve(async (_req) => {
  try {
    const jetzt = new Date().toISOString().split("T")[0];

    // Schritt 1: Vergangene Veranstaltungen auf "Abgeschlossen" setzen
    const { error: statusError } = await supabase
      .from("veranstaltungen")
      .update({ status: "Abgeschlossen" })
      .lt("datum", jetzt)
      .neq("status", "Abgeschlossen");

    if (statusError) {
      console.error("Fehler beim Status-Update:", statusError.message);
    } else {
      console.log("Veranstaltungs-Status aktualisiert.");
    }

    // Schritt 2: Vergangene Veranstaltungen laden für Punkte-Vergabe
    const { data: vergangeneEvents, error: evError } = await supabase
      .from("veranstaltungen")
      .select("id, name")
      .eq("status", "Abgeschlossen");

    if (evError) {
      return new Response(
        JSON.stringify({ erfolg: false, fehler: evError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!vergangeneEvents || vergangeneEvents.length === 0) {
      return new Response(
        JSON.stringify({ erfolg: true, vergeben: 0, info: "Keine abgeschlossenen Events" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
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
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!schichten || schichten.length === 0) {
      return new Response(
        JSON.stringify({ erfolg: true, vergeben: 0, info: "Keine Schichten gefunden" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const schichtIds = schichten.map((s: any) => s.id);
    const schichtMap: Record<number, { punkte: number; bezeichnung: string; veranstaltung_id: number }> = {};
    schichten.forEach((s: any) => {
      schichtMap[s.id] = { punkte: s.punkte, bezeichnung: s.bezeichnung, veranstaltung_id: s.veranstaltung_id };
    });

    // Schritt 4: Offene Belegungen laden
    // ── FIX: Zusätzlich nach status = 'Angemeldet' filtern! ──
    // Vorher wurden auch abgemeldete (status='abgesagt') Belegungen berücksichtigt,
    // solange punkte_vergeben noch false war (was beim Abmelden nicht geändert wird).
    // Dadurch bekamen User Punkte für Schichten, aus denen sie sich abgemeldet hatten.
    const { data: belegungen, error: belegungError } = await supabase
      .from("schichtbelegungen")
      .select("id, mitglied_id, schicht_id")
      .eq("punkte_vergeben", false)
      .eq("status", "Angemeldet")
      .in("schicht_id", schichtIds);

    if (belegungError) {
      return new Response(
        JSON.stringify({ erfolg: false, fehler: belegungError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!belegungen || belegungen.length === 0) {
      return new Response(
        JSON.stringify({ erfolg: true, vergeben: 0, info: "Alle Punkte bereits vergeben" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let vergeben = 0;
    let fehler = 0;

    for (const b of belegungen) {
      const schicht = schichtMap[b.schicht_id];
      const punkte = schicht?.punkte ?? 0;
      const schichtName = schicht?.bezeichnung ?? "Schicht";
      const eventName = eventNameMap[schicht?.veranstaltung_id] ?? "Veranstaltung";

      const { error: punkteError } = await supabase.rpc("add_punkte", {
        user_id: b.mitglied_id,
        amount: punkte,
      });

      if (punkteError) { fehler++; continue; }

      const { error: updateError } = await supabase
        .from("schichtbelegungen")
        .update({ punkte_vergeben: true })
        .eq("id", b.id);

      if (updateError) { fehler++; continue; }

      await supabase.rpc("increment_schichten_count", {
        user_id: b.mitglied_id,
      });

      await supabase.from("benachrichtigungen").insert({
        mitglied_id: b.mitglied_id,
        typ: "punkte",
        titel: `+${punkte} Punkte erhalten`,
        nachricht: `Danke für deinen Einsatz bei „${schichtName}" (${eventName}).`,
        punkte,
        gelesen: false,
      });

      vergeben++;
    }

    return new Response(
      JSON.stringify({ erfolg: true, vergeben, fehler, gesamt: belegungen.length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ erfolg: false, fehler: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});