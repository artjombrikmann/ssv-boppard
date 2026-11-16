-- =====================================================================
-- 04l: Mitglied aus Verein entfernen (AP 4.5, Admin-Tab "User")
--
-- mitglied_entfernen(p_user, p_verein)
--   - nur Admin des Vereins (oder SQL Editor / Service Role)
--   - nicht sich selbst
--   - trägt das Mitglied aus allen ZUKÜNFTIGEN Schichten dieses Vereins aus
--     (vergangene Belegungen bleiben, damit Punkte und Historie stimmen)
--   - löscht die Mitgliedschaft (der Trigger "letzter Admin" verhindert, dass der Verein
--     ohne Admin zurückbleibt)
--   - Gast ohne weitere Mitgliedschaft: Belegungen und Profil werden ganz entfernt
--   - echtes Konto (auth.users) bleibt bestehen, nur die Zugehörigkeit zum Verein endet
--
-- Rein additiv, die laufende App ruft es noch nicht auf. Keine Secrets. Wiederholbar.
-- =====================================================================

begin;

create or replace function public.mitglied_entfernen(p_user uuid, p_verein uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_gast     boolean;
  v_ausgetragen integer;
begin
  if auth.uid() is not null and not public.ist_admin_von(p_verein) then
    raise exception 'nicht erlaubt';
  end if;
  if auth.uid() is not null and auth.uid() = p_user then
    raise exception 'Du kannst dich nicht selbst entfernen';
  end if;
  if not exists (select 1 from public.mitgliedschaften where user_id = p_user and verein_id = p_verein) then
    raise exception 'Kein Mitglied dieses Vereins';
  end if;

  v_gast := coalesce((select is_temp from public.profiles where id = p_user), false);

  -- zukünftige Belegungen in Schichten dieses Vereins austragen
  delete from public.schichtbelegungen b
   using public.schichten s
   where b.schicht_id = s.id
     and s.verein_id = p_verein
     and b.mitglied_id = p_user
     and (s.startzeit_ts is null or s.startzeit_ts > now());
  get diagnostics v_ausgetragen = row_count;

  delete from public.mitgliedschaften where user_id = p_user and verein_id = p_verein;

  -- Gast ohne weitere Mitgliedschaft: restliche Belegungen und Profil entfernen
  if v_gast and not exists (select 1 from public.mitgliedschaften where user_id = p_user) then
    delete from public.schichtbelegungen where mitglied_id = p_user;
    delete from public.gutschein_anfragen where mitglied_id = p_user;
    delete from public.benachrichtigungen where mitglied_id = p_user;
    delete from public.profiles where id = p_user;
  end if;

  return jsonb_build_object('schichten_ausgetragen', v_ausgetragen, 'gast_geloescht', v_gast);
end;
$$;

revoke execute on function public.mitglied_entfernen(uuid, uuid) from public, anon;
grant  execute on function public.mitglied_entfernen(uuid, uuid) to authenticated, service_role;

commit;

-- KONTROLLE (erwartet: 1 Zeile, anon_darf = false)
select 'mitglied_entfernen' as funktion,
       has_function_privilege('anon', 'public.mitglied_entfernen(uuid,uuid)', 'execute') as anon_darf;

-- ROLLBACK:
--   drop function if exists public.mitglied_entfernen(uuid, uuid);
