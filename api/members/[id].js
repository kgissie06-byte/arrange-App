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
    const { name, role, status, memberRole, password } = req.body

    if (status !== undefined && !['有効', '無効'].includes(status)) {
      return res.status(400).json({ error: 'status は 有効 か 無効 で指定してください' })
    }

    const memberUpdates = { name, role: role || '' }
    if (status !== undefined) memberUpdates.status = status

     const { error } = await supabase
       .from('members')
       .update(memberUpdates)
       .eq('id', memberId)

     if (error) return res.status(500).json({ error })

    // 状態を「無効」にする場合は、既にログイン中のセッションも無効化してログイン不可・操作不可にする
    if (memberRole || password || status === '無効') {
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
      status: status || undefined,
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