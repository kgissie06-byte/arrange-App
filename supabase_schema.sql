-- ① キャラマスタ
create table if not exists chars (
  name        text primary key,
  rars        text[]    not null default '{}',
  ranks       text[]    not null default '{}',
  created_at  timestamptz not null default now()
);

-- ② メンバー
create table if not exists members (
  id          serial primary key,
  name        text      not null,
  role        text      not null default '',
  created_at  timestamptz not null default now()
);

-- ③ 育成データ（member × char の複合ユニーク）
create table if not exists training (
  id          serial primary key,
  member_id   int       not null references members(id) on delete cascade,
  char_name   text      not null references chars(name) on delete cascade,
  rarity      text,
  ranks       text[]    not null default '{}',
  updated_at  timestamptz not null default now(),
  unique (member_id, char_name)
);

-- ④ 援軍表
create table if not exists reinf (
  id          serial primary key,
  member_name text,
  normal_main text,
  normal_sub  text,
  castle_main text,
  castle_sub  text,
  sort_order  int       not null default 0,
  created_at  timestamptz not null default now()
);
