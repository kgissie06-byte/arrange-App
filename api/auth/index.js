import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { issueSession, clearSession } from '../../lib/auth.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// /api/auth
//   POST /api/auth                → ログイン（旧 /api/auth/verify）
//   POST /api/auth?action=logout  → ログアウト（旧 /api/auth/logout）
// Vercel Hobbyプランのサーバーレス関数数上限（12個）を超えないよう、
// verify.js と logout.js をこの1ファイルに統合しています。
export default async function handler(req, res) {
  const { action } = req.query

  if (action === 'logout') {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }
    clearSession(res)
    return res.json({ ok: true })
  }

  // ----- ログイン（デフォルト） -----
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

  // 状態が「無効」のメンバーはログイン不可
  const { data: member } = await supabase
    .from('members')
    .select('status')
    .eq('id', row.member_id)
    .single()

  if (member?.status === '無効') {
    return res.status(403).json({ error: 'ログインできません' })
  }

  await issueSession(res, row.role, row.member_id)
  return res.json({ role: row.role, memberId: row.member_id })
}