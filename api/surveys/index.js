import { createClient } from '@supabase/supabase-js'
import { requireAuth, requireReinfAuth } from '../../lib/auth.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  // GET: 全ユーザー閲覧可
  if (req.method === 'GET') {
    const auth = await requireAuth(req, res)
    if (!auth) return
    return await getSurveys(req, res, auth)
  }

  // POST: 援軍管理者・管理者のみ作成可
  if (req.method === 'POST') {
    const auth = await requireReinfAuth(req, res)
    if (!auth) return
    return await createSurvey(req, res, auth)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

async function getSurveys(req, res, auth) {
  // アンケート一覧（ペア・投票数も集計して返す）
  const { data: surveysRaw, error } = await supabase
    .from('surveys')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  const surveyIds = (surveysRaw || []).map(s => s.id)
  if (!surveyIds.length) return res.json([])

  // ペア一覧
  const { data: pairsRaw } = await supabase
    .from('survey_pairs')
    .select('*')
    .in('survey_id', surveyIds)
    .order('created_at', { ascending: true })

  // 投票数（pair_id ごとの集計）
  const { data: votesRaw } = await supabase
    .from('survey_votes')
    .select('pair_id, survey_id')
    .in('survey_id', surveyIds)

  // セッションキー（自分の投票）
  const sessionKey = auth.jti || auth.sessionKey || null

  // 自分の投票先 pair_id
  const { data: myVotesRaw } = sessionKey
    ? await supabase
        .from('survey_votes')
        .select('pair_id, survey_id')
        .in('survey_id', surveyIds)
        .eq('session_key', sessionKey)
    : { data: [] }

  const myVoteMap = {}
  ;(myVotesRaw || []).forEach(v => { myVoteMap[v.survey_id] = v.pair_id })

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

  const surveys = (surveysRaw || []).map(s => ({
    id: s.id,
    title: s.title,
    tableType: s.table_type,
    deadline: s.deadline,
    createdAt: s.created_at,
    pairs: pairsMap[s.id] || [],
    myVotePairId: myVoteMap[s.id] || null,
  }))

  return res.json(surveys)
}

async function createSurvey(req, res, auth) {
  const { title, tableType, deadline } = req.body

  if (!title || !deadline) {
    return res.status(400).json({ error: 'title と deadline は必須です' })
  }
  if (new Date(deadline).getTime() <= Date.now()) {
    return res.status(400).json({ error: '終了日時は未来の日時を設定してください' })
  }

  const { data, error } = await supabase
    .from('surveys')
    .insert({
      title,
      table_type: tableType || 'ransaki',
      deadline,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  return res.status(201).json({
    id: data.id,
    title: data.title,
    tableType: data.table_type,
    deadline: data.deadline,
    createdAt: data.created_at,
    pairs: [],
    myVotePairId: null,
  })
}
