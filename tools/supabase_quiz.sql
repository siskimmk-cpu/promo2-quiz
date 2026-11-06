-- 2급 진급시험 앱 · 로그인/승인/학습기록 (송무온과 같은 Supabase 서버를 쓰되 사용자 명단은 따로)
-- Supabase → SQL Editor 에서 postgres 권한으로 한 번 실행. 다시 실행해도 안전.
-- 원칙: 화면이 아니라 DB가 접근을 막는다. 모든 표 RLS, anon 권한 없음.
-- 관리자 = 송무온 관리자(public.is_admin()) 그대로.

-- 1) 진급시험 사용자 명단: status = pending(승인 대기) / approved(사용 중) / revoked(해제)
create table if not exists public.quiz_members (
  email       text primary key check (email = lower(email)),
  name        text,
  status      text not null default 'pending' check (status in ('pending','approved','revoked')),
  created_at  timestamptz not null default now(),
  approved_at timestamptz,
  last_seen   timestamptz
);
alter table public.quiz_members enable row level security;
revoke all on public.quiz_members from anon, authenticated;

create or replace function public.quiz_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (
    select 1 from public.quiz_members m
    where m.email = lower(coalesce(auth.jwt() ->> 'email', '')) and m.status = 'approved')
$$;
revoke all on function public.quiz_allowed() from public, anon;
grant execute on function public.quiz_allowed() to authenticated;

-- 2) 학습 기록 (기기 간 동기화). data = 앱 저장값 전체, stats = 관리자 현황용 요약
create table if not exists public.quiz_progress (
  owner      uuid primary key default auth.uid(),
  data       jsonb not null default '{}'::jsonb,
  stats      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.quiz_progress enable row level security;
revoke all on public.quiz_progress from anon, authenticated;
grant select, insert, update on public.quiz_progress to authenticated;
drop policy if exists qp_select on public.quiz_progress;
drop policy if exists qp_insert on public.quiz_progress;
drop policy if exists qp_update on public.quiz_progress;
create policy qp_select on public.quiz_progress for select to authenticated using (owner = auth.uid() and public.quiz_allowed());
create policy qp_insert on public.quiz_progress for insert to authenticated with check (owner = auth.uid() and public.quiz_allowed());
create policy qp_update on public.quiz_progress for update to authenticated using (owner = auth.uid() and public.quiz_allowed()) with check (owner = auth.uid() and public.quiz_allowed());

-- 3) 내 상태: 처음 들어오면 승인 대기로 등록하고 상태를 돌려줌
create or replace function public.quiz_me()
returns table (status text, is_admin boolean, name text)
language plpgsql security definer set search_path = '' as $$
declare e text := lower(coalesce(auth.jwt() ->> 'email', '')); n text; adm boolean := public.is_admin();
begin
  if auth.uid() is null or e = '' then raise exception 'login required' using errcode = '42501'; end if;
  select coalesce(u.raw_user_meta_data ->> 'name', '') into n from auth.users u where u.id = auth.uid();
  insert into public.quiz_members (email, name, status, approved_at)
    values (e, nullif(n, ''), case when adm then 'approved' else 'pending' end, case when adm then now() end)
    on conflict (email) do update set last_seen = now(),
      status = case when adm then 'approved' else public.quiz_members.status end;
  return query select m.status, adm, m.name from public.quiz_members m where m.email = e;
end $$;
revoke all on function public.quiz_me() from public, anon;
grant execute on function public.quiz_me() to authenticated;

-- 4) 관리자: 사용자 목록 + 학습 현황
create or replace function public.quiz_admin_users()
returns table (email text, name text, status text, created_at timestamptz, last_seen timestamptz, last_sign_in timestamptz, stats jsonb, synced_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return query
    select m.email, coalesce(m.name, u.raw_user_meta_data ->> 'name')::text, m.status, m.created_at, m.last_seen, u.last_sign_in_at, p.stats, p.updated_at
    from public.quiz_members m
    left join auth.users u on lower(u.email) = m.email
    left join public.quiz_progress p on p.owner = u.id
    order by (m.status = 'pending') desc, coalesce(p.updated_at, m.created_at) desc;
end $$;
revoke all on function public.quiz_admin_users() from public, anon;
grant execute on function public.quiz_admin_users() to authenticated;

create or replace function public.quiz_admin_set(p_email text, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare e text := lower(trim(p_email));
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_status not in ('approved','revoked') then raise exception 'bad status'; end if;
  if e = lower(coalesce(auth.jwt() ->> 'email', '')) then raise exception 'cannot change self'; end if;
  update public.quiz_members set status = p_status, approved_at = case when p_status = 'approved' then now() else approved_at end where email = e;
  if not found then raise exception 'no such member'; end if;
end $$;
revoke all on function public.quiz_admin_set(text, text) from public, anon;
grant execute on function public.quiz_admin_set(text, text) to authenticated;

-- 거절: 승인 대기 명단에서 지우고, 진급시험에서만 만든 계정(송무온 미사용)이면 계정도 삭제
create or replace function public.quiz_admin_reject(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare e text := lower(trim(p_email));
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  delete from public.quiz_members where email = e and status <> 'approved';
  if not exists (select 1 from public.allowed_users a where a.email = e) then
    delete from auth.users u where lower(u.email) = e and u.raw_user_meta_data ->> 'app' = 'promo2';
  end if;
end $$;
revoke all on function public.quiz_admin_reject(text) from public, anon;
grant execute on function public.quiz_admin_reject(text) to authenticated;

-- 임시 비밀번호는 송무온의 public.admin_set_password(p_email, p_password) 를 그대로 사용 (관리자만, 10자 이상)

-- 5) 송무온 「사용자 승인 관리」 목록에서 진급시험 전용 가입자(app=promo2, 송무온 미승인)는 숨김
create or replace function public.admin_users()
returns table (email text, name text, created_at timestamptz, confirmed boolean, last_sign_in timestamptz, allowed boolean, is_admin boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
    select coalesce(lower(u.email), a.email)::text,
           coalesce(a.name, u.raw_user_meta_data ->> 'name')::text,
           u.created_at, (u.email_confirmed_at is not null), u.last_sign_in_at,
           (a.email is not null), coalesce(a.is_admin, false)
    from auth.users u
    full join public.allowed_users a on a.email = lower(u.email)
    where not (a.email is null and coalesce(u.raw_user_meta_data ->> 'app', '') = 'promo2')
    order by (a.email is null) desc, u.created_at desc nulls last;
end $$;
revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;

-- [확인] select * from public.quiz_members order by created_at desc;
