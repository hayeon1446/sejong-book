// 세종 리더십 테스트 후기 댓글 API (Vercel Serverless Function)
// 저장소: Vercel Marketplace의 Upstash Redis (REST). 환경변수는 연결 시 자동으로 들어옵니다.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'sejong:comments';
const MAX_KEEP = 2000;

async function redis(cmds) {
  const r = await fetch(URL_ + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return (await r.json()).map(x => x.result);
}

const clean = (s, n) => String(s || '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, n);
const TYPES = ['질문하는 탐구형', '듣고 조율하는 경청형', '반대를 열어두는 직언환영형', '강점을 살리는 인재발견형'];

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_ || !TOKEN) return res.status(503).json({ error: 'not_configured' });
  try {
    if (req.method === 'GET') {
      const [list, total] = await redis([['LRANGE', KEY, '0', '99'], ['LLEN', KEY]]);
      const items = (list || []).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
      return res.status(200).json({ items, total: total || 0 });
    }
    if (req.method === 'POST') {
      let b = req.body;
      if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
      b = b || {};
      const name = clean(b.name, 12);
      const text = clean(b.text, 300);
      const types = (Array.isArray(b.types) ? b.types : []).filter(t => TYPES.includes(t)).slice(0, 4);
      if (!name || !text) return res.status(400).json({ error: '이름과 후기를 입력해 주세요.' });
      const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
      const [ok] = await redis([['SET', 'sejong:rl:' + ip, '1', 'NX', 'EX', '15']]);
      if (ok !== 'OK') return res.status(429).json({ error: '잠시 후 다시 등록해 주세요.' });
      const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name, text, types, at: new Date().toISOString() };
      await redis([['LPUSH', KEY, JSON.stringify(item)], ['LTRIM', KEY, '0', String(MAX_KEEP - 1)]]);
      return res.status(200).json({ item });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    return res.status(500).json({ error: '잠시 후 다시 시도해 주세요.' });
  }
};
