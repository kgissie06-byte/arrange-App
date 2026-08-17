import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '../lib/auth.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// PostgREST/Supabaseはデフォルトで1リクエスト最大1000行しか返さないため、
// 1000件を超える場合に備えてページングしながら全件取得する
const PAGE_SIZE = 1000

// このIDはガチ管理者用のため、メンバー一覧など画面上のどこにも表示しない
const HIDDEN_MEMBER_ID = 1

// ===== Cloudinary画像の帯域最適化 =====
// 一覧表示(.cc-img)は52px角にしか表示していないのに、元画像をそのまま配信すると
// 無駄に帯域を消費する（Cloudinaryのプラン上限＝「パンク」の原因）。
// f_auto,q_auto はブラウザ対応フォーマットへの自動変換・知覚的に無劣化な範囲での
// 自動圧縮なので、見た目の粗さはほぼ変えずにファイルサイズだけ削れる。
// w_,h_,c_fill で表示サイズ以上の解像度を送らないようにする。
// ※DBには元URLのまま保存されているので、ここでの変換は表示用の一時的なもの。
function optimizeCloudinaryUrl(url, size = 120) {
  if (typeof url !== 'string' || !url) return url
  if (!/(^|\.)res\.cloudinary\.com\//.test(url)) return url // cloudinary以外のURLは無変換
  const marker = '/upload/'
  const idx = url.indexOf(marker)
  if (idx === -1) return url // 想定外の形式のURLはそのまま返す（壊さない）
  const insertPos = idx + marker.length
  return url.slice(0, insertPos)
    + `f_auto,q_auto,w_${size},h_${size},c_fill/`
    + url.slice(insertPos)
}

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

  // chars/members/training/reinf は互いに依存しない独立したクエリなので、
  // 直列(await の連続)で待たず Promise.all で並列実行し、合計の待ち時間を
  // 「4クエリの合計」ではなく「一番遅い1クエリ分」まで縮める
  const [charsResult, membersResult, trainingResult, reinfResult] = await Promise.all([
    supabase.from('chars').select('*').order('created_at', { ascending: true }),
    supabase.from('members').select('*, auth_role(role)').neq('id', HIDDEN_MEMBER_ID).order('created_at', { ascending: true }),
    fetchAllTraining().then(data => ({ data, error: null })).catch(error => ({ data: null, error })),
    supabase.from('reinf').select('*').order('sort_order', { ascending: true }),
  ])

  // キャラ一覧
  const { data: charsRaw, error: charsErr } = charsResult
  if (charsErr) return res.status(500).json({ error: charsErr })

  const chars = (charsRaw || []).map(c => ({
    name: c.name,
    yomi: c.yomi || '',
    rars: c.rars || [],
    ranks: c.ranks || [],
    shukuens: c.shukuens || (c.shukuen ? [c.shukuen, {enabled:false,members:[]}] : [{enabled:false,members:[]},{enabled:false,members:[]}]),
    img: optimizeCloudinaryUrl(c.img) || null,
    exSotsui: c.ex_sotsui || false,
    updatedAt: c.updated_at || c.created_at || null,
  }))

  // メンバー一覧（auth_roleをJOINして権限も取得／管理者(ID:1)は除外）
  const { data: membersRaw, error: membersErr } = membersResult
  if (membersErr) return res.status(500).json({ error: membersErr })

  // 育成データ
  const { data: trainingRaw, error: trainingErr } = trainingResult
  if (trainingErr) return res.status(500).json({ error: trainingErr })

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
  const { data: reinfRaw, error: reinfErr } = reinfResult
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