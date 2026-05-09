import { createClient } from '@supabase/supabase-js'
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
    const { name, role } = req.body

    if (!name) return res.status(400).json({ error: 'name is required' })

    const { data, error } = await supabase
      .from('members')
      .insert({ name, role: role || '' })
      .select()
      .single()

    if (error) return res.status(500).json({ error })

    return res.json(data)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
