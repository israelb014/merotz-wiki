-- מרוץ ויקי – טבלת keepalive: GitHub Actions מעדכן שורה אחת כל 3 ימים כדי שהפרויקט החינמי לא יושהה.
create table if not exists public.keepalive (
  id int primary key,
  pinged_at timestamptz not null default now()
);

insert into public.keepalive (id, pinged_at) values (1, now())
on conflict (id) do nothing;

alter table public.keepalive enable row level security;

drop policy if exists "keepalive_select" on public.keepalive;
create policy "keepalive_select" on public.keepalive
  for select to anon using (true);

drop policy if exists "keepalive_update" on public.keepalive;
create policy "keepalive_update" on public.keepalive
  for update to anon using (id = 1) with check (id = 1);

grant select, update on table public.keepalive to anon;
grant all on table public.keepalive to service_role;
