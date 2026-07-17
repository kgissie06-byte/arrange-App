import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ログイン前でも使える簡易な合言葉ゲート（本格的な認証ではなく、身内向けの目隠し程度のもの）
// 本番運用時は環境変数 ID_CHECK_CODE で上書きすることを推奨
const ID_CHECK_CODE = process.env.ID_CHECK_CODE || 'hououtai'

// 初期パスワードでない場合に表示するマスク（実際の文字数が分からないよう固定長にする）
const MASKED_PASSWORD = '●●●●●●'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { code } = req.body || {}
  if (typeof code !== 'string' || code.trim() !== ID_CHECK_CODE) {
    return res.status(403).json({ error: 'コードが違います' })
  }

  // 有効なメンバーのみ対象
  const { data: membersRaw, error: membersErr } = await supabase
    .from('members')
    .select('id, name, role, status, auth_role(is_initial_password, initial_password_plain)')
    .eq('status', '有効')
    .order('created_at', { ascending: true })

  if (membersErr) return res.status(500).json({ error: membersErr.message || membersErr })

  const members = (membersRaw || []).map(m => {
    const authRole = m.auth_role || {}
    const canShowPlain = authRole.is_initial_password === true && !!authRole.initial_password_plain
    return {
      id: m.id,
      name: m.name,
      role: m.role || '',
      password: canShowPlain ? authRole.initial_password_plain : MASKED_PASSWORD,
    }
  })

  return res.json({ members })
}