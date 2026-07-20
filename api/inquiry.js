import formidable from 'formidable'
import fs from 'fs'
import { requireAuth } from '../lib/auth.js'

// multipart/form-data を自前でパースするため、Vercelの標準bodyParserを無効化
// （GET/markSeen/adminList/adminReplyもこの設定のまま自前でボディを読む）
export const config = { api: { bodyParser: false } }

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 1枚あたり5MBまで
const MAX_FILES = 3 // 添付は最大3枚まで

// 返信できるのはこのmemberIdのみ（役職・roleに関係なく固定で1名に限定する）
const REPLY_ALLOWED_MEMBER_ID = 1
const MAX_REPLY_LENGTH = 5000
const RETENTION_DAYS_AFTER_SEEN = 7 // 既読になってから何日後にDBから自動削除するか

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// cronは使わず、一覧を取得するタイミングで期限切れ（既読から7日経過）の行を掃除する。
// Vercel Hobbyプランの関数数上限もあり、専用のスケジュール実行は用意していない。
async function cleanupExpiredInquiries(supabase) {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS_AFTER_SEEN * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('inquiries').delete().lt('seen_at', cutoff)
  } catch (e) {
    console.error('inquiry: 期限切れ削除エラー', e)
  }
}

// bodyParserを切っているため、JSONを使うアクション（adminReply）では自前でボディを読む
async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

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

// /api/inquiry
//   GET                       → 自分の問い合わせ履歴＋返信（既読化はしない）
//   GET  ?action=adminList    → 全員分の一覧（memberId=1のみ）
//   POST                      → 新規問い合わせ送信（multipart、メール通知＋DB保存）
//   POST ?action=markSeen     → 自分の未読返信をすべて既読化
//   POST ?action=adminReply   → 指定の問い合わせに返信（memberId=1のみ）
// Vercel Hobbyプランの関数数上限に収めるため、管理用エンドポイントも新規ファイルを作らずここに統合しています。
export default async function handler(req, res) {
  const auth = await requireAuth(req, res)
  if (!auth) return

  const action = req.query ? req.query.action : undefined

  if (req.method === 'GET' && action === 'adminList') {
    return handleAdminList(req, res, auth)
  }
  if (req.method === 'GET') {
    return handleList(req, res, auth)
  }
  if (req.method === 'POST' && action === 'markSeen') {
    return handleMarkSeen(req, res, auth)
  }
  if (req.method === 'POST' && action === 'adminReply') {
    return handleAdminReply(req, res, auth)
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  return handleSubmit(req, res, auth)
}

// 自分の過去の問い合わせ＋返信の一覧を返す（画像は返さない・既読化はしない）
async function handleList(req, res, auth) {
  try {
    const supabase = await getSupabase()
    await cleanupExpiredInquiries(supabase)

    const { data, error } = await supabase
      .from('inquiries')
      .select('id, body, reply_body, replied_at, seen_at, unread_by_member, created_at')
      .eq('member_id', auth.memberId)
      .order('created_at', { ascending: false })

    if (error) throw error

    const hasUnread = (data || []).some(row => row.unread_by_member)
    return res.json({ inquiries: data || [], hasUnread })
  } catch (e) {
    console.error('inquiry: 一覧取得エラー', e)
    return res.status(500).json({ error: '取得に失敗しました' })
  }
}

// モーダルを開いたタイミングで呼ばれ、未読の返信をすべて既読にする
async function handleMarkSeen(req, res, auth) {
  try {
    const supabase = await getSupabase()
    const { error } = await supabase
      .from('inquiries')
      .update({ unread_by_member: false, seen_at: new Date().toISOString() })
      .eq('member_id', auth.memberId)
      .eq('unread_by_member', true)

    if (error) throw error
    return res.json({ ok: true })
  } catch (e) {
    console.error('inquiry: 既読化エラー', e)
    return res.status(500).json({ error: '既読化に失敗しました' })
  }
}

// 全メンバー分の問い合わせ一覧（返信管理用・memberId=1のみ／画像は保存していないため返さない）
async function handleAdminList(req, res, auth) {
  if (auth.memberId !== REPLY_ALLOWED_MEMBER_ID) {
    return res.status(403).json({ error: '権限がありません' })
  }
  try {
    const supabase = await getSupabase()
    await cleanupExpiredInquiries(supabase)

    const { data, error } = await supabase
      .from('inquiries')
      .select('id, member_id, name, body, reply_body, replied_at, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error
    return res.json({ inquiries: data || [] })
  } catch (e) {
    console.error('inquiry: 管理者一覧取得エラー', e)
    return res.status(500).json({ error: '取得に失敗しました' })
  }
}

// 指定した問い合わせへの返信を保存する（memberId=1のみ／本人のアプリ内に未読表示される）
async function handleAdminReply(req, res, auth) {
  if (auth.memberId !== REPLY_ALLOWED_MEMBER_ID) {
    return res.status(403).json({ error: '権限がありません' })
  }

  const body = await readJsonBody(req)
  if (body === null) return res.status(400).json({ error: '不正なリクエストです' })

  const id = body.id
  const reply = typeof body.reply === 'string' ? body.reply.trim() : ''

  if (!id || (typeof id !== 'number' && typeof id !== 'string')) {
    return res.status(400).json({ error: '不正なリクエストです' })
  }
  if (!reply) {
    return res.status(400).json({ error: '返信内容を入力してください' })
  }
  if (reply.length > MAX_REPLY_LENGTH) {
    return res.status(400).json({ error: '返信が長すぎます' })
  }

  try {
    const supabase = await getSupabase()
    const { data, error } = await supabase
      .from('inquiries')
      .update({
        reply_body: reply,
        replied_at: new Date().toISOString(),
        seen_at: null, // 新しい返信なので既読タイマーはリセットする
        unread_by_member: true, // 送信者側に未読バッジを立てる
      })
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return res.status(404).json({ error: '対象の問い合わせが見つかりません' })
    }

    return res.json({ ok: true })
  } catch (e) {
    console.error('inquiry: 返信保存エラー', e)
    return res.status(500).json({ error: '返信の保存に失敗しました' })
  }
}

// 新規問い合わせの送信（既存のメール通知に加えて、返信をアプリ内で受け取れるようDBにも保存する）
async function handleSubmit(req, res, auth) {
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
  // ※この添付はメール通知にのみ使用し、DBには保存しない（アプリ内の返信画面では表示しない）
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
        text: `送信者: ${senderName}\nログイン権限: ${auth.role}\nmemberId: ${auth.memberId ?? '-'}\n添付画像: ${attachments.length}枚\n※返信はアプリ内の問い合わせ管理から行ってください\n\n${message}`,
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

  // DBへの保存（アプリ内での返信のための記録）。ここが失敗してもメールは届いているので、
  // ユーザーへは成功として返す（管理者への通知はコンソールログのみ）。
  try {
    const supabase = await getSupabase()
    const { error } = await supabase.from('inquiries').insert({
      member_id: auth.memberId,
      name: senderName,
      body: message,
    })
    if (error) throw error
  } catch (e) {
    console.error('inquiry: DB保存エラー（メールは送信済み・アプリ内返信の対象外になります）', e)
  }

  return res.json({ ok: true })
}