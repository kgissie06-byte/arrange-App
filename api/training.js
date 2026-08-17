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
  // まず件数だけを軽量に取得(head:trueなので行データ自体は転送されない)
  const { count, error: countErr } = await supabase
    .from('training')
    .select('*', { count: 'exact', head: true })
  if (countErr) return null
  if (!count) return []

  // 必要なページ数ぶんを「1ページ取れたら次を取りに行く」直列ループではなく、
  // 最初から全ページ分のリクエストをPromise.allで並列発行する
  const pageCount = Math.ceil(count / PAGE_SIZE)
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) => {
      const from = i * PAGE_SIZE
      return supabase.from('training').select('*').range(from, from + PAGE_SIZE - 1)
    })
  )

  const all = []
  for (const { data, error } of pages) {
    if (error) return null
    all.push(...(data || []))
  }
  return all
}

export default async function handler(req, res) {

  // ログイン済みであれば誰でもOK
  const auth = await requireAuth(req, res)
  if (!auth) return

  // 取得
  if (req.method === 'GET') {
    const data = await fetchAllTraining()
    if (data === null) return res.status(500).json({ error: 'failed to fetch training data' })

    return res.json(data)
  }

  // 保存（upsert）
  if (req.method === 'POST') {
    const { memberId, charName, rar, ranks, ex } = req.body

    if (!memberId || !charName) {
      return res.status(400).json({ error: 'memberId and charName are required' })
    }

    // 管理者 OR 自分自身のデータのみ書き込み可能
    if (auth.role !== 'admin' && auth.memberId !== memberId) {
      return res.status(403).json({ error: '権限がありません' })
    }

    const { error } = await supabase
      .from('training')
      .upsert({
        member_id: memberId,
        char_name: charName,
        rarity: rar,
        ranks: ranks,
        ex: ex || null,
      }, {
        onConflict: 'member_id,char_name'
      })

    if (error) return res.status(500).json({ error })

    return res.json({ ok: true })
  }

  // 削除
  if (req.method === 'DELETE') {
    const { memberId, charName } = req.body

    if (!memberId || !charName) {
      return res.status(400).json({ error: 'memberId and charName are required' })
    }

    // 管理者 OR 自分自身のデータのみ削除可能
    if (auth.role !== 'admin' && auth.memberId !== memberId) {
      return res.status(403).json({ error: '権限がありません' })
    }

    const { error } = await supabase
      .from('training')
      .delete()
      .eq('member_id', memberId)
      .eq('char_name', charName)

    if (error) return res.status(500).json({ error })

    return res.json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}