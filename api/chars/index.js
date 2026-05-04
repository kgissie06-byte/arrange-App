import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  // キャラ追加
  if (req.method === 'POST') {
    const { name, yomi, rars, ranks, shukuens } = req.body

    if (!name) return res.status(400).json({ error: 'name is required' })

    const { data, error } = await supabase
      .from('chars')
      .insert({
        name,
        yomi: yomi || '',
        rars: rars || [],
        ranks: ranks || [],
        shukuens: shukuens || [{enabled:false,members:[]},{enabled:false,members:[]}]
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error })

    return res.json(data)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
