-- =====================================================================
-- 03: Edge Functions absichern (AP 2)
--
--  1. gutschein_anfragen.mail_gesendet (Idempotenz der Gutschein-Mail)
--  2. Trigger-Funktion notify_gutschein_anfrage sendet nur noch { gutschein_id }
--  3. Cron-Jobs neu anlegen, mit Header x-cron-secret
--
-- WICHTIG: Platzhalter <CRON_SECRET> vor dem Ausführen ersetzen (2 Stellen).
--          Den Wert NICHT ins Repo committen. Er muss exakt dem Wert
--          entsprechen, den du mit "supabase secrets set CRON_SECRET=..." setzt.
-- Reihenfolge laut Anleitung: Frontend deployen -> DIESE Datei -> Secret setzen
--          -> Functions deployen.
-- Der Anon-Key ist öffentlich (steht auch im Frontend), er darf hier stehen.
-- =====================================================================

-- VORAB (nur lesen, Ergebnis aufbewahren = Rollback-Vorlage):
--   select pg_get_functiondef('public.notify_gutschein_anfrage'::regproc);
--   select jobname, schedule, command from cron.job;

begin;

-- 1) Idempotenz-Flag. Bestehende Anfragen gelten als "Mail schon gesendet".
alter table public.gutschein_anfragen
  add column if not exists mail_gesendet boolean not null default false;

update public.gutschein_anfragen set mail_gesendet = true where mail_gesendet = false;

-- 2) Trigger-Funktion: schickt nur die ID. Die Function lädt die Daten selbst.
--    Ein Fehler beim HTTP-Aufruf darf das Speichern der Anfrage nie verhindern.
create or replace function public.notify_gutschein_anfrage()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  begin
    perform net.http_post(
      url     := 'https://kfawjltveddyoqewayzh.supabase.co/functions/v1/gutschein-anfrage',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmYXdqbHR2ZWRkeW9xZXdheXpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNjY0NzMsImV4cCI6MjA4OTg0MjQ3M30._oCJg10y_0dyCalOsSiHQ9PZUwW2dZV-2IcseWrWg9k'
      ),
      body    := jsonb_build_object('gutschein_id', NEW.id)
    );
  exception when others then
    raise warning 'notify_gutschein_anfrage: %', sqlerrm;
  end;
  return new;
end;
$$;

-- 3) Cron-Jobs neu anlegen (erst entfernen, falls vorhanden)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'punkte-vergabe-daily') then
    perform cron.unschedule('punkte-vergabe-daily');
  end if;
  if exists (select 1 from cron.job where jobname = 'schicht-reminder-daily') then
    perform cron.unschedule('schicht-reminder-daily');
  end if;
end $$;

select cron.schedule('punkte-vergabe-daily', '0 0 * * *', $job$
  select net.http_post(
    url := 'https://kfawjltveddyoqewayzh.supabase.co/functions/v1/punkte-vergabe',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmYXdqbHR2ZWRkeW9xZXdheXpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNjY0NzMsImV4cCI6MjA4OTg0MjQ3M30._oCJg10y_0dyCalOsSiHQ9PZUwW2dZV-2IcseWrWg9k',
      'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb);
$job$);

select cron.schedule('schicht-reminder-daily', '0 8 * * *', $job$
  select net.http_post(
    url := 'https://kfawjltveddyoqewayzh.supabase.co/functions/v1/schicht-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmYXdqbHR2ZWRkeW9xZXdheXpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNjY0NzMsImV4cCI6MjA4OTg0MjQ3M30._oCJg10y_0dyCalOsSiHQ9PZUwW2dZV-2IcseWrWg9k',
      'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb);
$job$);

commit;

-- KONTROLLE 1: beide Jobs vorhanden, aktiv, richtiger Zeitplan
select jobname, schedule, active from cron.job
 where jobname in ('punkte-vergabe-daily', 'schicht-reminder-daily') order by jobname;
-- erwartet: 2 Zeilen, active = true

-- KONTROLLE 2 (separat ausführen): Spalte vorhanden, keine offenen Mails
--   select count(*) filter (where mail_gesendet) as gesendet,
--          count(*) filter (where not mail_gesendet) as offen
--     from public.gutschein_anfragen;
-- erwartet: offen = 0

-- ROLLBACK:
--   * Alte Trigger-Funktion: aus der VORAB-Query (pg_get_functiondef) wiederherstellen.
--   * Cron-Jobs: ohne x-cron-secret-Header neu anlegen (Vorlage: Ausgabe der VORAB-Query
--     auf cron.job). Achtung: die neuen Functions verlangen das Secret. Für einen echten
--     Rollback müssen auch die Functions auf die Vorversion (git, Commit 190d826) zurück.
--   * Die Spalte mail_gesendet kann bleiben (schadet nicht).
