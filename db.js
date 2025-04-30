const { Pool } = require('pg');
require('dotenv').config(); // para leer el .env
console.log('🔍 DATABASE_URL:', process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // necesario para Supabase
  },
});

// ============================
// 📦 FUNCIONES PEDIDOS TIENDA
// ============================

// Crear un nuevo pedido
const crearPedidoTienda = async (nuevoPedido) => {
  const {
    fecha_pedido,
    cliente_tienda,
    array_pedido,
    contacto_cliente,
    mensaje_cliente
  } = nuevoPedido;

  try {
    const query = `
      INSERT INTO pedidostienda 
      (fecha_pedido, cliente_tienda, array_pedido, contacto_cliente, mensaje_cliente)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
    const values = [fecha_pedido, cliente_tienda, array_pedido, contacto_cliente, mensaje_cliente];
    const { rows } = await pool.query(query, values);

    return { data: rows[0], error: null };
  } catch (error) {
    console.error('❌ Error en crearPedidoTienda:', error);
    return { data: null, error };
  }
};


// Obtener un pedido por su ID
const obtenerPedidoTiendaPorId = async (id) => {
  try {
    const query = `
      SELECT * FROM pedidostienda
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
  pool, // ➡️ exporto también el pool por si lo usás directo en otros lugares
  crearPedidoTienda,
  obtenerPedidoTiendaPorId,
};
