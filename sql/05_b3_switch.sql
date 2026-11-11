-- =====================================================================
-- 05_b3_switch.sql  –  DB-Switch: Row Level Security pro Verein   (AP 5)
--
-- !!! NICHT AUSFÜHREN, bevor alle Punkte in "AP5_VORBEREITUNG.md" abgehakt sind !!!
-- Nur nachts, an einem Tag ohne Event. Dauert wenige Sekunden.
--
-- Was diese Datei tut (alles in EINER Transaktion: bei einem Fehler wird nichts geändert):
--   0. Prüft die Voraussetzungen und bricht ab, wenn eine fehlt
--   1. Sichert alle bestehenden Policies in backup_pre_b3.policies (der Rollback spielt sie von dort zurück)
--   2. Zieht fehlende Mitgliedschaften nach (ohne Punkte zu überschreiben)
--   3. Ersetzt ALLE Policies der Vereinstabellen durch Policies pro Verein
--   4. Entfernt die alten Unique-Constraints, die nur für EINEN Verein galten
--   5. Entfernt den alten Gutschein-Trigger NICHT (siehe Hinweis unten)
--
-- Keine Secrets, keine Platzhalter.
-- Rollback: 05_b3_rollback.sql (liest backup_pre_b3.policies)
--
-- HINWEIS Gutschein-Trigger: Der Trigger trigger_gutschein_mail bleibt, bis der neue Weg
-- (shop_einloesen und der Trigger auf shop_anfragen) im Frontend live ist (AP 4.4). Wird er vorher
-- entfernt, gehen keine Gutschein-Mails mehr raus.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0) Voraussetzungen. Fehlt etwas, bricht die Datei hier ab und ändert nichts.
-- ---------------------------------------------------------------------
do $$
declare
  fehlt text := '';
  f text;
begin
  -- Funktionen aus 04a, 04b, 04j
  foreach f in array array[
    'public.meine_vereine()', 'public.ist_admin_von(uuid)', 'public.verein_der_schicht(bigint)',
    'public.ist_admin_ueber_nutzer(uuid)', 'public.teilt_verein_mit(uuid)', 'public.ist_plattform_admin()',
    'public.rangliste(uuid)', 'public.vereins_mitglieder(uuid)', 'public.temp_user_anlegen(uuid,text,text,text)',
    'public.schicht_teilnehmer(bigint)', 'public.belegungen_offen(uuid)',
    'public.punkte_abziehen(uuid,uuid,integer)', 'public.add_punkte(uuid,uuid,integer)'
  ] loop
    if to_regprocedure(f) is null then fehlt := fehlt || ' ' || f; end if;
  end loop;
  if fehlt <> '' then raise exception 'Voraussetzung fehlt, Funktionen:%', fehlt; end if;

  -- Backup-Schema muss frisch sein (Sicherung vor dem Switch)
  if to_regclass('backup_pre_b3.profiles') is null then
    raise exception 'backup_pre_b3 fehlt: Backup-Kopien vor dem Switch anlegen (siehe AP5_VORBEREITUNG.md, Schritt 3)';
  end if;

  -- Es darf nur EIN Verein existieren: Ein zweiter würde mit den alten, offenen Policies sichtbar
  -- und vor allem das alte Frontend (einstellungen .single()) brechen. Spay kommt NACH dem Switch.
  if (select count(*) from public.vereine) <> 1 then
    raise exception 'Es gibt mehr als einen Verein. Spay erst NACH dem Switch anlegen.';
  end if;
  if (select count(*) from public.einstellungen) <> 1 then
    raise exception 'einstellungen hat nicht genau eine Zeile';
  end if;

  -- Jede Verein-Zeile muss dem einen Verein gehören (sonst würden Daten unsichtbar)
  if exists (select 1 from public.schichten s where not exists (select 1 from public.vereine v where v.id = s.verein_id)) then
    raise exception 'Schichten ohne gültigen Verein';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) Alte Policies sichern (der Rollback spielt sie von hier zurück)
-- ---------------------------------------------------------------------
create schema if not exists backup_pre_b3;

create table if not exists backup_pre_b3.policies as
  select now() as gesichert_am, schemaname, tablename, policyname, permissive, roles::text[] as roles, cmd, qual, with_check
    from pg_policies where false;

delete from backup_pre_b3.policies;

insert into backup_pre_b3.policies
  select now(), schemaname, tablename, policyname, permissive, roles::text[], cmd, qual, with_check
    from pg_policies
   where schemaname = 'public';

-- Auch die RLS-Schalter der Tabellen sichern
create table if not exists backup_pre_b3.rls_status as
  select now() as gesichert_am, c.relname as tabelle, c.relrowsecurity as rls_an
    from pg_class c where false;
delete from backup_pre_b3.rls_status;
insert into backup_pre_b3.rls_status
  select now(), c.relname, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r';

-- ---------------------------------------------------------------------
-- 2) Fehlende Mitgliedschaften nachziehen. KEINE Punkte überschreiben (do nothing).
-- ---------------------------------------------------------------------
insert into public.mitgliedschaften (user_id, verein_id, is_admin, punkte, schichten_count)
select id, '5b0bba2d-0000-4000-8000-000000000001',
       coalesce(is_admin, false), coalesce(punkte, 0), coalesce(schichten_count, 0)
  from public.profiles
on conflict (user_id, verein_id) do nothing;

-- ---------------------------------------------------------------------
-- 3) Policies. Zuerst ALLE alten der betroffenen Tabellen entfernen, dann neu anlegen.
--    Nicht in der Liste (bleiben unberührt): trikot_wuensche (nur Boppard, "Public insert/read"),
--    plattform_admins, cron_laeufe, beitritt_versuche, reset_versuche (RLS an, keine Policy),
--    vereins_geheimnisse und event_typen (Policies aus 04a/04b sind schon pro Verein).
-- ---------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in
    select tablename, policyname from pg_policies
     where schemaname = 'public'
       and tablename in (
         'vereine', 'mitgliedschaften', 'profiles',
         'veranstaltungen', 'schichten', 'kategorien', 'punkteregeln', 'preise', 'einstellungen', 'schicht_vorlagen',
         'schichtbelegungen', 'schicht_vorlagen_positionen',
         'shop_anfragen', 'gutschein_anfragen', 'benachrichtigungen', 'push_subscriptions')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- RLS sicher einschalten (bei vereine bewusst ohne Policy: Zugriff nur über die View vereine_public)
alter table public.vereine                     enable row level security;
alter table public.mitgliedschaften            enable row level security;
alter table public.profiles                    enable row level security;
alter table public.veranstaltungen             enable row level security;
alter table public.schichten                   enable row level security;
alter table public.kategorien                  enable row level security;
alter table public.punkteregeln                enable row level security;
alter table public.preise                      enable row level security;
alter table public.einstellungen               enable row level security;
alter table public.schicht_vorlagen            enable row level security;
alter table public.schichtbelegungen           enable row level security;
alter table public.schicht_vorlagen_positionen enable row level security;
alter table public.shop_anfragen               enable row level security;
alter table public.gutschein_anfragen          enable row level security;
alter table public.benachrichtigungen          enable row level security;
alter table public.push_subscriptions          enable row level security;

-- 3a) mitgliedschaften: eigene lesen; Admin liest alle des Vereins. Schreiben nur über Funktionen / Service Role.
create policy mitgliedschaften_lesen on public.mitgliedschaften
  for select using (user_id = auth.uid() or public.ist_admin_von(verein_id));

-- 3b) profiles: eigene Zeile; Admin sieht Profile seiner Mitglieder. KEIN read_all mehr.
create policy profiles_lesen on public.profiles
  for select using (id = auth.uid() or public.ist_admin_ueber_nutzer(id));

-- Update: nur die eigene Zeile (die Spaltenrechte aus 01_hotfix begrenzen, WELCHE Spalten)
create policy profiles_eigene_aendern on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Insert: eigene Zeile (Registrierung läuft über den Trigger, der als Funktionsbesitzer schreibt).
-- Gäste legt die Funktion temp_user_anlegen an (security definer), nicht der Browser.
create policy profiles_eigene_anlegen on public.profiles
  for insert with check (id = auth.uid());

-- 3c) Tabellen mit verein_id: Mitglieder lesen, Admin des Vereins schreibt
do $$
declare
  t text;
begin
  foreach t in array array[
    'veranstaltungen', 'schichten', 'kategorien', 'punkteregeln', 'preise', 'einstellungen', 'schicht_vorlagen'
  ] loop
    execute format('create policy %I on public.%I for select using (verein_id in (select public.meine_vereine()))',
                   t || '_lesen', t);
    execute format('create policy %I on public.%I for all using (public.ist_admin_von(verein_id)) with check (public.ist_admin_von(verein_id))',
                   t || '_admin', t);
  end loop;
end $$;

-- einstellungen: enthält noch Freischaltcode und Admin-Mail (bis AP 6). Beides darf NICHT jedes Mitglied
-- lesen. Deshalb: Lesen nur für Admins; die Mitglieder-Werte (food_pts, shop_pts usw.) liefert später der
-- generische Shop über preise. Bis dahin braucht Shop.tsx/Profil.tsx den Lesezugriff:
drop policy if exists einstellungen_lesen on public.einstellungen;
create policy einstellungen_lesen on public.einstellungen
  for select using (verein_id in (select public.meine_vereine()));
-- ACHTUNG: Damit sieht jedes Mitglied auch freischaltcode und admin_email seines Vereins (wie bisher für alle).
-- Die Spalten werden in AP 6 entfernt, nachdem das Frontend sie nicht mehr liest.

-- 3d) schichtbelegungen: Lesen im eigenen Verein; Anmelden/Abmelden eigene Zeile oder Admin
create policy schichtbelegungen_lesen on public.schichtbelegungen
  for select using (public.verein_der_schicht(schicht_id) in (select public.meine_vereine()));
create policy schichtbelegungen_anlegen on public.schichtbelegungen
  for insert with check (
    public.verein_der_schicht(schicht_id) in (select public.meine_vereine())
    and (mitglied_id = auth.uid() or public.ist_admin_von(public.verein_der_schicht(schicht_id))));
create policy schichtbelegungen_aendern on public.schichtbelegungen
  for update using (
    mitglied_id = auth.uid() or public.ist_admin_von(public.verein_der_schicht(schicht_id)))
  with check (
    public.verein_der_schicht(schicht_id) in (select public.meine_vereine())
    and (mitglied_id = auth.uid() or public.ist_admin_von(public.verein_der_schicht(schicht_id))));
create policy schichtbelegungen_loeschen on public.schichtbelegungen
  for delete using (
    mitglied_id = auth.uid() or public.ist_admin_von(public.verein_der_schicht(schicht_id)));

-- 3e) schicht_vorlagen_positionen: über die Vorlage (die alte Policy "Alle Zugriffe erlaubt" entfällt)
create policy vorlagen_positionen_lesen on public.schicht_vorlagen_positionen
  for select using (exists (select 1 from public.schicht_vorlagen v
                             where v.id = vorlage_id and v.verein_id in (select public.meine_vereine())));
create policy vorlagen_positionen_admin on public.schicht_vorlagen_positionen
  for all using (exists (select 1 from public.schicht_vorlagen v
                          where v.id = vorlage_id and public.ist_admin_von(v.verein_id)))
  with check (exists (select 1 from public.schicht_vorlagen v
                       where v.id = vorlage_id and public.ist_admin_von(v.verein_id)));

-- 3f) shop_anfragen / gutschein_anfragen: eigene; Admin des Vereins alle. Einlösen nur über die Funktion.
create policy shop_anfragen_lesen on public.shop_anfragen
  for select using (user_id = auth.uid() or public.ist_admin_von(verein_id));
create policy shop_anfragen_admin_aendern on public.shop_anfragen
  for update using (public.ist_admin_von(verein_id)) with check (public.ist_admin_von(verein_id));

-- gutschein_anfragen: Das aktuelle Frontend (Shop.tsx, Profil.tsx) legt Anfragen noch direkt an.
-- Deshalb bleibt "eigene anlegen" erlaubt, bis shop_einloesen im Frontend live ist (AP 4.4, dann AP 6).
create policy gutschein_anfragen_lesen on public.gutschein_anfragen
  for select using (mitglied_id = auth.uid() or public.ist_admin_von(verein_id));
create policy gutschein_anfragen_anlegen on public.gutschein_anfragen
  for insert with check (mitglied_id = auth.uid() and verein_id in (select public.meine_vereine()));
create policy gutschein_anfragen_admin_aendern on public.gutschein_anfragen
  for update using (public.ist_admin_von(verein_id)) with check (public.ist_admin_von(verein_id));

-- 3g) benachrichtigungen: eigene lesen und als gelesen markieren. Anlegen nur per Service Role (Functions).
create policy benachrichtigungen_lesen on public.benachrichtigungen
  for select using (mitglied_id = auth.uid());
create policy benachrichtigungen_aendern on public.benachrichtigungen
  for update using (mitglied_id = auth.uid()) with check (mitglied_id = auth.uid());

-- 3h) push_subscriptions: eigene
create policy push_subscriptions_eigene on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid() and verein_id in (select public.meine_vereine()));

-- ---------------------------------------------------------------------
-- 4) Alte Constraints, die nur für EINEN Verein galten. Die neuen aus 04a bestehen schon.
-- ---------------------------------------------------------------------
alter table public.kategorien         drop constraint if exists kategorien_name_key;
alter table public.push_subscriptions drop constraint if exists push_subscriptions_user_id_key;

commit;

-- =====================================================================
-- KONTROLLEN (sofort nach dem Ausführen, einzeln)
-- =====================================================================
-- K1: Policies je Tabelle (keine Tabelle darf 0 haben, außer vereine)
--   select tablename, count(*) from pg_policies where schemaname = 'public' group by 1 order by 1;
-- K2: Es darf KEINE Policy mit "true" bzw. "authenticated"-Totalfreigabe mehr geben (außer trikot_wuensche)
--   select tablename, policyname, qual from pg_policies
--    where schemaname = 'public' and tablename <> 'trikot_wuensche'
--      and (qual = 'true' or qual ilike '%auth.role()%');
--   -- erwartet: 0 Zeilen
-- K3: Der Rollback hat seine Daten
--   select count(*) from backup_pre_b3.policies;   -- erwartet: > 0
-- Danach SOFORT die Pflichttests aus AP5_VORBEREITUNG.md (Boppard-Regression, Isolation).
