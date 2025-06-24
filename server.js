const express = require('express');
const cors = require('cors');
const app = express();
const { pool, crearPedidoTienda, obtenerPedidoTiendaPorId } = require('./db'); // conexión a PostgreSQL y funciones

app.use(cors());
app.use(express.json());





//INICIO DE SISTEMA VERIFICACION DE USUARIO


// 🔒 Verificar si un device_id (nombre_usuario) está autorizado
app.post('/api/verificar-dispositivo', async (req, res) => {
  const { device_id } = req.body; // En frontend seguimos mandando device_id

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




// ✅ Obtener categorías visibles desde la tabla "gcategorias"
app.get('/api/categorias', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT grandescategorias, grcat, imagen_url
      FROM gcategorias
      WHERE LOWER(mostrarcat) = 'mostrar'
      ORDER BY grandescategorias;
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error al obtener categorías:', err.message);
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});


// ✅ Obtener productos filtrados por "grcat" (buscando coincidencias en "palabrasclave2")
app.get('/api/mercaderia', async (req, res) => {
  try {
    const { grcat } = req.query;

    let query = `
      SELECT * FROM mercaderia
      WHERE visibilidad = 'MOSTRAR'
    `;
    const values = [];

    if (grcat && grcat.trim() !== '') {
      query += ` AND palabrasclave2 ILIKE '%' || $1 || '%'`;
      values.push(grcat.trim());
    }

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error al obtener productos:', err.message);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// ============================
// 🛒 RUTAS PEDIDOS TIENDA
// ============================

// Guardar un nuevo pedido
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

// Obtener un pedido por ID
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

// ✅ Inicializar servidor
const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor backend corriendo en el puerto ${PORT}`);
});
