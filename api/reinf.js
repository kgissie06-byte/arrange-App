import { createClient } from '@supabase/supabase-js'
import { requireReinfAuth } from '../lib/auth.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * /api/reinf
 *
 * POST   /api/reinf        → 行追加
 * PUT    /api/reinf?id=XX  → 行更新
 * DELETE /api/reinf?id=XX  → 行削除
 */
export default async function handler(req, res) {
  const auth = await requireReinfAuth(req, res)
  if (!auth) return

  const { id } = req.query
  const rowId = id ? parseInt(id) : null

  // id あり → 既存行の更新・削除
  if (rowId) {
    if (isNaN(rowId)) return res.status(400).json({ error: 'invalid id' })

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

    if (req.method === 'DELETE') {
      const { error } = await supabase.from('reinf').delete().eq('id', rowId)
      if (error) return res.status(500).json({ error })
      return res.json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  }

  // id なし → 新規行追加
  if (req.method === 'POST') {
    const { tableType } = req.body
    const { data: existing } = await supabase
      .from('reinf')
      .select('sort_order')
      .eq('table_type', tableType || 'ransaki')
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextOrder = existing && existing.length > 0
      ? existing[0].sort_order + 1
      : 0

    const { data, error } = await supabase
      .from('reinf')
      .insert({
        member_name: null,
        normal_main: null,
        normal_sub: null,
        castle_main: null,
        castle_sub: null,
        sort_order: nextOrder,
        table_type: tableType || 'ransaki',
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error })
    return res.json(data)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}