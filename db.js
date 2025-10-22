// db.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('⚠️ Faltan SUPABASE_URL o SUPABASE_ANON_KEY en el entorno.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  global: { headers: { 'X-Client-Info': 'bazaronlinesalta-backend-anon' } },
});

/* ============================
   📂 CATEGORÍAS
   ============================ */

async function obtenerCategoriasVisibles() {
  try {
    const { data, error } = await supabase
      .from('gcategorias')
      .select('id, grandescategorias, grcat, imagen_url, catcat, mostrarcat')
      .ilike('mostrarcat', 'mostrar')
      // orden aproximado al SQL original
      .order('catcat', { ascending: true, nullsLast: true })
      .order('grandescategorias', { ascending: true });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (err) {
    console.error('❌ Error al obtener categorías:', err);
    return { data: null, error: err };
  }
}

async function buscarCategoriasPorPalabra(palabra) {
  try {
    const q = (palabra || '').trim();
    if (!q) return { data: [], error: null };

    const { data, error } = await supabase
      .from('gcategorias')
      .select('id, grandescategorias, grcat, imagen_url, catcat, mostrarcat, pc_categorias')
      .ilike('mostrarcat', 'mostrar')
      .ilike('pc_categorias', `%${q}%`)
      .order('catcat', { ascending: true, nullsLast: true })
      .order('grandescategorias', { ascending: true });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (err) {
    console.error('❌ Error en buscarCategoriasPorPalabra:', err);
    return { data: null, error: err };
  }
}

/* ============================
   🧾 PRODUCTOS
   ============================ */

// Construye una expresión OR con dos ramas: and(tokens en palabrasclave2) y and(tokens en descripcion_corta)
function buildAndTokensOrExpression(tokens) {
  const and_pal = `and(${tokens.map(t => `palabrasclave2.ilike.%${t}%`).join(',')})`;
  const and_desc = `and(${tokens.map(t => `descripcion_corta.ilike.%${t}%`).join(',')})`;
  return `${and_pal},${and_desc}`;
}

async function buscarMercaderia({ buscar, grcat }) {
  try {
    const texto = (buscar?.trim() || grcat?.trim() || '');
    let query = supabase
      .from('mercaderia')
      .select('id, codigo_int, descripcion_corta, imagen1, imagearray, costosiniva, iva, margen, grupo, fechaordengrupo, visibilidad')
      .ilike('visibilidad', 'mostrar');

    if (texto) {
      const tokens = texto.split(/[,\s]+/g).map(s => s.trim()).filter(Boolean);
      if (tokens.length) {
        const orExpr = buildAndTokensOrExpression(tokens);
        query = query.or(orExpr);
      }
    }

    const { data, error } = await query
      .order('grupo', { ascending: true, nullsLast: true })
      .order('fechaordengrupo', { ascending: false, nullsLast: true })
      .order('codigo_int', { ascending: true })
      .limit(1000);

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (err) {
    console.error('❌ Error al obtener productos:', err);
    return { data: null, error: err };
  }
}

/* ============================
   🛒 PEDIDOS TIENDA
   ============================ */

async function crearPedidoTienda(nuevoPedido) {
  try {
    const { data, error } = await supabase
      .from('pedidostienda')
      .insert([nuevoPedido])
      .select('id')
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('❌ Error en crearPedidoTienda:', err);
    return { data: null, error: err };
  }
}

async function obtenerPedidoTiendaPorId(id) {
  try {
    const { data, error } = await supabase
      .from('pedidostienda')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return { data: null, error: 'Pedido no encontrado' };
    return { data, error: null };
  } catch (err) {
    console.error('❌ Error en obtenerPedidoTiendaPorId:', err);
    return { data: null, error: err };
  }
}

async function obtenerPedidoPorCliente(cliente_tienda) {
  try {
    const { data, error } = await supabase
      .from('pedidostienda')
      .select('id, fecha_pedido')
      .eq('cliente_tienda', cliente_tienda)
      .order('fecha_pedido', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return { data: data || null, error: null };
  } catch (err) {
    console.error('❌ Error en obtenerPedidoPorCliente:', err);
    return { data: null, error: err };
  }
}

async function actualizarPedidoParcial(id, campos) {
  try {
    const patch = {};
    ['array_pedido', 'mensaje_cliente', 'contacto_cliente', 'nombre_cliente'].forEach(k => {
      if (campos[k] !== undefined) patch[k] = campos[k];
    });

    const { data, error } = await supabase
      .from('pedidostienda')
      .update(patch)
      .eq('id', id)
      .select('id')
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('❌ Error en actualizarPedidoParcial:', err);
    return { data: null, error: err };
  }
}

/* ============================
   🔒 USUARIOS ADMIN
   ============================ */

async function esDispositivoAutorizado(device_id) {
  try {
    const { count, error } = await supabase
      .from('usuarios_admin')
      .select('id', { count: 'exact', head: true })
      .eq('nombre_usuario', device_id)
      .limit(1);

    if (error) throw error;
    return { autorizado: (count || 0) > 0, error: null };
  } catch (err) {
    console.error('❌ Error al verificar usuario autorizado:', err);
    return { autorizado: false, error: err };
  }
}

module.exports = {
  supabase,
  // categorías
  obtenerCategoriasVisibles,
  buscarCategoriasPorPalabra,
  // productos
  buscarMercaderia,
  // pedidos
  crearPedidoTienda,
  obtenerPedidoTiendaPorId,
  obtenerPedidoPorCliente,
  actualizarPedidoParcial,
  // admin
  esDispositivoAutorizado,
};
