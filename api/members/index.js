import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { requireAuth } from '../../lib/auth.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  // メンバー追加は管理者のみ
  const auth = await requireAuth(req, res, 'admin')
  if (!auth) return

  if (req.method === 'POST') {
    const { name, role, status, memberRole, password } = req.body

    if (!name) return res.status(400).json({ error: 'name is required' })
    if (!memberRole) return res.status(400).json({ error: 'memberRole is required' })

    // パスワードが指定されている場合は4文字以上チェック
    if (password && password.length < 4) {
      return res.status(400).json({ error: '4文字以上のパスワードを設定してください' })
    }
    if (status && !['有効', '無効'].includes(status)) {
      return res.status(400).json({ error: 'status は 有効 か 無効 で指定してください' })
    }

    const { data, error } = await supabase
      .from('members')
      .insert({ name, role: role || '', status: status || '有効' })
      .select()
      .single()

    if (error) return res.status(500).json({ error })

    // パスワード未入力なら「年2桁 + ID4桁ゼロ埋め」で自動生成
    // 例: 2026年・ID17 → "260017"、2027年・ID100 → "270100"
    const yearStr = String(new Date().getFullYear()).slice(-2)  // "26"
    const idStr = String(data.id).padStart(4, '0')             // "0017"
    const finalPassword = password || `${yearStr}${idStr}`

    const hashed = await bcrypt.hash(finalPassword, 10)
    const { error: authErr } = await supabase
      .from('auth_role')
      .insert({
        member_id: data.id,
        role: memberRole,
        password: hashed,
        // ID確認画面で「初期パスワードのまま」の場合のみ平文を表示するため保持する
        initial_password_plain: finalPassword,
        is_initial_password: true,
      })
    if (authErr) return res.status(500).json({ error: authErr })

    // 完了後、ポップアップ表示用に平文パスワードも返す
    return res.json({
      ...data,
      memberRole,
      initialPassword: finalPassword,
    })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}