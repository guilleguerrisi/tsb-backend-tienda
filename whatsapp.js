// whatsapp.js
require('dotenv').config();

// Polyfill fetch si tu runtime no lo trae (Node < 18)
if (typeof fetch === 'undefined') {
  global.fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
}

const WABA_TOKEN = process.env.WABA_TOKEN;
const PHONE_NUMBER_ID = process.env.WABA_PHONE_NUMBER_ID;
const ALERT_TO = process.env.WABA_ALERT_TO;
const TEMPLATE = process.env.WABA_TEMPLATE || 'order_alert';

function buildItemsText(arrayPedido, calcUnit) {
  try {
    const items = Array.isArray(arrayPedido) ? arrayPedido : JSON.parse(arrayPedido || '[]');
    if (!Array.isArray(items) || items.length === 0) return '(sin ítems)';

    const lines = [];
    for (const it of items.slice(0, 40)) {
      const cant = Number(it.cantidad || 1);
      const unit = typeof calcUnit === 'function' ? calcUnit(it) : Number(it.price || 0);
      const subtotal = unit * cant;

      const cod = (it.codigo_int || '').toString().trim();
      const desc = (it.descripcion_corta || '').toString().trim();
      const unitStr = new Intl.NumberFormat('es-AR').format(unit || 0);
      const subStr  = new Intl.NumberFormat('es-AR').format(subtotal || 0);

      lines.push(`${cod} x${cant} — ${desc} — $${unitStr} — Subt $${subStr}`);
    }
    if (items.length > 40) lines.push(`… (+${items.length - 40} ítems)`);
    return lines.join('\n');
  } catch {
    return '(error al formatear ítems)';
  }
}

// --- Envío usando PLANTILLA (recomendado; más estable a futuro) ---
async function enviarConTemplate({ id, total, itemsText, contacto }) {
  if (!WABA_TOKEN || !PHONE_NUMBER_ID || !ALERT_TO) {
    console.warn('[whatsapp] Faltan variables de entorno WABA_...');
    return;
  }

  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

  const params = [
    { type: 'text', text: String(id ?? '-') },
    { type: 'text', text: `$${new Intl.NumberFormat('es-AR').format(total || 0)}` },
    { type: 'text', text: itemsText || '(sin ítems)' },
    { type: 'text', text: contacto || '-' },
  ];

  const body = {
    messaging_product: 'whatsapp',
    to: String(ALERT_TO),
    type: 'template',
    template: {
      name: TEMPLATE,                 // order_alert (cuerpo con {{1}}..{{4}})
      language: { code: 'es' },
      components: [{ type: 'body', parameters: params }],
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WABA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`[whatsapp] template ${resp.status} ${resp.statusText} -> ${t}`);
  }
}

// --- Envío como TEXTO LIBRE (sirve mientras testeás con el número de prueba) ---
async function enviarComoTexto({ id, total, itemsText, contacto }) {
  if (!WABA_TOKEN || !PHONE_NUMBER_ID || !ALERT_TO) {
    console.warn('[whatsapp] Faltan variables de entorno WABA_...');
    return;
  }
  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: String(ALERT_TO),
    type: 'text',
    text: {
      body:
        `🚨 *NUEVO PEDIDO EN LA WEB*\n\n` +
        `#${id ?? '-'} — Total: $${new Intl.NumberFormat('es-AR').format(total || 0)}\n` +
        `Cliente: ${contacto || '-'}\n\n` +
        `🛒 Detalle:\n${itemsText || '(sin ítems)'}`
    }
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WABA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`[whatsapp] text ${resp.status} ${resp.statusText} -> ${t}`);
  }
}

async function enviarAlertaWhatsApp(payload) {
  try {
    // Si tenés plantilla aprobada en WhatsApp Manager (order_alert), usa template.
    // Mientras probás con número de prueba, el texto libre funciona bien.
    if (TEMPLATE) {
      await enviarConTemplate(payload);
    } else {
      await enviarComoTexto(payload);
    }
    console.log('✅ WhatsApp enviado');
  } catch (e) {
    console.error('❌ Error enviando WhatsApp:', e.message || e);
    // Intento de fallback a texto si falló la plantilla (útil en desarrollo)
    try {
      await enviarComoTexto(payload);
      console.log('✅ WhatsApp enviado por fallback texto');
    } catch (e2) {
      console.error('❌ Fallback texto también falló:', e2.message || e2);
    }
  }
}

module.exports = { enviarAlertaWhatsApp, buildItemsText };
