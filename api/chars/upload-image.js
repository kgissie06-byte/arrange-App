import { v2 as cloudinary } from 'cloudinary'
import formidable from 'formidable'
import fs from 'fs'
import { requireAuth } from '../../lib/auth.js'

export const config = { api: { bodyParser: false } }

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const FOLDER = 'char-images'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // 画像アップロードは管理者のみ
  const auth = await requireAuth(req, res, 'admin')
  if (!auth) return

  const form = formidable({ maxFileSize: 5 * 1024 * 1024 })
  let files
  try {
    [, files] = await form.parse(req)
  } catch (e) {
    return res.status(400).json({ error: 'Failed to parse form' })
  }

  const file = Array.isArray(files.file) ? files.file[0] : files.file
  if (!file) return res.status(400).json({ error: 'No file uploaded' })

  try {
    const result = await cloudinary.uploader.upload(file.filepath, {
      folder: FOLDER,
      resource_type: 'image',
    })

    fs.unlinkSync(file.filepath)

    return res.json({ url: result.secure_url })
  } catch (e) {
    fs.unlinkSync(file.filepath)
    console.error('Cloudinary upload error:', e)
    return res.status(500).json({ error: e.message || 'Upload failed' })
  }
}