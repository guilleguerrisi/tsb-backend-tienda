// db.js
const { Pool } = require('pg');
require('dotenv').config();

let pool = null;

// 🔐 Inicialización segura del pool (no rompas el proceso si falta DATABASE_URL)
if (!process.env.DATABASE_URL) {
  console.error('⚠️ DATABASE_URL no está definida. El pool de Postgres no se inicializa.');
} else {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL, // 👉 usa aquí la URI del Session Pooler de Supabase
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
      application_name: 'bazaronlinesalta-backend',
    });

    pool.on('connect', () => console.log('✅ PG pool conectado'));
    pool.on('error', (err) => console.error('❌ PG pool error:', err));
  } catch (e) {
    console.error('❌ Error creando el pool PG:', e);
  }
}

// 🧹 Cierre limpio al bajar el proceso (Railway re-deploy, etc.)
const gracefulShutdown = async (signal) => {
  try {
    console.log(`↩️ Recibida señal ${signal}. Cerrando pool PG…`);
    if (pool) await pool.end();
    console.log('✅ Pool PG cerrado');
    process.exit(0);
  } catch (e) {
    console.error('❌ Error cerrando pool PG:', e);
    process.exit(1);
  }
};
['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => gracefulShutdown(sig)));

// ============================
// 📂 FUNCIONES DE CATEGORÍAS
// ============================
async function obtenerCategoriasVisibles() {
  if (!pool) return { data: null, error: new Error('DB_NOT_INITIALIZED') };
  try {
    const query = `
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
    `;
    const { rows } = await pool.query(query);
    return { data: rows, error: null };
  } catch (err) {
    console.error('❌ Error al obtener categorías:', err);
    return { data: null, error: err };
  }
}

async function buscarCategoriasPorPalabra(palabra) {
  if (!pool) return { data: null, error: new Error('DB_NOT_INITIALIZED') };
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
    const { rows } = await pool.query(query, [palabra.trim()]);
    return { data: rows, error: null };
  } catch (err) {
    console.error('❌ Error en buscarCategoriasPorPalabra:', err);
    return { data: null, error: err };
  }
}

// ============================
// 🛒 FUNCIONES PEDIDOS TIENDA
// ============================
const crearPedidoTienda = async (nuevoPedido) => {
  if (!pool) return { data: null, error: new Error('DB_NOT_INITIALIZED') };
  const {
    fecha_pedido,
    cliente_tienda,
    nombre_cliente,
    array_pedido,
    contacto_cliente,
    mensaje_cliente
  } = nuevoPedido;

  try {
    const query = `
      INSERT INTO pedidostienda 
        (fecha_pedido, cliente_tienda, nombre_cliente, array_pedido, contacto_cliente, mensaje_cliente)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;
    const values = [
      fecha_pedido,
      cliente_tienda,
      nombre_cliente,
      array_pedido,
      contacto_cliente,
      mensaje_cliente
    ];
    const { rows } = await pool.query(query, values);
    return { data: rows[0], error: null };
  } catch (error) {
    console.error('❌ Error en crearPedidoTienda:', error);
    return { data: null, error };
  }
};

const obtenerPedidoPorCliente = async (cliente_tienda) => {
  if (!pool) return { data: null, error: new Error('DB_NOT_INITIALIZED') };
  try {
    const query = `
      SELECT id
      FROM pedidostienda
      WHERE cliente_tienda = $1
      ORDER BY fecha_pedido DESC
      LIMIT 1
    `;
    const values = [cliente_tienda];
    const { rows } = await pool.query(query, values);
    if (rows.length === 0) return { data: null, error: null };
    return { data: rows[0], error: null };
  } catch (error) {
    console.error('❌ Error en obtenerPedidoPorCliente:', error);
    return { data: null, error };
  }
};

const obtenerPedidoTiendaPorId = async (id) => {
  if (!pool) return { data: null, error: new Error('DB_NOT_INITIALIZED') };
  try {
    const query = `
      SELECT *
      FROM pedidostienda
      WHERE id = $1
    `;
    const values = [id];
    const { rows } = await pool.query(query, values);
    if (rows.length === 0) return { data: null, error: 'Pedido no encontrado' };
    return { data: rows[0], error: null };
  } catch (error) {
    console.error('❌ Error en obtenerPedidoTiendaPorId:', error);
    return { data: null, error };
  }
};

module.exports = {
  pool,
  obtenerCategoriasVisibles,
  buscarCategoriasPorPalabra,
  crearPedidoTienda,
  obtenerPedidoTiendaPorId,
  obtenerPedidoPorCliente,
};
