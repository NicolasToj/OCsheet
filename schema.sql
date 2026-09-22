-- =========================================================
-- OCsheets (Free / self-hosted edition) — esquema de Supabase
-- Pega TODO este archivo en: Supabase Dashboard > SQL Editor > New query > Run
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------- PERFIL ----------
create table if not exists profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Mi perfil',
  handle text not null default '',
  about text not null default '',
  links text not null default '',
  avatar_url text,
  updated_at timestamptz not null default now()
);

-- ---------- GRUPOS (libres, sin ninguno prefijado) ----------
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- PERSONAJES ----------
create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default 'Nuevo Personaje',
  species text not null default '',
  avatar_url text,
  banner_url text,
  fields jsonb not null default '[]'::jsonb,
  stats jsonb not null default '[]'::jsonb,
  colors jsonb not null default '[]'::jsonb,
  notes text not null default '',
  about text not null default '',
  likes text not null default '',
  dislikes text not null default '',
  gallery jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- RELACIÓN PERSONAJE <-> GRUPO (muchos a muchos) ----------
create table if not exists character_groups (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  character_id uuid not null references characters(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  primary key (character_id, group_id)
);

-- ---------- HISTORIAS (propias, vinculables a personajes) ----------
create table if not exists stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Nueva historia',
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists character_stories (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  character_id uuid not null references characters(id) on delete cascade,
  story_id uuid not null references stories(id) on delete cascade,
  primary key (character_id, story_id)
);

-- =========================================================
-- Seguridad: cada usuario solo ve y edita sus propios datos.
-- No hay ninguna política de lectura pública en esta edición.
-- =========================================================
alter table profile enable row level security;
alter table groups enable row level security;
alter table characters enable row level security;
alter table character_groups enable row level security;
alter table stories enable row level security;
alter table character_stories enable row level security;

create policy "profile_select_own" on profile for select using (auth.uid() = user_id);
create policy "profile_insert_own" on profile for insert with check (auth.uid() = user_id);
create policy "profile_update_own" on profile for update using (auth.uid() = user_id);

create policy "groups_select_own" on groups for select using (auth.uid() = user_id);
create policy "groups_insert_own" on groups for insert with check (auth.uid() = user_id);
create policy "groups_update_own" on groups for update using (auth.uid() = user_id);
create policy "groups_delete_own" on groups for delete using (auth.uid() = user_id);

create policy "characters_select_own" on characters for select using (auth.uid() = user_id);
create policy "characters_insert_own" on characters for insert with check (auth.uid() = user_id);
create policy "characters_update_own" on characters for update using (auth.uid() = user_id);
create policy "characters_delete_own" on characters for delete using (auth.uid() = user_id);

create policy "cg_select_own" on character_groups for select using (auth.uid() = user_id);
create policy "cg_insert_own" on character_groups for insert with check (auth.uid() = user_id);
create policy "cg_delete_own" on character_groups for delete using (auth.uid() = user_id);

create policy "stories_select_own" on stories for select using (auth.uid() = user_id);
create policy "stories_insert_own" on stories for insert with check (auth.uid() = user_id);
create policy "stories_update_own" on stories for update using (auth.uid() = user_id);
create policy "stories_delete_own" on stories for delete using (auth.uid() = user_id);

create policy "cs_select_own" on character_stories for select using (auth.uid() = user_id);
create policy "cs_insert_own" on character_stories for insert with check (auth.uid() = user_id);
create policy "cs_delete_own" on character_stories for delete using (auth.uid() = user_id);

-- =========================================================
-- Storage: bucket para fotos (perfil, avatares, banners, galería)
-- =========================================================
insert into storage.buckets (id, name, public)
values ('character-images', 'character-images', true)
on conflict (id) do nothing;

create policy "images_public_read" on storage.objects
  for select using (bucket_id = 'character-images');

create policy "images_auth_insert" on storage.objects
  for insert with check (bucket_id = 'character-images' and auth.uid() is not null);

create policy "images_auth_update" on storage.objects
  for update using (bucket_id = 'character-images' and auth.uid() is not null);

create policy "images_auth_delete" on storage.objects
  for delete using (bucket_id = 'character-images' and auth.uid() is not null);
