import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

// POST /api/auth/verify
// body: { password: string }
// Supabaseの passwords テーブルを参照してロールを返す
// テーブル構成:
//   id       text PRIMARY KEY  ('admin' | 'user')
//   password text NOT NULL
//
// 初期データ例 (Supabase SQL Editor で実行):
//   insert into passwords (id, password) values ('admin', 'admin1234'), ('user', 'user5678');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { password } = req.body
  if (!password) {
    return res.status(400).json({ error: 'password is required' })
  }

  const { data, error } = await supabase
    .from('passwords')
    .select('id, password')

  if (error) return res.status(500).json({ error: error.message })

  const matched = (data || []).find(row => row.password === password)

  if (!matched) {
    return res.status(401).json({ error: 'パスワードが違います' })
  }

  // matched.id は 'admin' または 'user'
  return res.json({ role: matched.id })
}
