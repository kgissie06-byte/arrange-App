import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { requireAuth } from '../../lib/auth.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // 管理者のみパスワード変更可能
  const auth = await requireAuth(req, res, 'admin')
  if (!auth) return

  const { role, password } = req.body

  if (!role || !password) {
    return res.status(400).json({ error: 'role and password are required' })
  }

  if (!['user', 'reinf-admin'].includes(role)) {
    return res.status(403).json({ error: '変更できるのは利用者・援軍管理者パスワードのみです' })
  }

  if (password.length < 4) {
    return res.status(400).json({ error: '4文字以上のパスワードを設定してください' })
  }

  // bcryptでハッシュ化して保存
  const hashed = await bcrypt.hash(password, 10)

  const { error } = await supabase
    .from('passwords')
    .update({
      password: hashed,
      invalidate_before: new Date().toISOString(),
    })
    .eq('id', role)

  if (error) return res.status(500).json({ error: error.message })

  return res.json({ ok: true })
}