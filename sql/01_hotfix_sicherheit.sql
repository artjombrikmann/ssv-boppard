-- =====================================================================
-- 01_hotfix_sicherheit.sql  –  Schichtmeister
-- Schließt Lücken, die HEUTE schon von jedem eingeloggten User
-- (teils sogar ohne Login) ausgenutzt werden könnten.
-- Ändert KEIN Datenmodell. Läuft in einer Transaktion (alles oder nichts).
-- Im Supabase SQL Editor komplett ausführen.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) profiles: User dürfen nur harmlose Spalten selbst ändern.
--    Vorher konnte jeder per Browser-Konsole is_admin / punkte auf sich
--    selbst setzen (Policy "User kann eigenes Profil updaten" gilt für
--    die ganze Zeile).
--    Admin-Aktionen laufen über SECURITY DEFINER-Funktionen bzw.
--    Edge Functions (Service Role) und sind davon nicht betroffen.
-- ---------------------------------------------------------------------
revoke update on public.profiles from anon, authenticated;

grant update (
  name, display_name, email,
  consent_rangliste, consent_dsgvo, consent_erinnerung,
  datenschutz_akzeptiert, nutzungsbedingungen_akzeptiert,
  newsletter_akzeptiert, einwilligung_datum
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- 2) profiles: Temp-User-Profile nur noch durch Admins anlegbar.
--    Vorher durfte jeder (auch anonym) Profilzeilen mit is_temp = true
--    und beliebigen Punkten einfügen -> Rangliste manipulierbar.
-- ---------------------------------------------------------------------
drop policy if exists own_insert on public.profiles;

create policy own_insert on public.profiles
  for insert
  with check (
    auth.uid() = id
    or (
      is_temp = true
      and exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.is_admin = true
      )
    )
  );

-- ---------------------------------------------------------------------
-- 3) Punkte-Funktionen absichern.
--    Vorher: SECURITY DEFINER ohne Prüfung und für alle ausführbar ->
--    jeder konnte per rpc('add_punkte', {user_id: ich, amount: 99999})
--    beliebig Punkte vergeben.
--    Jetzt: erlaubt für Service Role / Cron (auth.uid() is null) und
--    Admins. punkte_abziehen zusätzlich für den User selbst (Shop),
--    aber nur mit positivem Betrag.
-- ---------------------------------------------------------------------
create or replace function public.add_punkte(user_id uuid, amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not exists (select 1 from profiles where id = auth.uid() and is_admin = true) then
    raise exception 'nicht erlaubt';
  end if;

  update profiles
  set punkte = coalesce(punkte, 0) + amount,
      schichten_count = coalesce(schichten_count, 0) + 1
  where id = user_id;
end;
$$;

create or replace function public.punkte_abziehen(user_id uuid, amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not exists (select 1 from profiles where id = auth.uid() and is_admin = true)
     and not (user_id = auth.uid() and amount > 0) then
    raise exception 'nicht erlaubt';
  end if;

  update profiles
  set punkte = coalesce(punkte, 0) - amount
  where id = user_id;
end;
$$;

create or replace function public.increment_schichten_count(user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not exists (select 1 from profiles where id = auth.uid() and is_admin = true) then
    raise exception 'nicht erlaubt';
  end if;

  update profiles
  set schichten_count = coalesce(schichten_count, 0) + 1
  where id = user_id;
end;
$$;

revoke execute on function public.add_punkte(uuid, integer)            from public, anon;
revoke execute on function public.punkte_abziehen(uuid, integer)       from public, anon;
revoke execute on function public.increment_schichten_count(uuid)      from public, anon;

-- ---------------------------------------------------------------------
-- 4) schichten: Policy "update_belegt" entfernen.
--    Sie erlaubte jedem eingeloggten User, JEDE Schicht in JEDER Spalte
--    zu ändern (Plätze, Punkte, Zeiten ...). Sie war nötig, weil der
--    Trigger sync_belegt mit den Rechten des anmeldenden Users lief.
--    Fix: Trigger-Funktion läuft jetzt als SECURITY DEFINER.
-- ---------------------------------------------------------------------
create or replace function public.sync_belegt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    update schichten
    set belegt = (select count(*) from schichtbelegungen where schicht_id = OLD.schicht_id)
    where id = OLD.schicht_id;
  else
    update schichten
    set belegt = (select count(*) from schichtbelegungen where schicht_id = NEW.schicht_id)
    where id = NEW.schicht_id;
  end if;
  return null;
end;
$$;

drop policy if exists update_belegt on public.schichten;

commit;

-- =====================================================================
-- TESTS direkt nach dem Ausführen (in der App, mit echten Accounts):
--   [ ] Normaler User: Schicht anmelden und wieder abmelden (belegt zählt)
--   [ ] Normaler User: Profil/Einwilligungen speichern
--   [ ] Normaler User: Shop-Anfrage stellen (Punkte werden abgezogen)
--   [ ] Admin: Ausstehende Punkte vergeben
--   [ ] Admin: Temporären User anlegen
--   [ ] Admin: Schicht bearbeiten
--   [ ] Nachts: Cron "punkte-vergeben" läuft weiter (Logs prüfen)
--
-- ROLLBACK (nur falls etwas bricht – einzeln ausführen):
--   -- zu 4)  create policy update_belegt on public.schichten
--   --          for update using (auth.role() = 'authenticated');
--   -- zu 1)  grant update on public.profiles to authenticated;
--   -- zu 3)  grant execute on function public.add_punkte(uuid, integer) to anon;
--   --        (Funktionskörper: siehe Originaldefinition aus dem Export)
-- =====================================================================
