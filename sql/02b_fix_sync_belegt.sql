-- =====================================================================
-- 02b: sync_belegt zählt nur aktive Anmeldungen
--
-- Problem: Die Funktion aus 01_hotfix_sicherheit.sql zählt ALLE Zeilen
-- in schichtbelegungen. Beim Abmelden wird aber nur status = 'abgesagt'
-- gesetzt (keine Löschung). Dadurch würde "belegt" nach einer Abmeldung
-- nicht sinken und der Platz bliebe blockiert.
--
-- Hinweis: Dieses Skript ändert nur die Zählung und stellt sicher, dass
-- der Trigger auch bei UPDATE feuert. Ausführen im Supabase SQL Editor.
-- Am besten an einem Tag ohne Event.
-- =====================================================================

-- VORAB (nur lesen): welche Trigger hängen heute an schichtbelegungen?
-- select tgname, pg_get_triggerdef(oid) from pg_trigger
--  where tgrelid = 'public.schichtbelegungen'::regclass and not tgisinternal;

begin;

create or replace function public.sync_belegt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    update schichten
       set belegt = (select count(*) from schichtbelegungen
                      where schicht_id = OLD.schicht_id and status = 'Angemeldet')
     where id = OLD.schicht_id;
  else
    update schichten
       set belegt = (select count(*) from schichtbelegungen
                      where schicht_id = NEW.schicht_id and status = 'Angemeldet')
     where id = NEW.schicht_id;
    -- Schichtwechsel einer Belegung (selten): alte Schicht ebenfalls neu zählen
    if TG_OP = 'UPDATE' and OLD.schicht_id is distinct from NEW.schicht_id then
      update schichten
         set belegt = (select count(*) from schichtbelegungen
                        where schicht_id = OLD.schicht_id and status = 'Angemeldet')
       where id = OLD.schicht_id;
    end if;
  end if;
  return null;
end;
$$;

-- Falls noch kein Trigger die Funktion aufruft, wird er angelegt.
-- (Existiert einer, bleibt er unverändert. Prüfe dann per VORAB-Query, dass er
--  auch auf UPDATE reagiert.)
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.schichtbelegungen'::regclass
       and not tgisinternal
       and tgfoid = 'public.sync_belegt()'::regprocedure
  ) then
    create trigger trigger_sync_belegt
      after insert or update or delete on public.schichtbelegungen
      for each row execute function public.sync_belegt();
  end if;
end $$;

-- Einmalig alle Zähler korrigieren
update public.schichten s
   set belegt = (select count(*) from public.schichtbelegungen b
                  where b.schicht_id = s.id and b.status = 'Angemeldet');

commit;

-- KONTROLLE: darf keine Zeilen liefern
select s.id, s.bezeichnung, s.belegt as gespeichert,
       (select count(*) from public.schichtbelegungen b
         where b.schicht_id = s.id and b.status = 'Angemeldet') as echt
  from public.schichten s
 where s.belegt <> (select count(*) from public.schichtbelegungen b
                     where b.schicht_id = s.id and b.status = 'Angemeldet');

-- ROLLBACK (alte Zählung ohne Statusfilter):
--   create or replace function public.sync_belegt() returns trigger language plpgsql
--   security definer set search_path = public as $f$ begin
--     if TG_OP = 'DELETE' then
--       update schichten set belegt = (select count(*) from schichtbelegungen where schicht_id = OLD.schicht_id) where id = OLD.schicht_id;
--     else
--       update schichten set belegt = (select count(*) from schichtbelegungen where schicht_id = NEW.schicht_id) where id = NEW.schicht_id;
--     end if; return null; end; $f$;
