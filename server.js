// server.js
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const app = express();

const {
  pool,
  crearPedidoTienda,
  obtenerPedidoTiendaPorId,
  obtenerPedidoPorCliente,
  obtenerCategoriasVisibles,
  buscarCategoriasPorPalabra,
} = require('./db');

// ========== CORS: configuración ==========
const allowedOrigins = new Set([
  'https://www.bazaronlinesalta.com.ar',
  'https://bazaronlinesalta.com.ar',
  'http://localhost:3000',
]);

// 1) Headers CORS globales (antes que todo). Garantiza ACAO incluso en errores.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowOrigin =
    origin && allowedOrigins.has(origin) ? origin : (origin ? origin : '*');

  // Avisa a proxies/CDN que varía por origin y preflight
  res.header('Vary', 'Origin, Access-Control-Request-Headers, Access-Control-Request-Method');

  // CORS base en TODAS las respuestas
  res.header('Access-Control-Allow-Origin', allowOrigin);
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  // Si usas cookies/sesiones del navegador: habilitar y NO usar '*'
  // res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(204).end(); // preflight OK
  }
  next();
});

// 2) Logs
app.use(morgan('tiny'));

// 3) cors() estándar (refuerzo para requests reales)
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.has(origin)) return cb(null, true);
    console.warn('❌ CORS bloqueado. Origin no permitido:', origin);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: false, // true sólo si usás cookies/sesiones
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  maxAge: 86400,
};
app.use(cors(corsOptions));

// 4) JSON parser (después de CORS, evita 400 sin headers)
app.use(express.json());

// Log útil de tráfico
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

// Debug rápido de CORS
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
  const device_id = req.body.device_id || req.body.deviceId;
  if (!device_id) {
    return res.status(400).json({ autorizado: false, error: 'Device ID requerido' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id FROM usuarios_admin WHERE nombre_usuario = $1 LIMIT 1`,
      [device_id]
    );
    return res.json({ autorizado: rows.length > 0 });
  } catch (error) {
    console.error('❌ Error al verificar usuario autorizado:', error);
    return res.status(500).json({ autorizado: false, error: 'Error interno' });
  }
});

// ============================
// 📦 CATEGORÍAS
// ============================
app.get('/api/categorias', async (_req, res) => {
  try {
    const { data, error } = await obtenerCategoriasVisibles();
    if (error) return res.status(500).json({ error: 'Error al obtener categorías' });
    return res.json(data);
  } catch (err) {
    console.error('❌ /api/categorias:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/buscar-categorias', async (req, res) => {
  const palabra = String(req.query.palabra || '');
  if (!palabra.trim()) return res.status(400).json({ error: 'Falta palabra clave' });

  try {
    const { data, error } = await buscarCategoriasPorPalabra(palabra);
    if (error) return res.status(500).json({ error: 'Error al buscar categorías' });
    return res.json(data);
  } catch (err) {
    console.error('❌ /api/buscar-categorias:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ============================
// 🧾 PRODUCTOS
// ============================
app.get('/api/mercaderia', async (req, res) => {
  try {
    const { buscar, grcat } = req.query;
    const where = [`LOWER(COALESCE(m.visibilidad, '')) = 'mostrar'`];
    const values = [];

    const texto = (buscar?.trim() || grcat?.trim() || '');
    if (texto) {
      const tokens = texto.split(/[,\s]+/g).map(t => t.trim()).filter(Boolean);
      for (const tok of tokens) {
        values.push(`%${tok}%`);
        const idx = values.length;
        where.push(
          `(COALESCE(m.palabrasclave2, '') ILIKE $${idx} OR COALESCE(m.descripcion_corta, '') ILIKE $${idx})`
        );
      }
    }

    const sql = `
      SELECT
        m.id,
        m.codigo_int,
        m.descripcion_corta,
        m.imagen1,
        m.imagearray,
        m.costosiniva,
        m.iva,
        m.margen,
        m.grupo,
        m.fechaordengrupo
      FROM mercaderia m
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY
        NULLIF(TRIM(m.grupo), '') ASC NULLS LAST,
        NULLIF(TRIM(m.fechaordengrupo), '') DESC NULLS LAST,
        m.codigo_int ASC
      LIMIT 1000;
    `;

    console.log('➡️ /api/mercaderia SQL:', sql.replace(/\s+/g, ' ').trim());
    console.log('➡️ /api/mercaderia values:', values);

    const { rows } = await pool.query(sql, values);
    return res.json(rows);
  } catch (err) {
    console.error('❌ Error al obtener productos:', err);
    return res.status(500).json({ error: 'DB_ERROR', message: err.message });
  }
});

// ============================
// 🛒 PEDIDOS TIENDA
// ============================
app.post('/api/pedidos', async (req, res) => {
  const nuevoPedido = req.body;
  try {
    const { data, error } = await crearPedidoTienda(nuevoPedido);
    if (error) return res.status(500).json({ error: 'Error al crear pedido' });
    return res.json({ data: { id: data.id } });
  } catch (err) {
    console.error('❌ Error al crear pedido tienda:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/pedidos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await obtenerPedidoTiendaPorId(id);
    if (error) return res.status(404).json({ error: 'Pedido no encontrado' });
    return res.json(data);
  } catch (err) {
    console.error('❌ Error al obtener pedido tienda:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/pedidos/cliente/:clienteID', async (req, res) => {
  const { clienteID } = req.params;
  try {
    const { data, error } = await obtenerPedidoPorCliente(clienteID);
    if (error) return res.status(500).json({ error: 'Error interno del servidor' });
    if (!data) return res.status(404).json({ error: 'No se encontró pedido' });
    return res.json(data);
  } catch (err) {
    console.error('❌ Error al buscar pedido por cliente:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.patch('/api/pedidos/:id', async (req, res) => {
  const { id } = req.params;
  const { array_pedido, mensaje_cliente, contacto_cliente, nombre_cliente } = req.body;
  try {
    const query = `
      UPDATE pedidostienda
      SET
        array_pedido = COALESCE($1, array_pedido),
        mensaje_cliente = COALESCE($2, mensaje_cliente),
        contacto_cliente = COALESCE($3, contacto_cliente),
        nombre_cliente = COALESCE($4, nombre_cliente)
      WHERE id = $5
      RETURNING id
    `;
    const values = [
      array_pedido || null,
      mensaje_cliente || null,
      contacto_cliente || null,
      nombre_cliente || null,
      id,
    ];
    const { rows } = await pool.query(query, values);
    if (rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
    return res.json({ data: { id: rows[0].id } });
  } catch (err) {
    console.error('❌ Error al actualizar pedido tienda:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ---------- Start ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor backend corriendo en el puerto ${PORT}`);
});
