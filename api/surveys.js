import { createClient } from '@supabase/supabase-js'
import { requireAuth, requireReinfAuth } from '../lib/auth.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * /api/surveys  ← 1つのServerless Functionで全ルートをさばく
 *
 * GET    /api/surveys              → 一覧取得（全ユーザー）
 * POST   /api/surveys              → 作成（援軍管理者・管理者）
 * GET    /api/surveys?id=XX        → 単件取得（全ユーザー）
 * POST   /api/surveys?id=XX        → ペア追加（全ユーザー、受付中のみ）
 * DELETE /api/surveys?id=XX        → 削除（援軍管理者・管理者）
 * POST   /api/surveys?action=vote  → 投票・取消（全ユーザー）
 */
export default async function handler(req, res) {
  const { id, action } = req.query
  const surveyId = id ? parseInt(id) : null

  // ----- 投票 -----
  if (action === 'vote') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const auth = await requireAuth(req, res)
    if (!auth) return
    return await handleVote(req, res, auth)
  }

  // ----- 単件操作 -----
  if (surveyId) {
    if (isNaN(surveyId)) return res.status(400).json({ error: 'invalid id' })

    if (req.method === 'GET') {
      const auth = await requireAuth(req, res)
      if (!auth) return
      return await getSurvey(res, surveyId, auth)
    }
    if (req.method === 'POST') {
      const auth = await requireAuth(req, res)
      if (!auth) return
      return await addPair(req, res, surveyId)
    }
    if (req.method === 'DELETE') {
      const auth = await requireReinfAuth(req, res)
      if (!auth) return
      return await deleteSurvey(res, surveyId)
    }
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ----- 一覧・作成 -----
  if (req.method === 'GET') {
    const auth = await requireAuth(req, res)
    if (!auth) return
    return await getSurveys(res, auth)
  }
  if (req.method === 'POST') {
    const auth = await requireReinfAuth(req, res)
    if (!auth) return
    return await createSurvey(req, res, auth)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

/* ===== 一覧取得 ===== */
async function getSurveys(res, auth) {
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
    .select('pair_id, survey_id')
    .in('survey_id', surveyIds)

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

  const sessionKey = auth.jti || `${auth.role}_${auth.iat}`
  const myVoteMap = {}
  if (sessionKey) {
    const { data: myVotesRaw } = await supabase
      .from('survey_votes')
      .select('pair_id, survey_id')
      .in('survey_id', surveyIds)
      .eq('session_key', sessionKey)
    ;(myVotesRaw || []).forEach(v => { myVoteMap[v.survey_id] = v.pair_id })
  }

  return res.json((surveysRaw || []).map(s => ({
    id: s.id,
    title: s.title,
    tableType: s.table_type,
    deadline: s.deadline,
    createdAt: s.created_at,
    pairs: pairsMap[s.id] || [],
    myVotePairId: myVoteMap[s.id] || null,
  })))
}

/* ===== 単件取得 ===== */
async function getSurvey(res, surveyId, auth) {
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

  const sessionKey = auth.jti || `${auth.role}_${auth.iat}`
  let myVotePairId = null
  if (sessionKey) {
    const { data: myVote } = await supabase
      .from('survey_votes').select('pair_id')
      .eq('survey_id', surveyId).eq('session_key', sessionKey).maybeSingle()
    myVotePairId = myVote?.pair_id || null
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
    myVotePairId,
  })
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
    deadline: data.deadline, createdAt: data.created_at, pairs: [], myVotePairId: null,
  })
}

/* ===== ペア追加 ===== */
async function addPair(req, res, surveyId) {
  const { main, sub } = req.body
  if (!main && !sub) return res.status(400).json({ error: '大将か副将を選択してください' })

  const { data: sv } = await supabase
    .from('surveys').select('deadline').eq('id', surveyId).single()
  if (!sv) return res.status(404).json({ error: 'アンケートが見つかりません' })
  if (new Date(sv.deadline).getTime() <= Date.now()) {
    return res.status(400).json({ error: 'このアンケートは終了しています' })
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

/* ===== 投票・取消 ===== */
async function handleVote(req, res, auth) {
  const { surveyId, pairId } = req.body
  if (!surveyId) return res.status(400).json({ error: 'surveyId is required' })

  const sessionKey = auth.jti || `${auth.role}_${auth.iat}`
  if (!sessionKey) return res.status(400).json({ error: 'セッションキーが取得できません' })

  const { data: sv } = await supabase
    .from('surveys').select('deadline').eq('id', surveyId).single()
  if (!sv) return res.status(404).json({ error: 'アンケートが見つかりません' })
  if (new Date(sv.deadline).getTime() <= Date.now()) {
    return res.status(400).json({ error: 'このアンケートは終了しています' })
  }

  const { data: existing } = await supabase
    .from('survey_votes').select('id, pair_id')
    .eq('survey_id', surveyId).eq('session_key', sessionKey).maybeSingle()

  // 同じペアへの再投票 or pairId=null → 取消
  if (!pairId || (existing && existing.pair_id === pairId)) {
    if (existing) await supabase.from('survey_votes').delete().eq('id', existing.id)
    return res.json({ ok: true, myVotePairId: null })
  }

  // 別ペアへ投票（upsert）
  const { error } = await supabase.from('survey_votes').upsert(
    { pair_id: pairId, survey_id: surveyId, session_key: sessionKey },
    { onConflict: 'survey_id,session_key' }
  )
  if (error) return res.status(500).json({ error: error.message })

  return res.json({ ok: true, myVotePairId: pairId })
}