// email.js
require('dotenv').config();
const nodemailer = require('nodemailer');

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
    const [parte1 = '', parte2 = '', parte3 = '', parte4 = ''] = line.split('—').map(s => s.trim());
    const item = parte1;
    const desc = parte2;
    const unit = parte3.replace(/^\$/, '$ ');
    const subt = parte4.replace(/^Subt\s*/, '').replace(/^\$/, '$ ');
    return `
            <tr>
              <td><strong>${item}</strong><br><span style="color:#555">${desc}</span></td>
              <td align="right">${unit}</td>
              <td align="right">${subt}</td>
            </tr>`;
  }).join('')}
      </tbody>
    </table>
  `;
}

async function enviarCorreoNuevoPedido({ id, total, itemsText, contacto, linkPedido }) {

  // ✅ Configuración para BREVO SMTP (funciona en Railway)
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  const html = `
    <h2>🚨 Nuevo pedido en la web</h2>
    <p><strong>Pedido #${id}</strong><br>
    Total: <strong>$ ${formatCurrencyAr(total)}</strong><br>
    Cliente (WhatsApp): <strong>${contacto}</strong></p>

    ${itemsTextToHtml(itemsText)}

    <p><a href="${buildWaLink(contacto, id)}" target="_blank">📲 Chatear con el cliente</a></p>
    ${linkPedido ? `<p>Ver pedido: <a href="${linkPedido}" target="_blank">${linkPedido}</a></p>` : ''}
  `;

  await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_TO}>`,
    to: process.env.EMAIL_TO,
    subject: `[TSB] Nuevo pedido #${id}`,
    html,
  });

  console.log("✅ Email enviado correctamente via Brevo SMTP");
}

module.exports = { enviarCorreoNuevoPedido };
