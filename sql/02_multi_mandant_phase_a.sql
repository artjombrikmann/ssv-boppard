-- =====================================================================
-- 02_multi_mandant_phase_a.sql  –  Schichtmeister
-- PHASE A = "Expand": Struktur für mehrere Vereine anlegen.
--
-- WICHTIG: Diese Phase ist ABWÄRTSKOMPATIBEL. Die aktuell laufende App
-- (nur Boppard) funktioniert unverändert weiter:
--   * es wird nichts gelöscht und keine bestehende Policy geändert
--   * alle neuen verein_id-Spalten haben den Default "Boppard"
--   * profiles.is_admin / punkte / schichten_count bleiben vorerst bestehen
--   * Unique-Constraints (kategorien.name, push_subscriptions.user_id)
--     bleiben, bis das Frontend umgestellt ist (Phase B)
--
-- Phase B (RLS pro Verein, Mitgliedschaften als Quelle für Punkte/Admin,
-- Constraint-Umbau, Defaults entfernen) folgt zusammen mit dem Frontend.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0) Sicherheitsnetz (Free-Plan hat keine Backups):
--    Kopie aller betroffenen Tabellen in ein eigenes Schema.
--    Dieses Schema ist nicht über die API erreichbar.
-- ---------------------------------------------------------------------
create schema if not exists backup_pre_mt;

create table backup_pre_mt.profiles                    as select * from public.profiles;
create table backup_pre_mt.veranstaltungen             as select * from public.veranstaltungen;
create table backup_pre_mt.schichten                   as select * from public.schichten;
create table backup_pre_mt.schichtbelegungen           as select * from public.schichtbelegungen;
create table backup_pre_mt.kategorien                  as select * from public.kategorien;
create table backup_pre_mt.einstellungen               as select * from public.einstellungen;
create table backup_pre_mt.preise                      as select * from public.preise;
create table backup_pre_mt.punkteregeln                as select * from public.punkteregeln;
create table backup_pre_mt.schicht_vorlagen            as select * from public.schicht_vorlagen;
create table backup_pre_mt.schicht_vorlagen_positionen as select * from public.schicht_vorlagen_positionen;
create table backup_pre_mt.shop_anfragen               as select * from public.shop_anfragen;
create table backup_pre_mt.gutschein_anfragen          as select * from public.gutschein_anfragen;
create table backup_pre_mt.benachrichtigungen          as select * from public.benachrichtigungen;
create table backup_pre_mt.push_subscriptions          as select * from public.push_subscriptions;

-- ---------------------------------------------------------------------
-- 1) Vereine
-- ---------------------------------------------------------------------
create table public.vereine (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null check (slug ~ '^[a-z0-9-]+$'),
  name             text not null,
  logo_url         text,
  farbe_primary    text not null default '#0d631b',   -- Boppard-Farbe später anpassen
  farbe_secondary  text,
  aktiv            boolean not null default true,
  created_at       timestamptz not null default now()
);

alter table public.vereine enable row level security;
-- bewusst keine Policy: Zugriff nur über die View unten bzw. Service Role

-- Boppard mit fester ID (wird als Default für alle verein_id-Spalten genutzt)
insert into public.vereine (id, slug, name)
values ('5b0bba2d-0000-4000-8000-000000000001', 'boppard', 'SSV Boppard')
on conflict (id) do nothing;

-- Öffentliche Branding-Daten für Login-Seite / Theming (nur unkritische Spalten).
-- Die View läuft bewusst mit Owner-Rechten, damit auch nicht eingeloggte
-- Besucher Logo und Farben ihres Vereins sehen.
create or replace view public.vereine_public as
  select slug, name, logo_url, farbe_primary, farbe_secondary
  from public.vereine
  where aktiv;

grant select on public.vereine_public to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Mitgliedschaften (ein Account, mehrere Vereine)
-- ---------------------------------------------------------------------
create table public.mitgliedschaften (
  user_id          uuid not null references public.profiles(id) on delete cascade,
  verein_id        uuid not null references public.vereine(id)  on delete cascade,
  is_admin         boolean not null default false,
  is_trainer       boolean not null default false,
  punkte           integer not null default 0,
  schichten_count  integer not null default 0,
  created_at       timestamptz not null default now(),
  primary key (user_id, verein_id)
);

create index mitgliedschaften_verein_id_idx on public.mitgliedschaften (verein_id);

alter table public.mitgliedschaften enable row level security;

create policy "eigene mitgliedschaften lesen"
  on public.mitgliedschaften
  for select
  using (user_id = auth.uid());
-- Schreiben nur über Service Role / SECURITY DEFINER-Funktionen (Phase B)

-- Backfill: alle bestehenden Profile (inkl. Temp-User) -> Boppard.
-- In Phase B wird das vor dem Umschalten noch einmal aufgefrischt.
insert into public.mitgliedschaften (user_id, verein_id, is_admin, punkte, schichten_count)
select id,
       '5b0bba2d-0000-4000-8000-000000000001',
       coalesce(is_admin, false),
       coalesce(punkte, 0),
       coalesce(schichten_count, 0)
from public.profiles
on conflict (user_id, verein_id) do nothing;

-- ---------------------------------------------------------------------
-- 3) verein_id an alle vereinsbezogenen Tabellen
--    "ADD COLUMN ... NOT NULL DEFAULT <konstante>" füllt bestehende
--    Zeilen ohne UPDATE – es feuern also keine Trigger
--    (wichtig wegen trigger_sync_schicht_timestamps).
--    Nicht enthalten:
--      schichtbelegungen, schicht_vorlagen_positionen -> erben den Verein
--        über schichten bzw. schicht_vorlagen
--      trikot_wuensche -> bleibt Boppard-spezifisch
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  boppard constant uuid := '5b0bba2d-0000-4000-8000-000000000001';
begin
  foreach t in array array[
    'veranstaltungen', 'schichten', 'kategorien', 'einstellungen',
    'preise', 'punkteregeln', 'schicht_vorlagen',
    'shop_anfragen', 'gutschein_anfragen', 'benachrichtigungen',
    'push_subscriptions'
  ]
  loop
    execute format(
      'alter table public.%I add column if not exists verein_id uuid not null default %L references public.vereine(id)',
      t, boppard
    );
    execute format(
      'create index if not exists %I on public.%I (verein_id)',
      t || '_verein_id_idx', t
    );
  end loop;
end
$$;

-- einstellungen: genau eine Zeile pro Verein
alter table public.einstellungen
  add constraint einstellungen_verein_id_key unique (verein_id);

-- ---------------------------------------------------------------------
-- 4) Registrierung: neue User bekommen direkt eine Mitgliedschaft.
--    Die App sendet künftig 'verein_slug' in den User-Metadaten
--    (signUp -> options.data). Fehlt er (alte App-Version), gilt Boppard.
--    Profil-Insert ist unverändert gegenüber der bisherigen Funktion.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug   text := coalesce(nullif(NEW.raw_user_meta_data->>'verein_slug', ''), 'boppard');
  v_verein uuid;
begin
  select id into v_verein from public.vereine where slug = v_slug and aktiv;

  if v_verein is null then
    raise exception 'Unbekannter Verein: %', v_slug;
  end if;

  insert into public.profiles (
    id, name, email, display_name,
    punkte, schichten_count, is_admin,
    consent_rangliste, consent_dsgvo, consent_erinnerung,
    datenschutz_akzeptiert, nutzungsbedingungen_akzeptiert,
    newsletter_akzeptiert, einwilligung_datum, created_at
  ) values (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'name', 'Unbekannt'),
    NEW.email,
    coalesce(NEW.raw_user_meta_data->>'display_name',
             split_part(coalesce(NEW.raw_user_meta_data->>'name', 'Unbekannt'), ' ', 1)),
    0, 0, false, false, false, false, false, false, false,
    now(), now()
  );

  insert into public.mitgliedschaften (user_id, verein_id)
  values (NEW.id, v_verein)
  on conflict (user_id, verein_id) do nothing;

  return NEW;
end;
$$;

commit;

-- ---------------------------------------------------------------------
-- Kontrolle (soll überall passen):
-- ---------------------------------------------------------------------
select
  (select count(*) from public.profiles)                                  as profile,
  (select count(*) from public.mitgliedschaften)                          as mitgliedschaften,
  (select count(*) from public.schichten)                                 as schichten,
  (select count(*) from backup_pre_mt.schichten)                          as schichten_backup,
  (select count(*) from public.schichten where startzeit_ts is null)      as schichten_ohne_ts,
  (select count(*) from backup_pre_mt.schichten where startzeit_ts is null) as schichten_ohne_ts_backup,
  (select count(*) from public.vereine)                                   as vereine;

-- ---------------------------------------------------------------------
-- TESTS danach:
--   [ ] App öffnen, einloggen, Marktplatz / Meine Schichten / Verwaltung laden
--   [ ] Neuen Test-User registrieren -> Profil UND Zeile in mitgliedschaften
--   [ ] Admin: Event + Schichten anlegen (verein_id wird per Default gesetzt)
-- ---------------------------------------------------------------------
