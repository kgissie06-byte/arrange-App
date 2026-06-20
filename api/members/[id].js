import bcrypt from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '../../lib/auth.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  // メンバー管理は管理者のみ
  const auth = await requireAuth(req, res, 'admin')
  if (!auth) return

  const { id } = req.query
  const memberId = parseInt(id)

  if (isNaN(memberId)) return res.status(400).json({ error: 'invalid id' })

  // メンバー更新
  if (req.method === 'PUT') {
    const { name, role, memberRole, password } = req.body

     const { error } = await supabase
       .from('members')
       .update({ name, role: role || '' })
       .eq('id', memberId)

     if (error) return res.status(500).json({ error })

    if (memberRole || password) {
      const updates = {}
      if (memberRole) updates.role = memberRole
      if (password) {
        if (password.length < 4) {
          return res.status(400).json({ error: '4文字以上のパスワードを設定してください' })
        }
        updates.password = await bcrypt.hash(password, 10)
      }
      updates.invalidate_before = new Date().toISOString()
      const { error: authErr } = await supabase
        .from('auth_role')
        .update(updates)
        .eq('member_id', memberId)
      if (authErr) return res.status(500).json({ error: authErr })
    }

    return res.json({
      id: memberId,
      name,
      role: role || '',
      memberRole: memberRole || undefined,
      updatedPassword: password || null,
    })
  }

  // メンバー削除（関連する育成データも削除）
  if (req.method === 'DELETE') {
    const { error: trainingErr } = await supabase
      .from('training')
      .delete()
      .eq('member_id', memberId)

    if (trainingErr) return res.status(500).json({ error: trainingErr })

    const { error } = await supabase
      .from('members')
      .delete()
      .eq('id', memberId)

    if (error) return res.status(500).json({ error })

    return res.json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
