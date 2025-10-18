// db.js
const { Pool } = require('pg');
require('dotenv').config();

// 🔐 No loguear la DATABASE_URL en prod
if (!process.env.DATABASE_URL) {
  throw new Error('Falta la variable de entorno DATABASE_URL');
}

// ⚙️ Pool recomendado para Railway/Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,            // fuerza SSL en PaaS
    rejectUnauthorized: false // Supabase/Railway suelen necesitarlo
  },
  // Tuning saludable (ajústalo si tu app crece)
  max: 10,                    // conexiones máximas
  idleTimeoutMillis: 30_000,  // cerrar conexiones ociosas
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
  application_name: 'bazaronlinesalta-backend'
});

// 🔎 Opcional: logs mínimos útiles
pool.on('connect', () => console.log('✅ PG pool conectado'));
pool.on('error', (err) => console.error('❌ PG pool error:', err));

// 🧹 Cierre limpio al bajar el proceso (Railway re-deploy, etc.)
const gracefulShutdown = async (signal) => {
  try {
    console.log(`↩️ Recibida señal ${signal}. Cerrando pool PG…`);
    await pool.end();
    console.log('✅ Pool PG cerrado');
    process.exit(0);
  } catch (e) {
    console.error('❌ Error cerrando pool PG:', e);
    process.exit(1);
  }
};
['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => gracefulShutdown(sig)));

// ============================
// 📦 FUNCIONES PEDIDOS TIENDA
// ============================

// Crear un nuevo pedido
const crearPedidoTienda = async (nuevoPedido) => {
  const {
    fecha_pedido,
    cliente_tienda,
    nombre_cliente,
    array_pedido,       // si la columna es JSON/JSONB, podés mandar objeto JS
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
      fecha_pedido,       // ideal que sea timestamptz en DB
      cliente_tienda,
      nombre_cliente,
      array_pedido,       // si la columna es jsonb, PG serializa bien el objeto
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

// Buscar un pedido existente por cliente_tienda
const obtenerPedidoPorCliente = async (cliente_tienda) => {
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

    if (rows.length === 0) {
      return { data: null, error: null }; // no es error si no existe
    }
    return { data: rows[0], error: null };
  } catch (error) {
    console.error('❌ Error en obtenerPedidoPorCliente:', error);
    return { data: null, error };
  }
};

// Obtener un pedido por su ID
const obtenerPedidoTiendaPorId = async (id) => {
  try {
    const query = `
      SELECT *
      FROM pedidostienda
      WHERE id = $1
    `;
    const values = [id];
    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return { data: null, error: 'Pedido no encontrado' };
    }
    return { data: rows[0], error: null };
  } catch (error) {
    console.error('❌ Error en obtenerPedidoTiendaPorId:', error);
    return { data: null, error };
  }
};

module.exports = {
  pool, // exportar el pool es correcto
  crearPedidoTienda,
  obtenerPedidoTiendaPorId,
  obtenerPedidoPorCliente,
};
