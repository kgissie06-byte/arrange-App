import { requireAuth } from '../lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ログイン済みであれば誰でもOK
  const auth = await requireAuth(req, res)
  if (!auth) return

  const { name, body } = req.body || {}
  const message = typeof body === 'string' ? body.trim() : ''
  if (!message) {
    return res.status(400).json({ error: '内容を入力してください' })
  }
  if (message.length > 5000) {
    return res.status(400).json({ error: '内容が長すぎます' })
  }

  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.INQUIRY_FROM_EMAIL
  const toEmail = process.env.INQUIRY_TO_EMAIL
  if (!apiKey || !fromEmail || !toEmail) {
    console.error('inquiry: メール送信の環境変数が未設定です')
    return res.status(500).json({ error: 'メール送信が設定されていません' })
  }

  const senderName = (typeof name === 'string' && name.trim()) ? name.trim() : '（未入力）'
  const escapeHtml = (s) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))

  try {
    const mailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: toEmail.split(',').map(s => s.trim()).filter(Boolean),
        subject: `【問い合わせ】${senderName}様より`,
        text: `送信者: ${senderName}\nログイン権限: ${auth.role}\nmemberId: ${auth.memberId ?? '-'}\n\n${message}`,
        html: `<p><b>送信者:</b> ${escapeHtml(senderName)}</p><p><b>ログイン権限:</b> ${escapeHtml(String(auth.role))}</p><p><b>memberId:</b> ${escapeHtml(String(auth.memberId ?? '-'))}</p><hr><p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
      }),
    })

    if (!mailRes.ok) {
      const errText = await mailRes.text().catch(() => '')
      console.error('inquiry: Resend送信失敗', mailRes.status, errText)
      return res.status(500).json({ error: '送信に失敗しました' })
    }
  } catch (e) {
    console.error('inquiry: 送信エラー', e)
    return res.status(500).json({ error: '送信に失敗しました' })
  }

  return res.json({ ok: true })
}