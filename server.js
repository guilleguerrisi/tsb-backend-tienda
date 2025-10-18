// server.js
const express = require('express');
const cors = require('cors');
const app = express();

const {
  pool,
  crearPedidoTienda,
  obtenerPedidoTiendaPorId,
  obtenerPedidoPorCliente,
} = require('./db');

// ---------- Middlewares ----------
app.use(express.json());

// CORS con whitelist (prod)
const allowed = [
  'https://www.bazaronlinesalta.com.ar',
  'https://bazaronlinesalta.com.ar',
  'http://localhost:3000',
];
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowed.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// ---------- Healthcheck ----------
app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ============================
// 🔒 VERIFICACIÓN DE USUARIO
// ============================
app.post('/api/verificar-dispositivo', async (req, res) => {
  // acepta device_id o deviceId
  const device_id = req.body.device_id || req.body.deviceId;

  if (!device_id) {
    return res.status(400).json({ autorizado: false, error: 'Device ID requerido' });
  }

  try {
    const query = `
      SELECT id
      FROM usuarios_admin
      WHERE nombre_usuario = $1
      LIMIT 1
    `;
    const values = [device_id];
    const { rows } = await pool.query(query, values);

    if (rows.length > 0) {
      return res.json({ autorizado: true });
    } else {
      return res.json({ autorizado: false });
    }
  } catch (error) {
    console.error('❌ Error al verificar usuario autorizado:', error);
    return res.status(500).json({ autorizado: false, error: 'Error interno' });
  }
});

// ============================
// 📦 CATEGORÍAS Y PRODUCTOS
// ============================

// Categorías visibles (orden numérico robusto)
app.get('/api/categorias', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, grandescategorias, grcat, imagen_url, catcat
      FROM gcategorias
      WHERE LOWER(mostrarcat) = 'mostrar'
      ORDER BY
        (
          REPLACE(
            SUBSTRING(TRIM(catcat::text) FROM '(-?[0-9]+(?:[.,][0-9]+)?)'),
            ',', '.'
          )
        )::numeric NULLS LAST,
        grandescategorias ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error al obtener categorías:', err.message);
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});

// Buscar categorías por palabra (mismo orden)
app.get('/api/buscar-categorias', async (req, res) => {
  const { palabra } = req.query;

  if (!palabra || palabra.trim() === '') {
    return res.status(400).json({ error: 'Falta palabra clave para buscar' });
  }

  try {
    const query = `
      SELECT id, grandescategorias, grcat, imagen_url, catcat
      FROM gcategorias
      WHERE pc_categorias ILIKE '%' || $1 || '%'
        AND mostrarcat ILIKE 'mostrar'
      ORDER BY
        (
          REPLACE(
            SUBSTRING(TRIM(catcat::text) FROM '(-?[0-9]+(?:[.,][0-9]+)?)'),
            ',', '.'
          )
        )::numeric NULLS LAST,
        grandescategorias ASC
    `;
    const values = [palabra.trim()];
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error en /api/buscar-categorias:', error.message);
    res.status(500).json({ error: 'Error al buscar categorías' });
  }
});

// Productos
app.get('/api/mercaderia', async (req, res) => {
  try {
    const { buscar, grcat } = req.query;

    const where = [`LOWER(COALESCE(m.visibilidad, '')) = 'mostrar'`];
    const values = [];

    const texto =
      (buscar && buscar.trim() !== '')
        ? buscar.trim()
        : (grcat && grcat.trim() !== '' ? grcat.trim() : '');

    if (texto) {
      const tokens = texto
        .split(/[,\s]+/g)
        .map(t => t.trim())
        .filter(Boolean);

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
    res.json(rows);
  } catch (err) {
    console.error('❌ Error al obtener productos:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      where: err.where,
      stack: err.stack,
    });
    res.status(500).json({
      error: 'DB_ERROR',
      message: err.message,
      code: err.code,
      detail: err.detail,
    });
  }
});

// ============================
// 🛒 RUTAS DE PEDIDOS TIENDA
// ============================

// Crear nuevo pedido
app.post('/api/pedidos', async (req, res) => {
  const nuevoPedido = req.body;

  try {
    const { data, error } = await crearPedidoTienda(nuevoPedido);

    if (error) {
      console.error('❌ Error al crear pedido tienda:', error);
      return res.status(500).json({ error: 'Error al crear pedido' });
    }

    res.json({ data: { id: data.id } });
  } catch (err) {
    console.error('❌ Error inesperado al crear pedido tienda:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener pedido por ID
app.get('/api/pedidos/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await obtenerPedidoTiendaPorId(id);

    if (error) {
      console.error('❌ Pedido tienda no encontrado:', error);
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    res.json(data);
  } catch (err) {
    console.error('❌ Error inesperado al obtener pedido tienda:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener último pedido por cliente
app.get('/api/pedidos/cliente/:clienteID', async (req, res) => {
  const { clienteID } = req.params;

  try {
    const { data, error } = await obtenerPedidoPorCliente(clienteID);

    if (error) {
      console.error('❌ Error al buscar pedido por cliente:', error);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }

    if (!data) {
      return res.status(404).json({ error: 'No se encontró pedido para ese cliente' });
    }

    res.json(data);
  } catch (err) {
    console.error('❌ Error inesperado al buscar pedido por cliente:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Actualizar pedido
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
      id
    ];
    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    res.json({ data: { id: rows[0].id } });
  } catch (err) {
    console.error('❌ Error al actualizar pedido tienda:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ============================
// 🚀 INICIAR SERVIDOR
// ============================

// Usa el puerto que provee Railway/hosting
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor backend corriendo en el puerto ${PORT}`);
});
