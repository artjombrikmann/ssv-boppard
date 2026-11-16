-- =====================================================================
-- 04m: Shop generisch, Teil 2 (AP 4.4)
--
-- 1) Mail-Trigger auf shop_anfragen: nach jedem INSERT ruft er die Edge Function "shop-anfrage"
--    (sendet nur { anfrage_id }, Function lädt alles selbst, idempotent über mail_gesendet).
--    Ein Fehler beim HTTP-Aufruf verhindert nie das Speichern der Anfrage.
--
-- 2) Punkte-Brücke: shop_einloesen und shop_anfrage_bearbeiten (04b) ändern nur
--    mitgliedschaften.punkte. Bis AP 6 liest das alte Frontend (Rollback-Ziel!) noch
--    profiles.punkte. Dieser Trigger hält profiles für Boppard synchron, egal welcher Pfad
--    die Punkte ändert. Er ist idempotent (die alten Funktionen schreiben denselben Wert).
--    Wird mit AP 6 entfernt.
--
-- REIHENFOLGE (wichtig):
--   a) Edge Function deployen:  supabase functions deploy shop-anfrage
--   b) dann diese Datei ausführen
--   c) dann erst das Frontend (Shop.tsx) in Produktion bringen
-- Keine Secrets (nur der öffentliche Anon-Key, wie in 03_functions_sicherheit.sql). Wiederholbar.
-- =====================================================================

begin;

-- 1) Mail-Trigger
create or replace function public.notify_shop_anfrage()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  begin
    perform net.http_post(
      url     := 'https://kfawjltveddyoqewayzh.supabase.co/functions/v1/shop-anfrage',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmYXdqbHR2ZWRkeW9xZXdheXpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNjY0NzMsImV4cCI6MjA4OTg0MjQ3M30._oCJg10y_0dyCalOsSiHQ9PZUwW2dZV-2IcseWrWg9k'
      ),
      body    := jsonb_build_object('anfrage_id', NEW.id)
    );
  exception when others then
    raise warning 'notify_shop_anfrage: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trigger_shop_anfrage_mail on public.shop_anfragen;
create trigger trigger_shop_anfrage_mail
  after insert on public.shop_anfragen
  for each row
  when (new.mail_gesendet = false)
  execute function public.notify_shop_anfrage();

-- 2) Punkte-Brücke mitgliedschaften -> profiles (nur Boppard)
create or replace function public.trg_bruecke_punkte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.verein_id = '5b0bba2d-0000-4000-8000-000000000001' then
    update public.profiles p
       set punkte = new.punkte, schichten_count = new.schichten_count
     where p.id = new.user_id
       and (p.punkte is distinct from new.punkte or p.schichten_count is distinct from new.schichten_count);
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_bruecke_punkte on public.mitgliedschaften;
create trigger trigger_bruecke_punkte
  after update of punkte, schichten_count on public.mitgliedschaften
  for each row
  execute function public.trg_bruecke_punkte();

commit;

-- KONTROLLE 1 (erwartet: 2 Zeilen)
select tgrelid::regclass as tabelle, tgname
  from pg_trigger
 where tgname in ('trigger_shop_anfrage_mail', 'trigger_bruecke_punkte') and not tgisinternal;

-- KONTROLLE 2 (muss 0 liefern, wie die Prüfabfrage aus der Übergabe)
select count(*) as abweichungen
  from public.profiles p
  join public.mitgliedschaften m on m.user_id = p.id and m.verein_id = '5b0bba2d-0000-4000-8000-000000000001'
 where coalesce(p.punkte, 0) <> m.punkte or coalesce(p.schichten_count, 0) <> m.schichten_count;

-- ROLLBACK:
--   drop trigger if exists trigger_shop_anfrage_mail on public.shop_anfragen;
--   drop trigger if exists trigger_bruecke_punkte    on public.mitgliedschaften;
--   drop function if exists public.notify_shop_anfrage();
--   drop function if exists public.trg_bruecke_punkte();
