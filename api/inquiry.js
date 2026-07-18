import formidable from 'formidable'
import fs from 'fs'
import { requireAuth } from '../lib/auth.js'

// multipart/form-data を自前でパースするため、Vercelの標準bodyParserを無効化
export const config = { api: { bodyParser: false } }

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 1枚あたり5MBまで
const MAX_FILES = 3 // 添付は最大3枚まで

// ブラウザが申告するContent-Type（f.mimetype）は送信側で自由に偽装できるため信用しない。
// 実際のファイル先頭バイト（マジックナンバー）を見て本物の画像かどうかを判定する。
function detectImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { mime: 'image/jpeg', ext: 'jpg' }
  }
  if (buffer.length >= 8 && buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) {
    return { mime: 'image/png', ext: 'png' }
  }
  if (buffer.length >= 6 && buffer.slice(0, 4).toString('ascii') === 'GIF8') {
    return { mime: 'image/gif', ext: 'gif' }
  }
  if (buffer.length >= 12 && buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' }
  }
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ログイン済みであれば誰でもOK
  const auth = await requireAuth(req, res)
  if (!auth) return

  const form = formidable({
    maxFiles: MAX_FILES,
    maxFileSize: MAX_FILE_SIZE,
    multiples: true,
  })

  let fields, files
  try {
    ;[fields, files] = await form.parse(req)
  } catch (e) {
    console.error('inquiry: フォーム解析エラー', e)
    return res.status(400).json({ error: '送信内容の読み込みに失敗しました（画像は1枚5MBまでです）' })
  }

  const name = Array.isArray(fields.name) ? fields.name[0] : fields.name
  const body = Array.isArray(fields.body) ? fields.body[0] : fields.body
  const message = typeof body === 'string' ? body.trim() : ''
  if (!message) {
    return res.status(400).json({ error: '内容を入力してください' })
  }
  if (message.length > 5000) {
    return res.status(400).json({ error: '内容が長すぎます' })
  }

  // 添付画像を読み込んでBase64化（不正な形式のファイルは黙ってスキップする）
  const rawFiles = files.images
    ? (Array.isArray(files.images) ? files.images : [files.images]).slice(0, MAX_FILES)
    : []

  const attachments = []
  let idx = 0
  for (const f of rawFiles) {
    if (!f || !f.filepath) continue
    try {
      const buffer = fs.readFileSync(f.filepath)
      const detected = detectImageType(buffer)
      if (!detected) continue // 画像として認識できないファイルは黙ってスキップ（偽装ファイル対策）
      idx += 1
      attachments.push({
        // 元のファイル名は信用せず、こちらで生成した安全な名前に付け替える
        // （拡張子偽装・Unicode制御文字によるファイル名偽装トリックを無効化するため）
        filename: `attachment-${idx}.${detected.ext}`,
        content: buffer.toString('base64'),
      })
    } finally {
      fs.unlink(f.filepath, () => {})
    }
  }

  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.INQUIRY_FROM_EMAIL
  const toEmail = process.env.INQUIRY_TO_EMAIL
  if (!apiKey || !fromEmail || !toEmail) {
    console.error('inquiry: メール送信の環境変数が未設定です')
    return res.status(500).json({ error: 'メール送信が設定されていません' })
  }

  const senderNameRaw = (typeof name === 'string' && name.trim()) ? name.trim() : '（未入力）'
  // 改行や制御文字が混じっていると件名（メールヘッダー）が壊れる可能性があるため除去し、長さも制限する
  const senderName = senderNameRaw.replace(/[\r\n\t\x00-\x1F\x7F]/g, '').slice(0, 100)
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
        text: `送信者: ${senderName}\nログイン権限: ${auth.role}\nmemberId: ${auth.memberId ?? '-'}\n添付画像: ${attachments.length}枚\n\n${message}`,
        html: `<p><b>送信者:</b> ${escapeHtml(senderName)}</p><p><b>ログイン権限:</b> ${escapeHtml(String(auth.role))}</p><p><b>memberId:</b> ${escapeHtml(String(auth.memberId ?? '-'))}</p><hr><p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
        attachments: attachments.length ? attachments : undefined,
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