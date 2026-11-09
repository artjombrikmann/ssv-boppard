-- =====================================================================
-- 04a: Multi-Mandant B1 (additiv), Teil 1 "Grundlagen"   (AP 3)
--
-- Für die laufende App unsichtbar: es wird nichts gelöscht, keine bestehende
-- Policy geändert, keine bestehende Funktion ersetzt.
--
--  1. Plattform-Admins + ist_plattform_admin()
--  2. vereine: neue Spalten, Boppard-Backfill, View vereine_public erweitert
--  3. RLS-Hilfsfunktionen (meine_vereine, ist_admin_von, ...)
--  4. vereins_geheimnisse (Freischaltcode, Admin-Mail) + Kopie aus einstellungen
--  5. Trigger: schichten.verein_id immer aus der Veranstaltung
--  6. Einwilligungen pro Mitgliedschaft + Backfill
--  7. Zusätzliche Constraints (die alten bleiben bis AP 5)
--  8. Letzter-Admin-Schutz
--  9. cron_laeufe (Monitor)
--
-- Reihenfolge: ZUERST diese Datei, DANN 04b. Keine Platzhalter, keine Secrets.
-- Am besten an einem Tag ohne Event ausführen.
-- =====================================================================

-- VORAB (nur lesen, Ergebnis aufbewahren):
--   select count(*) from public.mitgliedschaften;   -- Vergleichswert für Kontrolle 1

begin;

-- 0) Sicherheitsnetz für die Tabellen, deren DATEN diese Datei ändert.
create schema if not exists backup_pre_mt;
create table if not exists backup_pre_mt.vereine_vor_04            as select * from public.vereine;
create table if not exists backup_pre_mt.mitgliedschaften_vor_04   as select * from public.mitgliedschaften;

-- ---------------------------------------------------------------------
-- 1) Plattform-Admins (bewusst keine Policy: Zugriff nur über Funktionen)
-- ---------------------------------------------------------------------
create table if not exists public.plattform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade
);
alter table public.plattform_admins enable row level security;

create or replace function public.ist_plattform_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.plattform_admins where user_id = auth.uid())
$$;

-- ---------------------------------------------------------------------
-- 2) vereine: Icons, Features, Rechts-/Kontaktangaben
-- ---------------------------------------------------------------------
alter table public.vereine
  add column if not exists icon_192_url text,
  add column if not exists icon_512_url text,
  add column if not exists features     jsonb not null default '{}'::jsonb,
  add column if not exists rechtsname   text,
  add column if not exists anschrift    text,
  add column if not exists plz_ort      text,
  add column if not exists land         text default 'Deutschland',
  add column if not exists kontakt_email text,
  add column if not exists vertretung   text;

-- Boppard: Features einschalten (sonst würde das Frontend in AP 4 Shop/Trikot
-- ausblenden) und die Angaben setzen, die im Code schon stehen
-- (Login.tsx, Datenschutztext). Anschrift, PLZ/Ort und Vertretung (Vorsitz)
-- sind im Code NICHT vorhanden und bleiben leer, bitte später ergänzen.
update public.vereine
   set features = case when features = '{}'::jsonb
                       then '{"shop": true, "trikot": true}'::jsonb else features end,
       rechtsname    = coalesce(rechtsname,    'SSV Boppard 1920 e.V.'),
       kontakt_email = coalesce(kontakt_email, 'info@ssv-boppard.de')
 where id = '5b0bba2d-0000-4000-8000-000000000001';

-- View erweitern (neue Spalten nur am Ende anhängen, das erlaubt CREATE OR REPLACE).
-- Läuft bewusst mit Owner-Rechten (auch nicht eingeloggte Besucher sehen das Branding).
create or replace view public.vereine_public as
  select slug, name, logo_url, farbe_primary, farbe_secondary,
         icon_192_url, icon_512_url, features,
         rechtsname, anschrift, plz_ort, land, kontakt_email, vertretung
    from public.vereine
   where aktiv;

grant select on public.vereine_public to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) Hilfsfunktionen für RLS (alle security definer, stable)
--    Sie liefern für nicht eingeloggte Aufrufer (auth.uid() is null) leere
--    bzw. false-Ergebnisse. Execute bleibt bewusst bei allen Rollen, weil
--    Policies sie im Namen des anfragenden Users aufrufen.
-- ---------------------------------------------------------------------
create or replace function public.meine_vereine()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select verein_id from public.mitgliedschaften where user_id = auth.uid()
$$;

create or replace function public.ist_admin_von(p_verein uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.mitgliedschaften
                  where user_id = auth.uid() and verein_id = p_verein and is_admin)
$$;

create or replace function public.verein_der_schicht(p_schicht bigint)
returns uuid
language sql stable security definer set search_path = public
as $$
  select verein_id from public.schichten where id = p_schicht
$$;

-- Ist der Aufrufer Admin in mindestens einem Verein, in dem p_user Mitglied ist?
create or replace function public.ist_admin_ueber_nutzer(p_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from public.mitgliedschaften ich
      join public.mitgliedschaften ziel on ziel.verein_id = ich.verein_id
     where ich.user_id = auth.uid() and ich.is_admin
       and ziel.user_id = p_user)
$$;

-- Teilt der Aufrufer mindestens einen Verein mit p_user?
create or replace function public.teilt_verein_mit(p_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from public.mitgliedschaften ich
      join public.mitgliedschaften ziel on ziel.verein_id = ich.verein_id
     where ich.user_id = auth.uid() and ziel.user_id = p_user)
$$;

-- ---------------------------------------------------------------------
-- 4) Geheimnisse pro Verein (Freischaltcode, Admin-Mail)
--    einstellungen.freischaltcode / admin_email bleiben bis AP 6 bestehen
--    (alte App-Versionen). Die Werte werden hier KOPIERT, nicht ausgegeben.
-- ---------------------------------------------------------------------
create table if not exists public.vereins_geheimnisse (
  verein_id      uuid primary key references public.vereine(id) on delete cascade,
  freischaltcode text,
  admin_email    text
);
alter table public.vereins_geheimnisse enable row level security;

drop policy if exists geheimnisse_admin on public.vereins_geheimnisse;
create policy geheimnisse_admin on public.vereins_geheimnisse
  for all
  using      (public.ist_admin_von(verein_id))
  with check (public.ist_admin_von(verein_id));

insert into public.vereins_geheimnisse (verein_id, freischaltcode, admin_email)
select verein_id, freischaltcode, admin_email from public.einstellungen
on conflict (verein_id) do nothing;

-- ---------------------------------------------------------------------
-- 5) schichten.verein_id immer aus der Veranstaltung ableiten.
--    Ohne Veranstaltung (veranstaltung_id is null) oder bei unbekannter ID
--    bleibt die bestehende verein_id. Unabhängig vom bestehenden Trigger
--    trigger_sync_schicht_timestamps.
-- ---------------------------------------------------------------------
create or replace function public.trg_schichten_verein()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_verein uuid;
begin
  if new.veranstaltung_id is not null then
    select verein_id into v_verein from public.veranstaltungen where id = new.veranstaltung_id;
    if v_verein is not null then
      new.verein_id := v_verein;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_schichten_verein on public.schichten;
create trigger trigger_schichten_verein
  before insert or update of veranstaltung_id on public.schichten
  for each row execute function public.trg_schichten_verein();

-- ---------------------------------------------------------------------
-- 6) Einwilligungen pro Mitgliedschaft
-- ---------------------------------------------------------------------
alter table public.mitgliedschaften
  add column if not exists consent_rangliste                    boolean not null default false,
  add column if not exists consent_erinnerung                   boolean not null default false,
  add column if not exists datenschutz_akzeptiert_am            timestamptz,
  add column if not exists nutzungsbedingungen_akzeptiert_am    timestamptz,
  add column if not exists einwilligung_quelle                  text;

-- Backfill Boppard: Die Checkboxen waren im UI Pflicht, wurden aber nie
-- gespeichert. Bestandsnutzer gelten als "zugestimmt zum Registrierungsdatum".
-- Gäste (is_temp) bleiben ausgenommen.
-- RECHTLICH VON ARTJOM GEGENZUPRÜFEN (siehe PHASE_B_MULTI_MANDANT.md, Entscheidungen).
update public.mitgliedschaften m
   set consent_rangliste                 = true,
       consent_erinnerung                = true,
       datenschutz_akzeptiert_am         = p.created_at,
       nutzungsbedingungen_akzeptiert_am = p.created_at,
       einwilligung_quelle               = 'backfill-ui-pflicht'
  from public.profiles p
 where p.id = m.user_id
   and m.verein_id = '5b0bba2d-0000-4000-8000-000000000001'
   and not coalesce(p.is_temp, false)
   and m.einwilligung_quelle is null;

-- ---------------------------------------------------------------------
-- 7) Zusätzliche Constraints (die alten kategorien_name_key und
--    push_subscriptions_user_id_key bleiben bis AP 5/6)
-- ---------------------------------------------------------------------
alter table public.kategorien
  drop constraint if exists kategorien_verein_id_name_key;
alter table public.kategorien
  add constraint kategorien_verein_id_name_key unique (verein_id, name);

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_user_id_verein_id_key;
alter table public.push_subscriptions
  add constraint push_subscriptions_user_id_verein_id_key unique (user_id, verein_id);

-- ---------------------------------------------------------------------
-- 8) Letzter Admin: ein Verein darf nicht ohne Admin zurückbleiben.
--    Gilt für das Entziehen der Admin-Rolle und für das Löschen der
--    Mitgliedschaft (auch per Kaskade beim Löschen eines Kontos).
--    Wird der ganze Verein gelöscht, ist die Zeile in vereine bereits weg,
--    dann greift die Sperre nicht.
-- ---------------------------------------------------------------------
create or replace function public.trg_letzter_admin()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_anderer_admin boolean;
begin
  if tg_op = 'DELETE' then
    if old.is_admin and exists (select 1 from public.vereine where id = old.verein_id) then
      select exists (select 1 from public.mitgliedschaften m
                      where m.verein_id = old.verein_id and m.is_admin
                        and m.user_id <> old.user_id) into v_anderer_admin;
      if not v_anderer_admin then
        raise exception 'Der letzte Admin eines Vereins kann nicht entfernt werden';
      end if;
    end if;
    return old;
  end if;

  -- UPDATE of is_admin
  if old.is_admin and not new.is_admin then
    select exists (select 1 from public.mitgliedschaften m
                    where m.verein_id = old.verein_id and m.is_admin
                      and m.user_id <> old.user_id) into v_anderer_admin;
    if not v_anderer_admin then
      raise exception 'Der letzte Admin eines Vereins kann nicht entfernt werden';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_letzter_admin on public.mitgliedschaften;
create trigger trigger_letzter_admin
  before update of is_admin or delete on public.mitgliedschaften
  for each row execute function public.trg_letzter_admin();

-- ---------------------------------------------------------------------
-- 9) Cron-Monitor (nur Service Role, bewusst keine Policy)
-- ---------------------------------------------------------------------
create table if not exists public.cron_laeufe (
  id           bigint generated always as identity primary key,
  job          text not null,
  verein_id    uuid references public.vereine(id) on delete set null,
  gestartet_am timestamptz not null default now(),
  ok           integer not null default 0,
  fehler       integer not null default 0,
  details      jsonb
);
alter table public.cron_laeufe enable row level security;
create index if not exists cron_laeufe_job_idx on public.cron_laeufe (job, gestartet_am desc);

commit;

-- ---------------------------------------------------------------------
-- KONTROLLE 1 (soll überall passen):
-- ---------------------------------------------------------------------
select
  (select count(*) from public.mitgliedschaften)                                        as mitgliedschaften,
  (select count(*) from backup_pre_mt.mitgliedschaften_vor_04)                          as mitgliedschaften_backup,
  (select count(*) from public.vereins_geheimnisse)                                     as geheimnisse,
  (select count(*) from public.vereine)                                                 as vereine,
  (select count(*) from public.mitgliedschaften
    where einwilligung_quelle = 'backfill-ui-pflicht')                                  as backfill_consents,
  (select count(*) from public.profiles where not coalesce(is_temp,false))              as profile_ohne_gaeste,
  (select features from public.vereine where slug = 'boppard')                          as boppard_features;
-- erwartet: mitgliedschaften = mitgliedschaften_backup, geheimnisse = 1,
--           backfill_consents = profile_ohne_gaeste, boppard_features enthält shop und trikot.

-- KONTROLLE 2 (separat ausführen): Admin-Stand in profiles und mitgliedschaften gleich?
--   select p.id, p.is_admin as profil_admin, m.is_admin as mitgliedschaft_admin
--     from public.profiles p join public.mitgliedschaften m on m.user_id = p.id
--    where m.verein_id = '5b0bba2d-0000-4000-8000-000000000001'
--      and coalesce(p.is_admin,false) <> m.is_admin;
-- erwartet: 0 Zeilen. Jede Zeile = Admin, der nur in einer der beiden Tabellen steht
-- (die neuen Policies lesen mitgliedschaften). Bitte VOR AP 5 angleichen.

-- ---------------------------------------------------------------------
-- ROLLBACK (einzeln, nur falls etwas bricht):
--   drop trigger if exists trigger_letzter_admin on public.mitgliedschaften;
--   drop trigger if exists trigger_schichten_verein on public.schichten;
--   alter table public.kategorien        drop constraint if exists kategorien_verein_id_name_key;
--   alter table public.push_subscriptions drop constraint if exists push_subscriptions_user_id_verein_id_key;
--   drop table if exists public.cron_laeufe, public.vereins_geheimnisse, public.plattform_admins;
--   alter table public.mitgliedschaften
--     drop column consent_rangliste, drop column consent_erinnerung,
--     drop column datenschutz_akzeptiert_am, drop column nutzungsbedingungen_akzeptiert_am,
--     drop column einwilligung_quelle;
--   -- View vereine_public: Definition aus 02_multi_mandant_phase_a.sql (nur 5 Spalten) neu anlegen,
--   --   dafür vorher "drop view public.vereine_public;"
--   -- Funktionen (drop function ...): meine_vereine, ist_admin_von, verein_der_schicht,
--   --   ist_admin_ueber_nutzer, teilt_verein_mit, ist_plattform_admin,
--   --   trg_schichten_verein, trg_letzter_admin
-- ---------------------------------------------------------------------
