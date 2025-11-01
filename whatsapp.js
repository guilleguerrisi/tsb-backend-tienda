// whatsapp.js
require('dotenv').config();

// Polyfill fetch si tu runtime < 18
if (typeof fetch === 'undefined') {
  global.fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
}

const API_VERSION = 'v22.0';  // usa la misma del curl
const WABA_TOKEN = process.env.WABA_TOKEN;
const PHONE_NUMBER_ID = process.env.WABA_PHONE_NUMBER_ID;
const ALERT_TO = (process.env.WABA_ALERT_TO || '').trim();
const TEMPLATE = (process.env.WABA_TEMPLATE || '').trim(); // vacío = enviar texto libre

function buildItemsText(arrayPedido, calcUnit) {
  try {
    const items = Array.isArray(arrayPedido) ? arrayPedido : JSON.parse(arrayPedido || '[]');
    if (!Array.isArray(items) || items.length === 0) return '(sin ítems)';
    return items.slice(0, 40).map(it => {
      const cant = Number(it.cantidad || 1);
      const unit = typeof calcUnit === 'function' ? calcUnit(it) : Number(it.price || 0);
      const subtotal = unit * cant;
      return `${(it.codigo_int||'').trim()} x${cant} — ${(it.descripcion_corta||'').trim()} — $${new Intl.NumberFormat('es-AR').format(unit)} — Subt $${new Intl.NumberFormat('es-AR').format(subtotal)}`;
    }).join('\n');
  } catch {
    return '(error al formatear ítems)';
  }
}

async function enviarConTemplate({ id, total, itemsText, contacto }) {
  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const params = [
    { type: 'text', text: String(id ?? '-') },
    { type: 'text', text: `$${new Intl.NumberFormat('es-AR').format(total || 0)}` },
    { type: 'text', text: itemsText || '(sin ítems)' },
    { type: 'text', text: contacto || '-' },
  ];
  const body = {
    messaging_product: 'whatsapp',
    to: ALERT_TO,
    type: 'template',
    template: { name: TEMPLATE, language: { code: 'es' }, components: [{ type: 'body', parameters: params }] },
  };
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${WABA_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`[WABA template] ${r.status} ${r.statusText} -> ${await r.text()}`);
}

async function enviarComoTexto({ id, total, itemsText, contacto }) {
  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: ALERT_TO,
    type: 'text',
    text: {
      body:
        `🚨 *NUEVO PEDIDO EN LA WEB*\n\n` +
        `#${id ?? '-'} — Total: $${new Intl.NumberFormat('es-AR').format(total || 0)}\n` +
        `Cliente: ${contacto || '-'}\n\n` +
        `🛒 Detalle:\n${itemsText || '(sin ítems)'}`
    }
  };
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${WABA_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`[WABA text] ${r.status} ${r.statusText} -> ${await r.text()}`);
}

async function enviarAlertaWhatsApp(payload) {
  if (!WABA_TOKEN || !PHONE_NUMBER_ID || !ALERT_TO) {
    console.warn('[whatsapp] Faltan WABA_TOKEN / WABA_PHONE_NUMBER_ID / WABA_ALERT_TO');
    return;
  }
  try {
    if (TEMPLATE) {
      console.log('[whatsapp] Enviando por TEMPLATE:', TEMPLATE);
      await enviarConTemplate(payload);
    } else {
      console.log('[whatsapp] Enviando como TEXTO libre');
      await enviarComoTexto(payload);
    }
    console.log('✅ WhatsApp enviado');
  } catch (e) {
    console.error('❌ Error WhatsApp:', e.message || e);
    if (TEMPLATE) {
      console.log('[whatsapp] Reintentando como texto libre…');
      try { await enviarComoTexto(payload); console.log('✅ Enviado por fallback texto'); }
      catch (e2) { console.error('❌ Fallback texto falló:', e2.message || e2); }
    }
  }
}

module.exports = { enviarAlertaWhatsApp, buildItemsText };
