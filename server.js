import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// ── Supabase クライアント ──────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ── GET /api/init ─ フロントが起動時に呼ぶ全データ取得 ───────────────
app.get('/api/init', async (req, res) => {
  try {
    // メンバー一覧
    const { data: members, error: mErr } = await supabase
      .from('members')
      .select('id, name, role')
      .order('id');
    if (mErr) throw mErr;

    // 育成データ
    const { data: trainings, error: tErr } = await supabase
      .from('trainings')
      .select('member_id, char_name, rar, ranks');
    if (tErr) throw tErr;

    // キャラ一覧
    const { data: chars, error: cErr } = await supabase
      .from('chars')
      .select('name, rars, ranks')
      .order('name');
    if (cErr) throw cErr;

    // 援軍表
    const { data: reinf, error: rErr } = await supabase
      .from('reinf')
      .select('id, member_name, normal_main, normal_sub, castle_main, castle_sub')
      .order('id');
    if (rErr) throw rErr;

    // メンバーに育成データをアタッチ（フロントの S.members[].chars 構造に合わせる）
    const membersWithChars = members.map(m => ({
      id: m.id,
      name: m.name,
      role: m.role,
      chars: trainings
        .filter(t => t.member_id === m.id)
        .map(t => ({ name: t.char_name, rar: t.rar, ranks: t.ranks })),
    }));

    // reinf をフロントの命名規則に変換
    const reinfFormatted = reinf.map(r => ({
      id: r.id,
      memberName: r.member_name,
      normalMain: r.normal_main,
      normalSub: r.normal_sub,
      castleMain: r.castle_main,
      castleSub: r.castle_sub,
    }));

    const nextReinfId = reinf.length
      ? Math.max(...reinf.map(r => r.id)) + 1
      : 1;

    res.json({
      members: membersWithChars,
      chars: chars.map(c => ({ name: c.name, rars: c.rars, ranks: c.ranks })),
      reinf: reinfFormatted,
      nextReinfId,
      filRar: [],
      filRank: [],
      filRole: [],
    });
  } catch (err) {
    console.error('GET /api/init error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/members ─ メンバー追加 ─────────────────────────────────
app.post('/api/members', async (req, res) => {
  const { name, role } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const { data, error } = await supabase
    .from('members')
    .insert({ name, role: role || '' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── PUT /api/members/:id ─ メンバー更新 ──────────────────────────────
app.put('/api/members/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, role } = req.body;

  const { data, error } = await supabase
    .from('members')
    .update({ name, role })
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── DELETE /api/members/:id ─ メンバー削除 ───────────────────────────
app.delete('/api/members/:id', async (req, res) => {
  const id = parseInt(req.params.id);

  // 育成データも連鎖削除（ON DELETE CASCADE が設定されていない場合の保険）
  await supabase.from('trainings').delete().eq('member_id', id);

  const { error } = await supabase.from('members').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── POST /api/training ─ 育成データ保存（upsert）────────────────────
app.post('/api/training', async (req, res) => {
  const { memberId, charName, rar, ranks } = req.body;
  if (!memberId || !charName) {
    return res.status(400).json({ error: 'memberId and charName are required' });
  }

  const { data, error } = await supabase
    .from('trainings')
    .upsert(
      { member_id: memberId, char_name: charName, rar, ranks },
      { onConflict: 'member_id,char_name' }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── POST /api/chars ─ キャラ追加 ─────────────────────────────────────
app.post('/api/chars', async (req, res) => {
  const { name, rars, ranks } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const { data, error } = await supabase
    .from('chars')
    .insert({ name, rars: rars || [], ranks: ranks || [] })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── PUT /api/chars/:name ─ キャラ更新 ────────────────────────────────
app.put('/api/chars/:name', async (req, res) => {
  const oldName = decodeURIComponent(req.params.name);
  const { name, rars, ranks } = req.body;

  const { data, error } = await supabase
    .from('chars')
    .update({ name, rars, ranks })
    .eq('name', oldName)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── DELETE /api/chars/:name ─ キャラ削除 ─────────────────────────────
app.delete('/api/chars/:name', async (req, res) => {
  const name = decodeURIComponent(req.params.name);

  // 関連育成データも削除
  await supabase.from('trainings').delete().eq('char_name', name);

  const { error } = await supabase.from('chars').delete().eq('name', name);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── POST /api/reinf ─ 援軍行追加 ─────────────────────────────────────
app.post('/api/reinf', async (req, res) => {
  const { memberName, normalMain, normalSub, castleMain, castleSub } = req.body;

  const { data, error } = await supabase
    .from('reinf')
    .insert({
      member_name: memberName || null,
      normal_main: normalMain || null,
      normal_sub: normalSub || null,
      castle_main: castleMain || null,
      castle_sub: castleSub || null,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── PUT /api/reinf/:id ─ 援軍行更新 ──────────────────────────────────
app.put('/api/reinf/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { memberName, normalMain, normalSub, castleMain, castleSub } = req.body;

  const { data, error } = await supabase
    .from('reinf')
    .update({
      member_name: memberName ?? null,
      normal_main: normalMain ?? null,
      normal_sub: normalSub ?? null,
      castle_main: castleMain ?? null,
      castle_sub: castleSub ?? null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── DELETE /api/reinf/:id ─ 援軍行削除 ───────────────────────────────
app.delete('/api/reinf/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { error } = await supabase.from('reinf').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── SPA フォールバック ────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Game Tracker running on port ${PORT}`);
});
