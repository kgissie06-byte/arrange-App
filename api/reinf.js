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
      const { memberName, normalMain, normalSub, castleMain, castleSub, tableType, sortOrder } = req.body

      // 同じtableType内で既に同名の盟員がいれば、その行をnullにする（memberNameの更新時のみ）
      if (memberName) {
        const { data: dupes } = await supabase
          .from('reinf')
          .select('id')
          .eq('table_type', tableType || 'ransaki')
          .eq('member_name', memberName)
          .neq('id', rowId)

        if (dupes && dupes.length > 0) {
          const { error: clearErr } = await supabase
            .from('reinf')
            .update({ member_name: null })
            .in('id', dupes.map(d => d.id))
          if (clearErr) return res.status(500).json({ error: clearErr })
        }
      }

      // リクエストに含まれるフィールドだけを更新する（部分更新）。
      // 例えばsortOrderのみを渡した場合、memberNameやペア情報は変更せず並び順だけを書き換えられる。
      const updates = {}
      if (memberName !== undefined) updates.member_name = memberName || null
      if (normalMain !== undefined) updates.normal_main = normalMain || null
      if (normalSub !== undefined) updates.normal_sub = normalSub || null
      if (castleMain !== undefined) updates.castle_main = castleMain || null
      if (castleSub !== undefined) updates.castle_sub = castleSub || null
      if (sortOrder !== undefined) {
        const so = parseInt(sortOrder)
        if (isNaN(so)) return res.status(400).json({ error: 'invalid sortOrder' })
        updates.sort_order = so
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: '更新内容がありません' })
      }

      const { error } = await supabase
        .from('reinf')
        .update(updates)
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
    const { tableType, afterId } = req.body
    const tt = tableType || 'ransaki'
    let nextOrder

    if (afterId) {
      // afterId行の直後に挿入する（アンケート投票済みペアの追加用）
      const { data: afterRow, error: afterErr } = await supabase
        .from('reinf')
        .select('sort_order')
        .eq('id', afterId)
        .eq('table_type', tt)
        .single()
      if (afterErr || !afterRow) return res.status(400).json({ error: 'invalid afterId' })

      // afterRowより後ろの行を1つずつ後ろにずらして隙間を作る（後ろから順に更新して重複を避ける）
      const { data: laterRows, error: laterErr } = await supabase
        .from('reinf')
        .select('id, sort_order')
        .eq('table_type', tt)
        .gt('sort_order', afterRow.sort_order)
        .order('sort_order', { ascending: false })
      if (laterErr) return res.status(500).json({ error: laterErr })

      for (const r of (laterRows || [])) {
        const { error: shiftErr } = await supabase
          .from('reinf')
          .update({ sort_order: r.sort_order + 1 })
          .eq('id', r.id)
        if (shiftErr) return res.status(500).json({ error: shiftErr })
      }

      nextOrder = afterRow.sort_order + 1
    } else {
      const { data: existing } = await supabase
        .from('reinf')
        .select('sort_order')
        .eq('table_type', tt)
        .order('sort_order', { ascending: false })
        .limit(1)

      nextOrder = existing && existing.length > 0
        ? existing[0].sort_order + 1
        : 0
    }

    const { data, error } = await supabase
      .from('reinf')
      .insert({
        member_name: null,
        normal_main: null,
        normal_sub: null,
        castle_main: null,
        castle_sub: null,
        sort_order: nextOrder,
        table_type: tt,
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error })
    return res.json(data)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}