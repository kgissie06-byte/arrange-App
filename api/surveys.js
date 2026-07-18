import { createClient } from '@supabase/supabase-js'
import { requireAuth, requireReinfAuth } from '../lib/auth.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/** tableTypeとメンバーの所属が一致するか確認する */
const TABLE_TYPE_ROLE_MAP = {
  ransaki: '乱咲',
  tsubomi: '蕾',
}

/**
 * /api/surveys  ← 1つのServerless Functionで全ルートをさばく
 *
 * GET    /api/surveys              → 一覧取得（全ユーザー）
 * POST   /api/surveys              → 作成（援軍管理者・管理者）
 * GET    /api/surveys?id=XX        → 単件取得（全ユーザー）
 * POST   /api/surveys?id=XX        → ペア追加（全ユーザー、受付中のみ）
 * DELETE /api/surveys?id=XX        → 削除（援軍管理者・管理者）
 * POST   /api/surveys?action=vote  → 投票・取消（全ユーザー、複数ペア可）
 * GET    /api/surveys?action=voters&id=XX → 投票者一覧取得（全ユーザー）
 */
export default async function handler(req, res) {
  const { id, action } = req.query
  const surveyId = id ? parseInt(id) : null

  // ----- 既読状態（アンケートタブの未読バッジ用。新規Functionを増やさず既存のこのエンドポイントに相乗り） -----
  if (action === 'seen') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const auth = await requireAuth(req, res)
    if (!auth) return
    return await getSeen(res, auth)
  }
  if (action === 'markSeen') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const auth = await requireAuth(req, res)
    if (!auth) return
    return await markSeen(res, auth)
  }

  // ----- 投票 -----
  if (action === 'vote') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const auth = await requireAuth(req, res)
    if (!auth) return
    return await handleVote(req, res, auth)
  }

  // ----- 投票者一覧 -----
  if (action === 'voters') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!surveyId || isNaN(surveyId)) return res.status(400).json({ error: 'invalid id' })
    return await getVoters(res, surveyId)
  }

  // ----- 単件操作 -----
  if (surveyId) {
    if (isNaN(surveyId)) return res.status(400).json({ error: 'invalid id' })

    if (req.method === 'GET') {
      const auth = await requireAuth(req, res)
      if (!auth) return
      return await getSurvey(res, surveyId, auth, req)
    }
    if (req.method === 'PUT') {
      const auth = await requireReinfAuth(req, res)
      if (!auth) return
      const { title, deadline } = req.body
      if (!title && !deadline) return res.status(400).json({ error: 'title または deadline が必要です' })
      if (deadline && new Date(deadline).getTime() <= Date.now()) {
        return res.status(400).json({ error: '終了日時は未来の日時を設定してください' })
      }
      const updates = {}
      if (title) updates.title = title
      if (deadline) updates.deadline = deadline
      const { error } = await supabase.from('surveys').update(updates).eq('id', surveyId)
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ ok: true })
    }
    if (req.method === 'POST') {
      const auth = await requireAuth(req, res)
      if (!auth) return
      return await addPair(req, res, surveyId)
    }
    if (req.method === 'DELETE') {
      const auth = await requireAuth(req, res, 'admin')
      if (!auth) return
      return await deleteSurvey(res, surveyId)
    }
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ----- 一覧・作成 -----
  if (req.method === 'GET') {
    const auth = await requireAuth(req, res)
    if (!auth) return
    return await getSurveys(res, auth, req)
  }
  if (req.method === 'POST') {
    const auth = await requireReinfAuth(req, res)
    if (!auth) return
    return await createSurvey(req, res, auth)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

/* ===== 一覧取得 ===== */
async function getSurveys(res, auth, req) {
  const { data: surveysRaw, error } = await supabase
    .from('surveys')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })

  const surveyIds = (surveysRaw || []).map(s => s.id)
  if (!surveyIds.length) return res.json([])

  const { data: pairsRaw } = await supabase
    .from('survey_pairs')
    .select('*')
    .in('survey_id', surveyIds)
    .order('created_at', { ascending: true })

  const { data: votesRaw } = await supabase
    .from('survey_votes')
    .select('pair_id, survey_id, member_id')
    .in('survey_id', surveyIds)

  // ペアごとの得票数
  const voteCountMap = {}
  ;(votesRaw || []).forEach(v => {
    voteCountMap[v.pair_id] = (voteCountMap[v.pair_id] || 0) + 1
  })

  const pairsMap = {}
  ;(pairsRaw || []).forEach(p => {
    if (!pairsMap[p.survey_id]) pairsMap[p.survey_id] = []
    pairsMap[p.survey_id].push({
      id: p.id,
      main: p.main_char || null,
      sub: p.sub_char || null,
      votes: voteCountMap[p.id] || 0,
    })
  })

  // 自分の投票済みペアID一覧（クエリパラメータのmemberIdで管理）
  const memberId = req.query.memberId ? parseInt(req.query.memberId) : null
  const myVoteMap = {}
  if (memberId) {
    const { data: myVotesRaw } = await supabase
      .from('survey_votes')
      .select('pair_id, survey_id')
      .in('survey_id', surveyIds)
      .eq('member_id', memberId)
    ;(myVotesRaw || []).forEach(v => {
      if (!myVoteMap[v.survey_id]) myVoteMap[v.survey_id] = []
      myVoteMap[v.survey_id].push(v.pair_id)
    })
  }

  return res.json((surveysRaw || []).map(s => ({
    id: s.id,
    title: s.title,
    tableType: s.table_type,
    deadline: s.deadline,
    createdAt: s.created_at,
    pairs: pairsMap[s.id] || [],
    myVotePairIds: myVoteMap[s.id] || [],
  })))
}

/* ===== 単件取得 ===== */
async function getSurvey(res, surveyId, auth, req) {
  const { data: sv, error } = await supabase
    .from('surveys').select('*').eq('id', surveyId).single()
  if (error || !sv) return res.status(404).json({ error: 'not found' })

  const { data: pairsRaw } = await supabase
    .from('survey_pairs').select('*').eq('survey_id', surveyId).order('created_at', { ascending: true })

  const pairIds = (pairsRaw || []).map(p => p.id)
  const voteCountMap = {}
  if (pairIds.length) {
    const { data: votesRaw } = await supabase
      .from('survey_votes').select('pair_id').in('pair_id', pairIds)
    ;(votesRaw || []).forEach(v => {
      voteCountMap[v.pair_id] = (voteCountMap[v.pair_id] || 0) + 1
    })
  }

  // 自分の投票済みペアID一覧
  const memberId = req.query.memberId ? parseInt(req.query.memberId) : null
  let myVotePairIds = []
  if (memberId) {
    const { data: myVotes } = await supabase
      .from('survey_votes').select('pair_id')
      .eq('survey_id', surveyId).eq('member_id', memberId)
    myVotePairIds = (myVotes || []).map(v => v.pair_id)
  }

  return res.json({
    id: sv.id,
    title: sv.title,
    tableType: sv.table_type,
    deadline: sv.deadline,
    createdAt: sv.created_at,
    pairs: (pairsRaw || []).map(p => ({
      id: p.id,
      main: p.main_char || null,
      sub: p.sub_char || null,
      votes: voteCountMap[p.id] || 0,
    })),
    myVotePairIds,
  })
}

/* ===== 投票者一覧取得 ===== */
async function getVoters(res, surveyId) {
  const { data: pairsRaw } = await supabase
    .from('survey_pairs').select('id, main_char, sub_char').eq('survey_id', surveyId)

  const pairIds = (pairsRaw || []).map(p => p.id)
  if (!pairIds.length) return res.json([])

  const { data: votesRaw, error } = await supabase
    .from('survey_votes')
    .select('pair_id, member_id, member_name')
    .in('pair_id', pairIds)
  if (error) return res.status(500).json({ error: error.message })

  // pairId → pair情報 のマップ
  const pairMap = {}
  ;(pairsRaw || []).forEach(p => {
    pairMap[p.id] = { main: p.main_char || null, sub: p.sub_char || null }
  })

  // memberId → 投票ペア一覧
  const memberVoteMap = {}
  ;(votesRaw || []).forEach(v => {
    const key = v.member_id
    if (!memberVoteMap[key]) {
      memberVoteMap[key] = { memberId: v.member_id, memberName: v.member_name || '?', pairIds: [] }
    }
    memberVoteMap[key].pairIds.push(v.pair_id)
  })

  return res.json(Object.values(memberVoteMap).map(m => ({
    memberId: m.memberId,
    memberName: m.memberName,
    pairIds: m.pairIds,
    votes: m.pairIds.map(pid => pairMap[pid]).filter(Boolean),
  })))
}

/* ===== 作成 ===== */
async function createSurvey(req, res) {
  const { title, tableType, deadline } = req.body
  if (!title || !deadline) return res.status(400).json({ error: 'title と deadline は必須です' })
  if (new Date(deadline).getTime() <= Date.now()) {
    return res.status(400).json({ error: '終了日時は未来の日時を設定してください' })
  }

  const { data, error } = await supabase
    .from('surveys')
    .insert({ title, table_type: tableType || 'ransaki', deadline })
    .select().single()
  if (error) return res.status(500).json({ error: error.message })

  return res.status(201).json({
    id: data.id, title: data.title, tableType: data.table_type,
    deadline: data.deadline, createdAt: data.created_at, pairs: [], myVotePairIds: [],
  })
}

/* ===== ペア追加 ===== */
async function addPair(req, res, surveyId) {
  const { main, sub, memberId: bodyMemberId } = req.body
  if (!main && !sub) return res.status(400).json({ error: '大将か副将を選択してください' })

  const { data: sv } = await supabase
    .from('surveys').select('deadline, table_type').eq('id', surveyId).single()
  if (!sv) return res.status(404).json({ error: 'アンケートが見つかりません' })
  if (new Date(sv.deadline).getTime() <= Date.now()) {
    return res.status(400).json({ error: 'このアンケートは終了しています' })
  }

  // 所属チェック：アンケートのtableTypeに対応する所属のメンバーのみペア追加可能
  const requiredRole = TABLE_TYPE_ROLE_MAP[sv.table_type]
  if (requiredRole && bodyMemberId) {
    const { data: memberData } = await supabase
      .from('members').select('role').eq('id', bodyMemberId).single()
    if (!memberData || memberData.role !== requiredRole) {
      return res.status(403).json({ error: `このアンケートは${requiredRole}のメンバーのみペアを追加できます` })
    }
  }

  const { data: dup } = await supabase
    .from('survey_pairs').select('id')
    .eq('survey_id', surveyId)
    .eq('main_char', main || '')
    .eq('sub_char', sub || '')
    .maybeSingle()
  if (dup) return res.status(400).json({ error: '同じペアが既に登録されています' })

  const { data, error } = await supabase
    .from('survey_pairs')
    .insert({ survey_id: surveyId, main_char: main || null, sub_char: sub || null })
    .select().single()
  if (error) return res.status(500).json({ error: error.message })

  return res.status(201).json({
    id: data.id, main: data.main_char || null, sub: data.sub_char || null, votes: 0,
  })
}

/* ===== 削除 ===== */
async function deleteSurvey(res, surveyId) {
  const { error } = await supabase.from('surveys').delete().eq('id', surveyId)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true })
}

/* ===== アンケート既読状態（バッジ用） ===== */
async function getSeen(res, auth) {
  if (!auth.memberId) return res.json({ lastSeen: null })
  const { data, error } = await supabase
    .from('auth_role')
    .select('survey_last_seen')
    .eq('member_id', auth.memberId)
    .single()
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ lastSeen: data?.survey_last_seen || null })
}

async function markSeen(res, auth) {
  if (!auth.memberId) return res.json({ ok: true, lastSeen: null })
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('auth_role')
    .update({ survey_last_seen: now })
    .eq('member_id', auth.memberId)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true, lastSeen: now })
}

/* ===== 投票・取消（複数ペア対応） ===== */
async function handleVote(req, res, auth) {
  const { surveyId, pairId, memberId: bodyMemberId } = req.body
  if (!surveyId) return res.status(400).json({ error: 'surveyId is required' })
  if (!pairId) return res.status(400).json({ error: 'pairId is required' })

  const memberId = bodyMemberId || null
  if (!memberId) return res.status(400).json({ error: 'メンバーIDが必要です。メンバーを選択してください' })

  // 表示名はクライアント入力を信用せず、DBの正の値を使う（なりすまし・スクリプト混入防止）
  const { data: memberRow } = await supabase
    .from('members').select('name').eq('id', memberId).maybeSingle()
  const memberName = memberRow?.name || null

  const { data: sv } = await supabase
    .from('surveys').select('deadline, table_type').eq('id', surveyId).single()
  if (!sv) return res.status(404).json({ error: 'アンケートが見つかりません' })
  if (new Date(sv.deadline).getTime() <= Date.now()) {
    return res.status(400).json({ error: 'このアンケートは終了しています' })
  }

  // 所属チェック：アンケートのtableTypeに対応する所属のメンバーのみ投票可能
  const requiredRole = TABLE_TYPE_ROLE_MAP[sv.table_type]
  if (requiredRole) {
    const { data: memberData } = await supabase
      .from('members').select('role').eq('id', memberId).single()
    if (!memberData || memberData.role !== requiredRole) {
      return res.status(403).json({ error: `このアンケートは${requiredRole}のメンバーのみ投票できます` })
    }
  }

  // 既にこのペアに投票済みか確認
  const { data: existing } = await supabase
    .from('survey_votes').select('id')
    .eq('survey_id', surveyId)
    .eq('member_id', memberId)
    .eq('pair_id', pairId)
    .maybeSingle()

  if (existing) {
    // 同じペアへの再投票 → 取消
    await supabase.from('survey_votes').delete().eq('id', existing.id)
    return res.json({ ok: true, action: 'removed', pairId })
  } else {
    // 新規投票
    const { error } = await supabase.from('survey_votes').insert({
      pair_id: pairId,
      survey_id: surveyId,
      member_id: memberId,
      member_name: memberName || null,
    })
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true, action: 'added', pairId })
  }
}