const { Pool } = require('pg');
require('dotenv').config(); // para leer el .env
console.log('🔍 DATABASE_URL:', process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // necesario para Supabase
  },
});

module.exports = pool;
