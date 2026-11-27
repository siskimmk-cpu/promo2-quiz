-- 2급 진급시험 앱 · 사용자별 문제 범위 (2026. 11. 27.)
-- Supabase → SQL Editor 에서 postgres 권한으로 한 번 실행. 다시 실행해도 안전.
-- scope = {"subj":["F","E","D","Y","G"] 중 일부, "src":["site","user","past"] 중 일부}, null = 전체

alter table public.quiz_members add column if not exists scope jsonb;

-- 내 범위
create or replace function public.quiz_my_scope()
returns jsonb language sql stable security definer set search_path = '' as $$
  select m.scope from public.quiz_members m
  where m.email = lower(coalesce(auth.jwt() ->> 'email', '')) and public.quiz_allowed()
$$;
revoke all on function public.quiz_my_scope() from public, anon;
grant execute on function public.quiz_my_scope() to authenticated;

-- 관리자: 전체 범위 목록
create or replace function public.quiz_admin_scopes()
returns table (email text, scope jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  -- 관리자 확인은 기존 quiz_admin_users()에 맡긴다(관리자가 아니면 거기서 'admin only'로 막힘). 2026. 11. 27. is_admin() 직접 호출이 새 함수에서 false로 나와 변경
  perform 1 from public.quiz_admin_users() limit 1;
  return query select m.email, m.scope from public.quiz_members m;
end $$;
revoke all on function public.quiz_admin_scopes() from public, anon;
grant execute on function public.quiz_admin_scopes() to authenticated;

-- 관리자: 범위 지정 (null = 전체)
create or replace function public.quiz_admin_set_scope(p_email text, p_scope jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare e text := lower(trim(p_email));
begin
  -- 관리자 확인은 기존 quiz_admin_users()에 맡긴다(관리자가 아니면 거기서 'admin only'로 막힘). 2026. 11. 27. is_admin() 직접 호출이 새 함수에서 false로 나와 변경
  perform 1 from public.quiz_admin_users() limit 1;
  if p_scope is not null and jsonb_typeof(p_scope) <> 'object' then raise exception 'bad scope'; end if;
  update public.quiz_members set scope = case when p_scope = '{}'::jsonb then null else p_scope end where email = e;
  if not found then raise exception 'no such member'; end if;
end $$;
revoke all on function public.quiz_admin_set_scope(text, jsonb) from public, anon;
grant execute on function public.quiz_admin_set_scope(text, jsonb) to authenticated;

-- [확인] select email, name, scope from public.quiz_members order by email;
