import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '../../../lib/auth.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // 全ユーザー投票可
  const auth = await requireAuth(req, res)
  if (!auth) return

  const { id } = req.query
  const surveyId = parseInt(id)
  if (isNaN(surveyId)) return res.status(400).json({ error: 'invalid id' })

  const { pairId } = req.body  // null = 投票取消

  // セッションキー（JWT の jti を流用）
  const sessionKey = auth.jti || auth.sessionKey
  if (!sessionKey) return res.status(400).json({ error: 'セッションキーが取得できません' })

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

  // 既存の投票を確認
  const { data: existing } = await supabase
    .from('survey_votes')
    .select('id, pair_id')
    .eq('survey_id', surveyId)
    .eq('session_key', sessionKey)
    .maybeSingle()

  // 投票取消（pairId = null または 同じペアに再投票）
  if (!pairId || (existing && existing.pair_id === pairId)) {
    if (existing) {
      await supabase.from('survey_votes').delete().eq('id', existing.id)
    }
    return res.json({ ok: true, myVotePairId: null })
  }

  // 別のペアへ投票 → upsert（survey_id + session_key がUNIQUE）
  const { error } = await supabase
    .from('survey_votes')
    .upsert({
      pair_id: pairId,
      survey_id: surveyId,
      session_key: sessionKey,
    }, {
      onConflict: 'survey_id,session_key',
    })

  if (error) return res.status(500).json({ error: error.message })

  return res.json({ ok: true, myVotePairId: pairId })
}
