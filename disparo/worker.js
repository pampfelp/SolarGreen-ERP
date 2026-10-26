// ════ DISPARO DE REATIVAÇÃO: receptor na Cloudflare (2026-10-26) ════
// Worker colado direto no painel da Cloudflare (sem build). Duas portas:
//
//   GET  /r/<token>.<telVendedor>.<assinatura>
//        Botão "Falar com o atendente" da mensagem. Confere a assinatura,
//        manda a pessoa na hora pro WhatsApp do vendedor e avisa o Apps Script
//        em segundo plano (o ERP registra o toque e notifica o vendedor).
//
//   GET  /webhook   verificação da Meta (hub.challenge)
//   POST /webhook   mensagens e status do número do disparo. Confere a
//                   assinatura da Meta, responde 200 na hora e repassa.
//
// Por que existe: a Meta exige resposta 200 direta, e o Apps Script responde
// com redirecionamento; o Apps Script também não enxerga o cabeçalho de
// assinatura da Meta. Ver legado/CODE GS.txt, seção DISPARO.
//
// Variáveis no painel do Worker (Settings > Variables, todas como Secret):
//   APPS_SCRIPT_URL   URL /exec da implantação do Apps Script
//   DISPARO_SEGREDO   o mesmo valor da Script Property DISPARO_SEGREDO
//   META_APP_SECRET   chave secreta do app (developers.facebook.com > app > Configurações > Básico)
//   META_VERIFY_TOKEN um texto qualquer, o mesmo digitado no cadastro do webhook na Meta

const TEXTO_VENDEDOR = 'Oi, recebi a mensagem da Solar Green sobre a minha usina.';
const WHATSAPP_OFICIAL = '5591987598592';

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/r/')) return toque(url, env, ctx);
    if (url.pathname === '/webhook' && req.method === 'GET') return verificar(url, env);
    if (url.pathname === '/webhook' && req.method === 'POST') return webhook(req, env, ctx);
    return new Response('Solar Green', { status: 200 });
  }
};

async function toque(url, env, ctx) {
  const partes = decodeURIComponent(url.pathname.slice(3)).split('.');
  const [token, tel, assinatura] = partes;
  const valido = partes.length === 3 && /^[A-Za-z0-9_-]{1,80}$/.test(token) && /^55\d{10,11}$/.test(tel) &&
    iguais(assinatura, (await hmacHex(env.DISPARO_SEGREDO, token + '.' + tel)).slice(0, 16));
  // Link adulterado ou antigo: cai no WhatsApp oficial da empresa, nunca em erro.
  if (!valido) return Response.redirect('https://wa.me/' + WHATSAPP_OFICIAL, 302);
  ctx.waitUntil(repassar(env, { action: 'disparoToque', token }));
  return Response.redirect('https://wa.me/' + tel + '?text=' + encodeURIComponent(TEXTO_VENDEDOR), 302);
}

function verificar(url, env) {
  const p = url.searchParams;
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === env.META_VERIFY_TOKEN) {
    return new Response(p.get('hub.challenge') || '', { status: 200 });
  }
  return new Response('não autorizado', { status: 403 });
}

async function webhook(req, env, ctx) {
  const bruto = await req.text();
  const recebida = (req.headers.get('X-Hub-Signature-256') || '').replace(/^sha256=/, '');
  if (!iguais(recebida, await hmacHex(env.META_APP_SECRET, bruto))) return new Response('assinatura inválida', { status: 401 });
  let payload;
  try { payload = JSON.parse(bruto); } catch (e) { return new Response('ok', { status: 200 }); }
  ctx.waitUntil(repassar(env, { action: 'disparoWebhook', payload }));
  return new Response('ok', { status: 200 });
}

// O Apps Script executa no primeiro POST e responde com redirecionamento pro
// resultado; seguir o redirecionamento só serve pra ler a resposta no log.
async function repassar(env, corpo) {
  try {
    const resp = await fetch(env.APPS_SCRIPT_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, redirect: 'follow',
      body: JSON.stringify({ ...corpo, segredo: env.DISPARO_SEGREDO })
    });
    const txt = await resp.text();
    if (!/"ok":\s*true/.test(txt)) console.log('Apps Script respondeu:', txt.slice(0, 300));
  } catch (e) {
    console.log('Falha ao repassar ao Apps Script:', String(e));
  }
}

async function hmacHex(segredo, texto) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const assinatura = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(texto));
  return [...new Uint8Array(assinatura)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Comparação em tempo constante, pra assinatura não vazar pelo tempo de resposta.
function iguais(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}
