import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '../lib/auth.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// PostgREST/Supabaseはデフォルトで1リクエスト最大1000行しか返さないため、
// 1000件を超える場合に備えてページングしながら全件取得する
const PAGE_SIZE = 1000

async function fetchAllTraining() {
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('training')
      .select('*')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ログイン済みであれば誰でもOK
  const auth = await requireAuth(req, res)
  if (!auth) return

  // キャラ一覧
  const { data: charsRaw, error: charsErr } = await supabase
    .from('chars')
    .select('*')
    .order('created_at', { ascending: true })
  if (charsErr) return res.status(500).json({ error: charsErr })

  const chars = (charsRaw || []).map(c => ({
    name: c.name,
    yomi: c.yomi || '',
    rars: c.rars || [],
    ranks: c.ranks || [],
    shukuens: c.shukuens || (c.shukuen ? [c.shukuen, {enabled:false,members:[]}] : [{enabled:false,members:[]},{enabled:false,members:[]}]),
    img: c.img || null,
    exSotsui: c.ex_sotsui || false,
    updatedAt: c.updated_at || c.created_at || null,
  }))

  // メンバー一覧（auth_roleをJOINして権限も取得）
  const { data: membersRaw, error: membersErr } = await supabase
    .from('members')
    .select('*, auth_role(role)')
    .order('created_at', { ascending: true })
  if (membersErr) return res.status(500).json({ error: membersErr })

  // 育成データ
  let trainingRaw
  try {
    trainingRaw = await fetchAllTraining()
  } catch (trainingErr) {
    return res.status(500).json({ error: trainingErr })
  }

  const members = (membersRaw || []).map(m => ({
    id: m.id,
    name: m.name,
    role: m.role || '',
    status: m.status || '有効',
    memberRole: m.auth_role?.role || 'user',
    chars: (trainingRaw || [])
      .filter(t => t.member_id === m.id)
      .map(t => ({
        name: t.char_name,
        rar: t.rarity,
        ranks: t.ranks || [],
        ex: t.ex || null,
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
    tableType: r.table_type || 'ransaki',
  }))

  return res.json({
    members,
    chars,
    reinf,
    filRar: [],
    filRank: [],
    filRole: [],
    role: auth.role,
    memberId: auth.memberId || null,
  })
}