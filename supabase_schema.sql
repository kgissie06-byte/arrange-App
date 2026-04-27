-- =====================================================
-- Game Tracker - Supabase スキーマ定義
-- Supabase の SQL Editor でこれをそのまま実行してください
-- =====================================================

-- メンバーテーブル
CREATE TABLE IF NOT EXISTS members (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL,
  role  TEXT NOT NULL DEFAULT ''
);

-- キャラテーブル（rars, ranks は配列で保持）
CREATE TABLE IF NOT EXISTS chars (
  name  TEXT PRIMARY KEY,
  rars  TEXT[] NOT NULL DEFAULT '{}',
  ranks TEXT[] NOT NULL DEFAULT '{}'
);

-- 育成データテーブル
CREATE TABLE IF NOT EXISTS trainings (
  id        SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  char_name TEXT    NOT NULL REFERENCES chars(name)  ON DELETE CASCADE,
  rar       TEXT    NOT NULL,
  ranks     TEXT[]  NOT NULL DEFAULT '{}',
  UNIQUE (member_id, char_name)
);

-- 援軍表テーブル
CREATE TABLE IF NOT EXISTS reinf (
  id          SERIAL PRIMARY KEY,
  member_name TEXT,
  normal_main TEXT,
  normal_sub  TEXT,
  castle_main TEXT,
  castle_sub  TEXT
);

-- =====================================================
-- Row Level Security (RLS) — 必要に応じて設定
-- 今は全員読み書き可（チーム内利用を想定）
-- =====================================================
ALTER TABLE members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chars    ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reinf    ENABLE ROW LEVEL SECURITY;

-- anon キーでの全操作を許可（サーバー側で制御）
CREATE POLICY "allow all" ON members  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all" ON chars    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all" ON trainings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all" ON reinf    FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- サンプルデータ（任意）
-- =====================================================
INSERT INTO chars (name, rars, ranks) VALUES
  ('炎の剣士',  ARRAY['LG3','LG2','LG','UR','SR'],       ARRAY['全技極','裏技極','技極','表1','表2','表3']),
  ('水の魔法師', ARRAY['LG2','LG','UR','SR','R'],          ARRAY['全技極','裏技極','技極','表1','表2','表3','表4']),
  ('聖騎士',    ARRAY['UR','SR','R','N'],                  ARRAY['技極','表1','表2','表3','表4','表5']),
  ('影のハンター', ARRAY['LG','UR','SR'],                  ARRAY['全技極','裏技極','技極','表1','表2'])
ON CONFLICT (name) DO NOTHING;
