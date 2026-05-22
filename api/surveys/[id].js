import { createClient } from '@supabase/supabase-js'
import { requireAuth, requireReinfAuth } from '../../lib/auth.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  const { id } = req.query
  const surveyId = parseInt(id)
  if (isNaN(surveyId)) return res.status(400).json({ error: 'invalid id' })

  // GET: 全ユーザー閲覧可
  if (req.method === 'GET') {
    const auth = await requireAuth(req, res)
    if (!auth) return
    return await getSurvey(req, res, surveyId, auth)
  }

  // POST: ペア追加 — 全ユーザー可（受付中アンケートのみ）
  if (req.method === 'POST') {
    const auth = await requireAuth(req, res)
    if (!auth) return
    return await addPair(req, res, surveyId)
  }

  // DELETE: アンケート削除 — 援軍管理者・管理者のみ
  if (req.method === 'DELETE') {
    const auth = await requireReinfAuth(req, res)
    if (!auth) return
    return await deleteSurvey(req, res, surveyId)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

async function getSurvey(req, res, surveyId, auth) {
  const { data: sv, error } = await supabase
    .from('surveys')
    .select('*')
    .eq('id', surveyId)
    .single()

  if (error || !sv) return res.status(404).json({ error: 'not found' })

  const { data: pairsRaw } = await supabase
    .from('survey_pairs')
    .select('*')
    .eq('survey_id', surveyId)
    .order('created_at', { ascending: true })

  const pairIds = (pairsRaw || []).map(p => p.id)
  const { data: votesRaw } = pairIds.length
    ? await supabase.from('survey_votes').select('pair_id').in('pair_id', pairIds)
    : { data: [] }

  const voteCountMap = {}
  ;(votesRaw || []).forEach(v => {
    voteCountMap[v.pair_id] = (voteCountMap[v.pair_id] || 0) + 1
  })

  const sessionKey = auth.jti || auth.sessionKey || null
  let myVotePairId = null
  if (sessionKey) {
    const { data: myVote } = await supabase
      .from('survey_votes')
      .select('pair_id')
      .eq('survey_id', surveyId)
      .eq('session_key', sessionKey)
      .maybeSingle()
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

async function addPair(req, res, surveyId) {
  const { main, sub } = req.body

  if (!main && !sub) {
    return res.status(400).json({ error: '大将か副将を選択してください' })
  }

  // アンケートの存在・期限チェック
  const { data: sv } = await supabase
    .from('surveys')
    .select('deadline')
    .eq('id', surveyId)
    .single()

  if (!sv) return res.status(404).json({ error: 'アンケートが見つかりません' })
  if (new Date(sv.deadline).getTime() <= Date.now()) {
    return res.status(400).json({ error: 'このアンケートは終了しています' })
  }

  // 重複チェック
  const { data: dup } = await supabase
    .from('survey_pairs')
    .select('id')
    .eq('survey_id', surveyId)
    .eq('main_char', main || '')
    .eq('sub_char', sub || '')
    .maybeSingle()

  if (dup) return res.status(400).json({ error: '同じペアが既に登録されています' })

  const { data, error } = await supabase
    .from('survey_pairs')
    .insert({
      survey_id: surveyId,
      main_char: main || null,
      sub_char: sub || null,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  return res.status(201).json({
    id: data.id,
    main: data.main_char || null,
    sub: data.sub_char || null,
    votes: 0,
  })
}

async function deleteSurvey(req, res, surveyId) {
  const { error } = await supabase
    .from('surveys')
    .delete()
    .eq('id', surveyId)

  if (error) return res.status(500).json({ error: error.message })

  return res.json({ ok: true })
}
