-- =====================================================================
-- 04k: Anonymen Lesezugriff sperren (Sofortmaßnahme, vor dem DB-Switch)
--
-- BEFUND (2026-11-11, Abfrage mit dem öffentlichen Anon-Key, ohne Login):
--   profiles 76 Zeilen (Namen, E-Mail, Punkte), einstellungen 1 (Freischaltcode, Admin-Mail),
--   schichtbelegungen 119, schichten 88, push_subscriptions 2, preise 3
-- sind von JEDEM lesbar, der den Anon-Key aus dem Frontend nimmt.
--
-- Diese Datei sperrt nur den Zugriff OHNE Anmeldung für die sensiblen Tabellen. Eingeloggte
-- Nutzer sehen weiterhin alles wie bisher (der eigentliche Schutz zwischen Mitgliedern und
-- Vereinen kommt mit sql/05_b3_switch.sql).
--
-- Technik: eine RESTRIKTIVE Policy je Tabelle. Sie wird mit den bestehenden Policies UND-verknüpft
-- und lässt nur zu, wer angemeldet ist (auth.uid() is not null). Keine bestehende Policy wird
-- verändert oder gelöscht. Zurücknehmen: die 6 Policies löschen (siehe ROLLBACK).
--
-- Nicht betroffen: vereine_public (View, bewusst öffentlich), trikot_wuensche (Public insert/read,
-- Boppard-Wunschliste, getrennt zu klären), alle Schreibzugriffe, Edge Functions (Service Role).
--
-- Nebenwirkung: Eine sehr alte App-Version (vor 2026-11-09) liest den Freischaltcode vor dem
-- Registrieren ohne Anmeldung. Damit scheitert dort NUR die Registrierung (Fehlermeldung, kein
-- Datenverlust), bis die App sich aktualisiert. Die aktuelle App ist nicht betroffen.
--
-- Keine Secrets. Wiederholbar. Kann JETZT ausgeführt werden.
-- =====================================================================

begin;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'einstellungen', 'schichtbelegungen', 'schichten', 'push_subscriptions', 'preise'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_nur_angemeldet', t);
    execute format(
      'create policy %I on public.%I as restrictive for select to public using (auth.uid() is not null)',
      t || '_nur_angemeldet', t);
  end loop;
end $$;

commit;

-- =====================================================================
-- KONTROLLE 1: Die 6 Policies existieren (erwartet: 6 Zeilen, alle "RESTRICTIVE")
select tablename, policyname, permissive
  from pg_policies
 where schemaname = 'public' and policyname like '%\_nur\_angemeldet' escape '\'
 order by tablename;

-- KONTROLLE 1b (VORHER ausführen, nur lesen): Wem gehören die security-definer-Funktionen und Trigger-Funktionen?
-- Besitzer 'postgres' umgeht RLS, dann laufen Registrierung (handle_new_user) und sync_belegt unverändert.
-- Steht dort ein anderer Besitzer, vor dem Ausführen melden.
--   select p.proname, pg_get_userbyid(p.proowner) as besitzer, p.prosecdef as security_definer
--     from pg_proc p where p.pronamespace = 'public'::regnamespace
--      and p.proname in ('handle_new_user', 'sync_belegt', 'handle_email_confirmed', 'sync_schicht_timestamps',
--                        'notify_gutschein_anfrage', 'trg_schichten_verein', 'rangliste')
--     order by 1;
-- erwartet: besitzer = postgres

-- KONTROLLE 2 (von aussen, im Terminal; erwartet: überall [] bzw. Zeilen 0). Ersetze <ANON_KEY> durch den
-- öffentlichen Key aus src/supabaseClient.ts:
--   curl -s "https://kfawjltveddyoqewayzh.supabase.co/rest/v1/profiles?select=id&limit=1" \
--        -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
--   -- erwartet: []
--
-- KONTROLLE 3 (SOFORT danach, mit dem Test-Account in der App): Login, Home, Marktplatz, Rangliste,
-- Profil und Shop laden wie vorher, eine Schicht an- und abmelden. Admin: Tab "Admin" öffnen.

-- ROLLBACK (macht alles rückgängig, ohne Datenverlust):
--   drop policy if exists profiles_nur_angemeldet           on public.profiles;
--   drop policy if exists einstellungen_nur_angemeldet      on public.einstellungen;
--   drop policy if exists schichtbelegungen_nur_angemeldet  on public.schichtbelegungen;
--   drop policy if exists schichten_nur_angemeldet          on public.schichten;
--   drop policy if exists push_subscriptions_nur_angemeldet on public.push_subscriptions;
--   drop policy if exists preise_nur_angemeldet             on public.preise;
