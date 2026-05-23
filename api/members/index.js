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
    const { name, role, memberRole, password } = req.body

     if (!name) return res.status(400).json({ error: 'name is required' })
    if (!memberRole) return res.status(400).json({ error: 'memberRole is required' })
    if (!password || password.length < 4) {
      return res.status(400).json({ error: 'password must be 4+ chars' })
    }

     const { data, error } = await supabase
       .from('members')
       .insert({ name, role: role || '' })
       .select()
       .single()

     if (error) return res.status(500).json({ error })

    const hashed = await bcrypt.hash(password, 10)
    const { error: authErr } = await supabase
      .from('auth_role')
      .insert({ member_id: data.id, role: memberRole, password: hashed })
    if (authErr) return res.status(500).json({ error: authErr })

     return res.json(data)
   }

  return res.status(405).json({ error: 'Method not allowed' })
}
