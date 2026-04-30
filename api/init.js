import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // キャラ一覧
  const { data: charsRaw, error: charsErr } = await supabase
    .from('chars')
    .select('*')
    .order('created_at', { ascending: true })
  if (charsErr) return res.status(500).json({ error: charsErr })

  const chars = (charsRaw || []).map(c => ({
    name: c.name,
    rars: c.rars || [],
    ranks: c.ranks || [],
    shukuen: c.shukuen || { enabled: false, members: [] },
  }))

  // メンバー一覧
  const { data: membersRaw, error: membersErr } = await supabase
    .from('members')
    .select('*')
    .order('created_at', { ascending: true })
  if (membersErr) return res.status(500).json({ error: membersErr })

  // 育成データ
  const { data: trainingRaw, error: trainingErr } = await supabase
    .from('training')
    .select('*')
  if (trainingErr) return res.status(500).json({ error: trainingErr })

  // メンバーごとに育成データをマージ
  const members = (membersRaw || []).map(m => ({
    id: m.id,
    name: m.name,
    role: m.role || '',
    chars: (trainingRaw || [])
      .filter(t => t.member_id === m.id)
      .map(t => ({
        name: t.char_name,
        rar: t.rarity,
        ranks: t.ranks || [],
      })),
  }))

  // 援軍表
  const { data: reinfRaw, error: reinfErr } = await supabase
    .from('reinf')
    .select('*')
    .order('sort_order', { ascending: true })
  if (reinfErr) return res.status(500).json({ error: reinfErr })

  const reinf = (reinfRaw || []).map(r => ({
    id: r.id,
    memberName: r.member_name || null,
    normalMain: r.normal_main || null,
    normalSub: r.normal_sub || null,
    castleMain: r.castle_main || null,
    castleSub: r.castle_sub || null,
    sortOrder: r.sort_order || 0,
  }))

  return res.json({
    members,
    chars,
    reinf,
    filRar: [],
    filRank: [],
    filRole: [],
  })
}
