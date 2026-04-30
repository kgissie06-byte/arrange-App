import { createClient } from '@supabase/supabase-js'

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

  const matched = (data || []).find(row => row.password === password)

  if (!matched) {
    return res.status(401).json({ error: 'パスワードが違います' })
  }

  // matched.id は 'admin' または 'user'
  return res.json({ role: matched.id })
}
