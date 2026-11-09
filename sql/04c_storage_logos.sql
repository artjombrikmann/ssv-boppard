-- =====================================================================
-- 04c: Storage-Bucket für Vereinslogos  (AP 3, optional und getrennt)
--
-- Eigene Datei, weil Änderungen an storage.* je nach Projektrechten im SQL Editor
-- scheitern können. Ein Fehler hier darf 04a/04b nicht zurückrollen.
--
-- Öffentlich lesbar (Logos stehen auf der Login-Seite), Schreiben nur Plattform-Admin.
-- Voraussetzung: 04a (ist_plattform_admin). Keine Secrets.
-- =====================================================================

begin;

insert into storage.buckets (id, name, public)
values ('vereins-logos', 'vereins-logos', true)
on conflict (id) do nothing;

drop policy if exists vereins_logos_lesen on storage.objects;
create policy vereins_logos_lesen on storage.objects
  for select using (bucket_id = 'vereins-logos');

drop policy if exists vereins_logos_schreiben on storage.objects;
create policy vereins_logos_schreiben on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vereins-logos' and public.ist_plattform_admin());

drop policy if exists vereins_logos_aendern on storage.objects;
create policy vereins_logos_aendern on storage.objects
  for update to authenticated
  using (bucket_id = 'vereins-logos' and public.ist_plattform_admin())
  with check (bucket_id = 'vereins-logos' and public.ist_plattform_admin());

drop policy if exists vereins_logos_loeschen on storage.objects;
create policy vereins_logos_loeschen on storage.objects
  for delete to authenticated
  using (bucket_id = 'vereins-logos' and public.ist_plattform_admin());

commit;

-- KONTROLLE: Bucket vorhanden und öffentlich, 4 Policies
select (select public from storage.buckets where id = 'vereins-logos') as oeffentlich,
       (select count(*) from pg_policies
         where schemaname = 'storage' and tablename = 'objects'
           and policyname like 'vereins_logos_%')                      as policies;
-- erwartet: oeffentlich = true, policies = 4

-- ROLLBACK:
--   drop policy vereins_logos_lesen on storage.objects;  (und die drei anderen)
--   delete from storage.buckets where id = 'vereins-logos';  -- nur wenn leer
