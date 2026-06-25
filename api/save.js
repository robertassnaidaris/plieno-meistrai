// Vercel serverless funkcija: įrašo turinį ir nuotraukas į GitHub saugyklą.
// Reikalingi aplinkos kintamieji (Vercel → Settings → Environment Variables):
//   GH_TOKEN        – GitHub asmeninis prieigos raktas (repo teisės)
//   GH_OWNER        – pvz. robertassnaidaris
//   GH_REPO         – pvz. plieno-meistrai
//   GH_BRANCH       – pvz. main (neprivaloma, numatyta main)
//   ADMIN_PASSWORD  – slaptažodis prisijungimui prie /admin

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Tik POST' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const { password, content, newImages } = body || {};

  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    res.status(401).json({ error: 'Neteisingas slaptažodis' }); return;
  }
  if (!content || typeof content !== 'object') {
    res.status(400).json({ error: 'Trūksta turinio' }); return;
  }

  const owner = process.env.GH_OWNER, repo = process.env.GH_REPO;
  const branch = process.env.GH_BRANCH || 'main', token = process.env.GH_TOKEN;
  if (!owner || !repo || !token) { res.status(500).json({ error: 'Serveris nesukonfigūruotas (GH_* kintamieji)' }); return; }

  const api = 'https://api.github.com';
  const h = {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'plieno-cms',
    'Content-Type': 'application/json'
  };

  async function getSha(path) {
    const r = await fetch(api + '/repos/' + owner + '/' + repo + '/contents/' + path + '?ref=' + branch, { headers: h });
    if (r.status === 200) { const j = await r.json(); return j.sha; }
    return null;
  }
  async function putFile(path, base64, msg) {
    const sha = await getSha(path);
    const payload = { message: msg, content: base64, branch };
    if (sha) payload.sha = sha;
    const r = await fetch(api + '/repos/' + owner + '/' + repo + '/contents/' + path, {
      method: 'PUT', headers: h, body: JSON.stringify(payload)
    });
    if (!r.ok) { const t = await r.text(); throw new Error('GitHub ' + r.status + ': ' + t); }
    return r.json();
  }

  try {
    const out = JSON.parse(JSON.stringify(content));
    const rawBase = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + branch + '/';

    if (Array.isArray(newImages) && newImages.length) {
      out.gallery = out.gallery || [];
      let i = 0;
      for (const im of newImages) {
        if (!im || !im.data) continue;
        const safe = (im.name || ('img' + i)).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-40);
        const path = 'images/' + Date.now() + '-' + i + '-' + safe + '.jpg';
        await putFile(path, im.data, 'CMS: nuotrauka');
        out.gallery.push({ img: rawBase + path, caption: im.caption || '' });
        i++;
      }
    }

    const cjson = Buffer.from(JSON.stringify(out, null, 2), 'utf8').toString('base64');
    await putFile('content.json', cjson, 'CMS: turinio atnaujinimas');

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
