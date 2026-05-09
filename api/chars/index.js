import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '../../lib/auth.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  // キャラ追加は管理者のみ
  const auth = await requireAuth(req, res, 'admin')
  if (!auth) return

  if (req.method === 'POST') {
    const { name, yomi, rars, ranks, shukuens, img, exSotsui } = req.body

    if (!name) return res.status(400).json({ error: 'name is required' })

    const { data, error } = await supabase
      .from('chars')
      .insert({
        name,
        yomi: yomi || '',
        rars: rars || [],
        ranks: ranks || [],
        shukuens: shukuens || [{enabled:false,members:[]},{enabled:false,members:[]}],
        img: img || null,
        ex_sotsui: exSotsui || false,
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error })

    return res.json(data)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
