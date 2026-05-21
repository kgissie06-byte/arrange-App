import { createClient } from '@supabase/supabase-js'
import { requireReinfAuth } from '../../lib/auth.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  const auth = await requireReinfAuth(req, res)
  if (!auth) return

  if (req.method === 'POST') {
  const { tableType } = req.body   // ← 追加

  const { data: existing } = await supabase
    .from('reinf')
    .select('sort_order')
    .eq('table_type', tableType || 'ransaki')   // ← 追加: 対象テーブルの最大order
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
      table_type: tableType || 'ransaki',   // ← 追加
    })
    .select()
    .single()

    if (error) return res.status(500).json({ error })

    return res.json(data)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
