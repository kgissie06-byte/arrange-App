import { createClient } from '@supabase/supabase-js'
import formidable from 'formidable'
import fs from 'fs'
import { requireAuth } from '../../lib/auth.js'

export const config = { api: { bodyParser: false } }

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BUCKET = 'char-images'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // 画像アップロードは管理者のみ
  const auth = await requireAuth(req, res, 'admin')
  if (!auth) return

  const form = formidable({ maxFileSize: 5 * 1024 * 1024 })
  let fields, files
  try {
    [fields, files] = await form.parse(req)
  } catch (e) {
    return res.status(400).json({ error: 'Failed to parse form' })
  }

  const file = Array.isArray(files.file) ? files.file[0] : files.file
  if (!file) return res.status(400).json({ error: 'No file uploaded' })

  const fileBuffer = fs.readFileSync(file.filepath)
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, fileBuffer, {
      contentType: 'image/jpeg',
      upsert: false,
    })

  fs.unlinkSync(file.filepath)

  if (uploadError) {
    return res.status(500).json({ error: uploadError.message })
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileName)

  return res.json({ url: data.publicUrl })
}
