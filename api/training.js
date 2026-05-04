import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export default async function handler(req, res) {

  // 取得
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('training')
      .select('*')

    if (error) return res.status(500).json({ error })

    return res.json(data)
  }

  // 保存（upsert: member_id + char_name の複合キーで上書き）
  if (req.method === 'POST') {
    const { memberId, charName, rar, ranks } = req.body

    if (!memberId || !charName) {
      return res.status(400).json({ error: 'memberId and charName are required' })
    }

    const { error } = await supabase
      .from('training')
      .upsert({
        member_id: memberId,
        char_name: charName,
        rarity: rar,
        ranks: ranks
      }, {
        onConflict: 'member_id,char_name'
      })

    if (error) return res.status(500).json({ error })

    return res.json({ ok: true })
  }

  // 削除（未入力に戻す）
  if (req.method === 'DELETE') {
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
