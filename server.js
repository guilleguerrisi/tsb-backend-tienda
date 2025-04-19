const express = require('express');
const cors = require('cors');
const app = express();
const pool = require('./db'); // conexión a PostgreSQL

app.use(cors());
app.use(express.json());

// ✅ Obtener categorías visibles desde la tabla "gcategorias"
app.get('/api/categorias', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT grandescategorias, grcat
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

const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor backend corriendo en el puerto ${PORT}`);
});
