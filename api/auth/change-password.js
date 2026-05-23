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

  // 管理者のみ他人のパスワードを変更可能
  const auth = await requireAuth(req, res, 'admin')
  if (!auth) return

  const { targetMemberId, password } = req.body

  if (!targetMemberId || !password) {
    return res.status(400).json({ error: 'targetMemberId and password are required' })
  }
  if (password.length < 4) {
    return res.status(400).json({ error: '4文字以上のパスワードを設定してください' })
  }

  const hashed = await bcrypt.hash(password, 10)
  const { error } = await supabase
    .from('auth_role')
    .update({
      password: hashed,
      invalidate_before: new Date().toISOString(),
    })
    .eq('member_id', targetMemberId)

  if (error) return res.status(500).json({ error: error.message })

  return res.json({ ok: true })
}