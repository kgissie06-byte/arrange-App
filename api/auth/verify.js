import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { issueSession } from '../../lib/auth.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { memberId, password } = req.body
  if (!memberId || !password) {
    return res.status(400).json({ error: 'memberId and password are required' })
  }

  const { data: row, error } = await supabase
    .from('auth_role')
    .select('member_id, password, role')
    .eq('member_id', memberId)
    .single()

  if (error || !row) {
    return res.status(401).json({ error: 'IDまたはパスワードが違います' })
  }

  const ok = await bcrypt.compare(password, row.password)
  if (!ok) {
    return res.status(401).json({ error: 'IDまたはパスワードが違います' })
  }

  // その他メンバーはログイン不可
  const { data: member } = await supabase
    .from('members')
    .select('role')
    .eq('id', row.member_id)
    .single()

  if (member?.role === 'その他') {
    return res.status(403).json({ error: 'ログインできません' })
  }

  await issueSession(res, row.role, row.member_id)
  return res.json({ role: row.role, memberId: row.member_id })
}