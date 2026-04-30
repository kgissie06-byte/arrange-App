import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  // 援軍行追加
  if (req.method === 'POST') {
    // 現在の最大sort_orderを取得して末尾に追加
    const { data: existing } = await supabase
      .from('reinf')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextOrder = existing && existing.length > 0
      ? (existing[0].sort_order + 1)
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
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error })

    return res.json(data)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
