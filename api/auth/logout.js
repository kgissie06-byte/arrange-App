import { clearSession } from '../../lib/auth'

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  clearSession(res)
  return res.json({ ok: true })
}
