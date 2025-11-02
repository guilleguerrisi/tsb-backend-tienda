// email.js ✅ usando BREVO API (sin SMTP)
require('dotenv').config();
const axios = require('axios');

function normalizarTelefono(t) {
  if (!t) return '';
  return String(t).replace(/[^\d+]/g, '').trim();
}

function formatCurrencyAr(n) {
  return new Intl.NumberFormat('es-AR').format(Number(n || 0));
}

function buildWaLink(contacto, pedidoId) {
  const tel = normalizarTelefono(contacto);
  const phone = encodeURIComponent(tel);
  const text = encodeURIComponent(`Hola, te escribo por tu Nota de Pedido #${pedidoId}.`);
  return `https://api.whatsapp.com/send?phone=${phone}&text=${text}`;
}

function itemsTextToHtml(itemsText = '') {
  const lines = String(itemsText).split('\n').filter(Boolean);
  if (!lines.length) return '<p>(sin ítems)</p>';
  return `
    <table border="0" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:Arial">
      <thead>
        <tr><th align="left">Ítem</th><th align="right">Unit.</th><th align="right">Subt.</th></tr>
      </thead>
      <tbody>
        ${lines.map(line => {
          const [parte1='', parte2='', parte3='', parte4=''] = line.split('—').map(s => s.trim());
          return `
            <tr>
              <td><strong>${parte1}</strong><br><span style="color:#555">${parte2}</span></td>
              <td align="right">${parte3}</td>
              <td align="right">${parte4}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

async function enviarCorreoNuevoPedido({ id, total, itemsText, contacto, linkPedido }) {

  const html = `
    <h2>🚨 Nuevo pedido en la web</h2>
    <p><strong>Pedido #${id}</strong><br>
    Total: <strong>$ ${formatCurrencyAr(total)}</strong><br>
    Cliente (WhatsApp): <strong>${contacto}</strong></p>

    ${itemsTextToHtml(itemsText)}

    <br><br>
    <p><a href="${buildWaLink(contacto, id)}" target="_blank">📲 Chatear con el cliente</a></p>
    ${linkPedido ? `<p>Ver pedido: <a href="${linkPedido}" target="_blank">${linkPedido}</a></p>` : ''}
  `;

  // ✅ ENVIÓ VIA BREVO API (NO SMTP ⇒ NO BLOQUEADO)
  await axios.post(
    "https://api.brevo.com/v3/smtp/email",
    {
      sender: { name: process.env.EMAIL_FROM_NAME, email: process.env.EMAIL_TO },
      to: [{ email: process.env.EMAIL_TO }],
      subject: `[TSB] Nuevo pedido #${id}`,
      htmlContent: html,
    },
    {
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json",
      },
    }
  );

  console.log("✅ Email enviado correctamente via BREVO API");
}

module.exports = { enviarCorreoNuevoPedido };
