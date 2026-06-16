import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '../lib/auth.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {

  // ログイン済みであれば誰でもOK
  const auth = await requireAuth(req, res)
  if (!auth) return

  // 取得
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('training')
      .select('*')

    if (error) return res.status(500).json({ error })

    return res.json(data)
  }

  // 保存（upsert）
  if (req.method === 'POST') {
    // 管理者のみ書き込み可能
    if (auth.role !== 'admin') {
      return res.status(403).json({ error: '権限がありません' })
    }

    const { memberId, charName, rar, ranks, ex } = req.body

    if (!memberId || !charName) {
      return res.status(400).json({ error: 'memberId and charName are required' })
    }

    const { error } = await supabase
      .from('training')
      .upsert({
        member_id: memberId,
        char_name: charName,
        rarity: rar,
        ranks: ranks,
        ex: ex || null,
      }, {
        onConflict: 'member_id,char_name'
      })

    if (error) return res.status(500).json({ error })

    return res.json({ ok: true })
  }

  // 削除
  if (req.method === 'DELETE') {
    // 管理者のみ削除可能
    if (auth.role !== 'admin') {
      return res.status(403).json({ error: '権限がありません' })
    }

    const { memberId, charName } = req.body

    if (!memberId || !charName) {
      return res.status(400).json({ error: 'memberId and charName are required' })
    }

    const { error } = await supabase
      .from('training')
      .delete()
      .eq('member_id', memberId)
      .eq('char_name', charName)

    if (error) return res.status(500).json({ error })

    return res.json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}