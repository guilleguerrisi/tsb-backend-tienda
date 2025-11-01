// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

process.on('unhandledRejection', (r) => console.error('💥 Unhandled Rejection:', r));
process.on('uncaughtException', (e) => console.error('💥 Uncaught Exception:', e));

const app = express();

const {
  obtenerCategoriasVisibles,
  buscarCategoriasPorPalabra,
  buscarMercaderia,
  crearPedidoTienda,
  obtenerPedidoTiendaPorId,
  obtenerPedidoPorCliente,
  actualizarPedidoParcial,
  esDispositivoAutorizado,
} = require('./db');

const { enviarAlertaWhatsApp, buildItemsText } = require('./whatsapp');

// ========== CORS: configuración ==========
const allowedOrigins = new Set([
  'https://www.bazaronlinesalta.com.ar',
  'https://bazaronlinesalta.com.ar',
  'http://localhost:3000',
]);

// 1) Headers CORS globales ultra-temprano
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowOrigin =
    origin && allowedOrigins.has(origin) ? origin : (origin ? origin : '*');

  res.header('Vary', 'Origin, Access-Control-Request-Headers, Access-Control-Request-Method');
  res.header('Access-Control-Allow-Origin', allowOrigin);
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// 2) Logs
app.use(morgan('tiny'));

// 3) cors() estándar (refuerzo)
app.use(cors({
  origin: (origin, cb) => (!origin || allowedOrigins.has(origin)) ? cb(null, true) : cb(new Error('Not allowed by CORS')),
  credentials: false,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With','Accept','Origin'],
  maxAge: 86400,
}));

// 4) JSON parser
app.use(express.json());

// Log útil
app.use((req, _res, next) => {
  if (req.method === 'OPTIONS') {
    console.log('➡️ PREFLIGHT', req.method, req.path, 'Origin:', req.headers.origin);
  } else {
    console.log('➡️', req.method, req.path, 'Origin:', req.headers.origin || '—');
  }
  next();
});

// ---------- Root & Health ----------
app.get('/', (_req, res) => res.send('OK'));
app.get('/health', (_req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

// Debug rápido CORS
app.get('/debug/cors', (req, res) => {
  res.json({
    method: req.method,
    origin_header: req.headers.origin || null,
    acr_method: req.headers['access-control-request-method'] || null,
    acr_headers: req.headers['access-control-request-headers'] || null,
    now: new Date().toISOString(),
  });
});

// ============================
// 🔒 VERIFICACIÓN DE USUARIO
// ============================
app.post('/api/verificar-dispositivo', async (req, res) => {
  const device_id = req.body?.device_id || req.body?.deviceId;
  if (!device_id) return res.status(400).json({ autorizado: false, error: 'Device ID requerido' });

  const { autorizado, error } = await esDispositivoAutorizado(device_id);
  if (error) return res.status(500).json({ autorizado: false, error: 'Error interno' });
  return res.json({ autorizado });
});

// ============================
// 📦 CATEGORÍAS
// ============================
app.get('/api/categorias', async (_req, res) => {
  const { data, error } = await obtenerCategoriasVisibles();
  if (error) return res.status(500).json({ error: 'Error al obtener categorías' });
  return res.json(data);
});

app.get('/api/buscar-categorias', async (req, res) => {
  const palabra = String(req.query.palabra || '');
  if (!palabra.trim()) return res.status(400).json({ error: 'Falta palabra clave' });

  const { data, error } = await buscarCategoriasPorPalabra(palabra);
  if (error) return res.status(500).json({ error: 'Error al buscar categorías' });
  return res.json(data);
});

// ============================
// 🧾 PRODUCTOS
// ============================
app.get('/api/mercaderia', async (req, res) => {
  const { buscar, grcat } = req.query;
  const { data, error } = await buscarMercaderia({ buscar, grcat });
  if (error) return res.status(500).json({ error: 'DB_ERROR', message: error.message });
  return res.json(data);
});

// ============================
// 💰 Helpers precio/total (minorista por margen de la DB)
// ============================
const redondearCentena = (n) => Math.round(n / 100) * 100;
function calcularPrecioMinorista(p) {
  const base = Number(p.costosiniva);
  const ivaFactor = 1 + (Number(p.iva || 0) / 100);
  const margenDB = 1 + (Number(p.margen || 0) / 100);
  if (!Number.isFinite(base)) return 0;
  return redondearCentena(base * ivaFactor * margenDB);
}
function totalizarCarrito(arrayPedido) {
  try {
    const items = Array.isArray(arrayPedido) ? arrayPedido : JSON.parse(arrayPedido || '[]');
    return items.reduce((acc, it) => acc + calcularPrecioMinorista(it) * (it.cantidad || 1), 0);
  } catch { return 0; }
}

// 🧽 Normalizar teléfono del cliente -> deja sólo dígitos y + (por si viene con espacios, guiones, etc.)
function normalizarTelefono(t) {
  if (!t) return '';
  return String(t).replace(/[^\d+]/g, '').trim();
}

// ============================
// 🛒 PEDIDOS TIENDA
// ============================
app.post('/api/pedidos', async (req, res) => {
  try {
    const nuevoPedido = req.body;
    const { data, error } = await crearPedidoTienda(nuevoPedido);
    if (error) return res.status(500).json({ error: 'Error al crear pedido' });

    // 📦 Preparar datos para WhatsApp
    const pedidoId = data?.id;
    const total = totalizarCarrito(nuevoPedido.array_pedido);
    const itemsText = buildItemsText(nuevoPedido.array_pedido, calcularPrecioMinorista);
    const contacto = normalizarTelefono(nuevoPedido.contacto_cliente);

    // 🟢 Enviar WhatsApp (no bloquea la respuesta)
    enviarAlertaWhatsApp({ id: pedidoId, total, itemsText, contacto })
      .catch(err => console.error('[whatsapp] POST aviso falló:', err));

    return res.json({ data: { id: data.id } });
  } catch (e) {
    console.error('POST /api/pedidos error:', e);
    return res.status(500).json({ error: 'Error al crear pedido' });
  }
});

app.get('/api/pedidos/:id', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await obtenerPedidoTiendaPorId(id);
  if (error) return res.status(404).json({ error: 'Pedido no encontrado' });
  return res.json(data);
});

app.get('/api/pedidos/cliente/:clienteID', async (req, res) => {
  const { clienteID } = req.params;
  const { data, error } = await obtenerPedidoPorCliente(clienteID);
  if (error) return res.status(500).json({ error: 'Error interno del servidor' });
  if (!data) return res.status(404).json({ error: 'No se encontró pedido' });
  return res.json(data);
});

app.patch('/api/pedidos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const campos = {
      array_pedido: req.body.array_pedido ?? undefined,
      mensaje_cliente: req.body.mensaje_cliente ?? undefined,
      contacto_cliente: req.body.contacto_cliente ?? undefined,
      nombre_cliente: req.body.nombre_cliente ?? undefined,
    };
    const { data, error } = await actualizarPedidoParcial(id, campos);
    if (error) return res.status(500).json({ error: 'Error interno del servidor' });

    // 📦 Preparar datos para WhatsApp
    const total = totalizarCarrito(campos.array_pedido);
    const itemsText = buildItemsText(campos.array_pedido, calcularPrecioMinorista);
    const contacto = normalizarTelefono(campos.contacto_cliente);

    // 🟢 Enviar WhatsApp (podés condicionar para evitar duplicados)
    enviarAlertaWhatsApp({ id, total, itemsText, contacto })
      .catch(err => console.error('[whatsapp] PATCH aviso falló:', err));

    return res.json({ data: { id: data.id } });
  } catch (e) {
    console.error('PATCH /api/pedidos/:id error:', e);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ---------- Start ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor backend corriendo en el puerto ${PORT}`);
});
