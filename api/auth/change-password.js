import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { role, password } = req.body

  if (!role || !password) {
    return res.status(400).json({ error: 'role and password are required' })
  }

  if (role !== 'user') {
    // 管理者パスワードの変更はこのAPIでは許可しない
    return res.status(403).json({ error: '変更できるのは利用者パスワードのみです' })
  }

  if (password.length < 4) {
    return res.status(400).json({ error: '4文字以上のパスワードを設定してください' })
  }

  const { error } = await supabase
    .from('passwords')
    .update({ password })
    .eq('id', role)

  if (error) return res.status(500).json({ error: error.message })

  return res.json({ ok: true })
}
