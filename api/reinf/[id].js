import { createClient } from '@supabase/supabase-js'
import { requireReinfAuth } from '../../lib/auth.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  const auth = await requireReinfAuth(req, res)
  if (!auth) return

  const { id } = req.query
  const rowId = parseInt(id)

  if (isNaN(rowId)) return res.status(400).json({ error: 'invalid id' })

  // 援軍行更新
  if (req.method === 'PUT') {
    const { memberName, normalMain, normalSub, castleMain, castleSub } = req.body

    const { error } = await supabase
      .from('reinf')
      .update({
        member_name: memberName || null,
        normal_main: normalMain || null,
        normal_sub: normalSub || null,
        castle_main: castleMain || null,
        castle_sub: castleSub || null,
      })
      .eq('id', rowId)

    if (error) return res.status(500).json({ error })

    return res.json({ ok: true })
  }

  // 援軍行削除
  if (req.method === 'DELETE') {
    const { error } = await supabase
      .from('reinf')
      .delete()
      .eq('id', rowId)

    if (error) return res.status(500).json({ error })

    return res.json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
