import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '../../lib/auth'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  // キャラ管理は管理者のみ
  const auth = await requireAuth(req, res, 'admin')
  if (!auth) return

  const { name } = req.query

  if (!name) return res.status(400).json({ error: 'name is required' })

  // キャラ更新（名前変更含む）
  if (req.method === 'PUT') {
    const { name: newName, yomi, rars, ranks, shukuen, shukuens, img, exSotsui } = req.body

    const updates = {}
    if (newName) updates.name = newName
    if (yomi !== undefined) updates.yomi = yomi
    if (rars !== undefined) updates.rars = rars
    if (ranks !== undefined) updates.ranks = ranks
    if (shukuens !== undefined) updates.shukuens = shukuens
    else if (shukuen !== undefined) updates.shukuen = shukuen
    if (img !== undefined) updates.img = img || null
    if (exSotsui !== undefined) updates.ex_sotsui = exSotsui

    const { error } = await supabase
      .from('chars')
      .update(updates)
      .eq('name', name)

    if (error) return res.status(500).json({ error })

    if (newName && newName !== name) {
      const { error: trainingErr } = await supabase
        .from('training')
        .update({ char_name: newName })
        .eq('char_name', name)

      if (trainingErr) return res.status(500).json({ error: trainingErr })
    }

    return res.json({ ok: true })
  }

  // キャラ削除
  if (req.method === 'DELETE') {
    const { data: charData } = await supabase
      .from('chars')
      .select('img')
      .eq('name', name)
      .single()

    if (charData?.img) {
      const fileName = charData.img.split('/').pop()
      await supabase.storage.from('char-images').remove([fileName])
    }

    const { error: trainingErr } = await supabase
      .from('training')
      .delete()
      .eq('char_name', name)

    if (trainingErr) return res.status(500).json({ error: trainingErr })

    const { error } = await supabase
      .from('chars')
      .delete()
      .eq('name', name)

    if (error) return res.status(500).json({ error })

    return res.json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
