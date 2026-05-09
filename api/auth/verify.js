import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { issueSession } from '../../lib/auth'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { password } = req.body
  if (!password) {
    return res.status(400).json({ error: 'password is required' })
  }

  const { data, error } = await supabase
    .from('passwords')
    .select('id, password')

  if (error) return res.status(500).json({ error: error.message })

  // bcryptで照合（旧: 平文比較）
  let matched = null
  for (const row of (data || [])) {
    const ok = await bcrypt.compare(password, row.password)
    if (ok) { matched = row; break }
  }

  if (!matched) {
    return res.status(401).json({ error: 'パスワードが違います' })
  }

  // JWTをhttpOnly Cookieにセット
  await issueSession(res, matched.id)

  return res.json({ role: matched.id })
}
