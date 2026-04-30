import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  const { id } = req.query
  const memberId = parseInt(id)

  if (isNaN(memberId)) return res.status(400).json({ error: 'invalid id' })

  // メンバー更新
  if (req.method === 'PUT') {
    const { name, role } = req.body

    const { error } = await supabase
      .from('members')
      .update({ name, role: role || '' })
      .eq('id', memberId)

    if (error) return res.status(500).json({ error })

    return res.json({ ok: true })
  }

  // メンバー削除（関連する育成データも削除）
  if (req.method === 'DELETE') {
    // 育成データを先に削除
    const { error: trainingErr } = await supabase
      .from('training')
      .delete()
      .eq('member_id', memberId)

    if (trainingErr) return res.status(500).json({ error: trainingErr })

    // メンバー削除
    const { error } = await supabase
      .from('members')
      .delete()
      .eq('id', memberId)

    if (error) return res.status(500).json({ error })

    return res.json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
