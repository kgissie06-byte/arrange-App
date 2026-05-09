import { requireAuth } from '../../lib/auth'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await requireAuth(req, res)
  if (!auth) return

  return res.json({ role: auth.role })
}
