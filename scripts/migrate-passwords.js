import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import { readFileSync } from 'fs'

// .env.local を手動で読み込む
const envFile = readFileSync('.env.local', 'utf-8')
envFile.split('\n').forEach(line => {
  const [key, ...val] = line.split('=')
  if (key && val.length) process.env[key.trim()] = val.join('=').trim()
})

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function migrate() {
  const { data, error } = await supabase.from('passwords').select('id, password')
  if (error) { console.error('取得エラー:', error); process.exit(1) }

  for (const row of data) {
    if (row.password.startsWith('$2')) {
      console.log(`[SKIP] ${row.id} はすでにハッシュ済み`)
      continue
    }
    const hashed = await bcrypt.hash(row.password, 10)
    const { error: updateErr } = await supabase
      .from('passwords')
      .update({ password: hashed })
      .eq('id', row.id)

    if (updateErr) {
      console.error(`[ERROR] ${row.id} の更新に失敗:`, updateErr)
    } else {
      console.log(`[OK] ${row.id} のパスワードをハッシュ化しました`)
    }
  }
  console.log('移行完了')
}

migrate()