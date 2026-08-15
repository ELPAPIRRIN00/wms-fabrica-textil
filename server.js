const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Servir archivos estáticos de la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de la base de datos PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Inicialización de la base de datos (crea tablas y datos semilla si no existen)
const initDB = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS inventario (
                id VARCHAR(50) PRIMARY KEY,
                tela VARCHAR(100) NOT NULL,
                color VARCHAR(50),
                presentacion VARCHAR(50),
                composicion VARCHAR(100),
                metros NUMERIC(10,2) DEFAULT 0,
                peso NUMERIC(10,2) DEFAULT 0,
                bodega INT DEFAULT 1,
                fecha VARCHAR(100),
                estado VARCHAR(20) DEFAULT 'Activo'
            );

            CREATE TABLE IF NOT EXISTS bitacora (
                id SERIAL PRIMARY KEY,
                fecha VARCHAR(100),
                usuario VARCHAR(50),
                accion VARCHAR(100),
                bodega VARCHAR(50),
                detalle TEXT
            );
        `);

        const resInventario = await pool.query('SELECT COUNT(*) FROM inventario');
        if (parseInt(resInventario.rows[0].count, 10) === 0) {
            await pool.query(`
                INSERT INTO inventario (id, tela, color, presentacion, composicion, metros, peso, bodega, fecha, estado) 
                VALUES 
                ('HAM-1001', 'Algodón Peinado', 'Blanco Óptico', 'Rollo', '100% Algodón Peinado', 120, 25, 1, $1, 'Activo'),
                ('HAM-1002', 'Algodón Peinado', 'Negro Intenso', 'Rollo', '100% Algodón Peinado', 80, 18, 1, $1, 'Activo'),
                ('HAM-1003', 'Poliéster Deportivo', 'Azul Marino', 'Bulto', '100% Poliéster', 200, 40, 2, $1, 'Activo');
            `, [new Date().toLocaleString()]);
        }

        const resBitacora = await pool.query('SELECT COUNT(*) FROM bitacora');
        if (parseInt(resBitacora.rows[0].count, 10) === 0) {
            await pool.query(`
                INSERT INTO bitacora (fecha, usuario, accion, bodega, detalle)
                VALUES ($1, 'Sistema', 'Inicialización', '-', 'Base de datos PostgreSQL inicializada.');
            `, [new Date().toLocaleString()]);
        }

        console.log('✅ Base de datos verificada e inicializada correctamente.');
    } catch (err) {
        console.error('❌ Error al inicializar la base de datos:', err.message);
    }
};

if (process.env.DATABASE_URL) {
    initDB();
}

// Middleware de manejo de errores global
const handleError = (err, res) => {
    console.error('Error en servidor:', err);
    res.status(500).json({ status: 'error', message: 'Error interno del servidor' });
};

// Rutas de API REST conectadas a PostgreSQL
app.get('/api/productos', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, tela, color, presentacion, composicion, CAST(metros AS FLOAT) as metros, CAST(peso AS FLOAT) as peso, bodega, fecha, estado FROM inventario ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        handleError(err, res);
    }
});

app.get('/api/bitacora', async (req, res) => {
    try {
        const result = await pool.query('SELECT fecha, usuario, accion, bodega, detalle FROM bitacora ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        handleError(err, res);
    }
});

app.post('/api/sincronizar', async (req, res) => {
    const client = await pool.connect();
    try {
        const { inventario: inv, bitacora: bit } = req.body;

        if (!Array.isArray(inv) || !Array.isArray(bit)) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Inventario y bitácora deben ser arrays válidos' 
            });
        }

        const inventarioValido = inv.every(item => 
            item.id && item.tela && typeof item.metros === 'number' && typeof item.peso === 'number'
        );
        
        if (!inventarioValido) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Algunos registros del inventario son inválidos' 
            });
        }

        await client.query('BEGIN');

        await client.query('DELETE FROM inventario');
        for (const item of inv) {
            await client.query(
                `INSERT INTO inventario (id, tela, color, presentacion, composicion, metros, peso, bodega, fecha, estado) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [item.id, item.tela, item.color, item.presentacion, item.composicion, item.metros, item.peso, item.bodega, item.fecha || new Date().toLocaleString(), item.estado || 'Activo']
            );
        }

        await client.query('DELETE FROM bitacora');
        for (const item of bit) {
            await client.query(
                `INSERT INTO bitacora (fecha, usuario, accion, bodega, detalle) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [item.fecha || new Date().toLocaleString(), item.usuario || 'Sistema', item.accion || 'Sincronización', item.bodega || '-', item.detalle || '']
            );
        }

        await client.query('COMMIT');
        console.log('✅ Datos sincronizados correctamente en la base de datos.');
        res.json({ status: 'ok', message: 'Datos sincronizados correctamente.' });
    } catch (err) {
        await client.query('ROLLBACK');
        handleError(err, res);
    } finally {
        client.release();
    }
});

// Fallback SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Manejo de errores 404
app.use((req, res) => {
    res.status(404).json({ status: 'error', message: 'Ruta no encontrada' });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor WMS Textil H.A.M. Poo en línea: http://localhost:${PORT}`);
});