import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  const { name } = req.query

  if (!name) return res.status(400).json({ error: 'name is required' })

  // キャラ更新（名前変更含む）
  if (req.method === 'PUT') {
    const { name: newName, rars, ranks, shukuen } = req.body

    const updates = {}
    if (newName) updates.name = newName
    if (rars !== undefined) updates.rars = rars
    if (ranks !== undefined) updates.ranks = ranks
    if (shukuen !== undefined) updates.shukuen = shukuen

    const { error } = await supabase
      .from('chars')
      .update(updates)
      .eq('name', name)

    if (error) return res.status(500).json({ error })

    // 名前が変わった場合、育成データのchar_nameも更新
    if (newName && newName !== name) {
      const { error: trainingErr } = await supabase
        .from('training')
        .update({ char_name: newName })
        .eq('char_name', name)

      if (trainingErr) return res.status(500).json({ error: trainingErr })
    }

    return res.json({ ok: true })
  }

  // キャラ削除（関連する育成データも削除）
  if (req.method === 'DELETE') {
    // 育成データを先に削除
    const { error: trainingErr } = await supabase
      .from('training')
      .delete()
      .eq('char_name', name)

    if (trainingErr) return res.status(500).json({ error: trainingErr })

    // キャラ削除
    const { error } = await supabase
      .from('chars')
      .delete()
      .eq('name', name)

    if (error) return res.status(500).json({ error })

    return res.json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
