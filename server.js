const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Express
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Datos iniciales de respaldo (Fallback local si no hay DB activa)
let fallbackInventario = [
    { id: 'HAM-1001', nombre_producto: 'Toalla Facial Hilaza', medidas: '40x70', stock_pz: 120, color: 'Blanco Óptico', composicion: '100% Algodón', tipo: 'ROLLO', bodega: 1, fecha: new Date().toLocaleString(), estado: 'Activo' },
    { id: 'HAM-1002', nombre_producto: 'Sabana Algodón Peinado', medidas: '160x200', stock_pz: 80, color: 'Negro Intenso', composicion: '100% Algodón Peinado', tipo: 'PAQUETE', bodega: 1, fecha: new Date().toLocaleString(), estado: 'Activo' },
    { id: 'HAM-1003', nombre_producto: 'Tela Poliéster Deportivo', medidas: '150x300', stock_pz: 200, color: 'Azul Marino', composicion: '100% Poliéster', tipo: 'BULTO', bodega: 2, fecha: new Date().toLocaleString(), estado: 'Activo' }
];

let fallbackBitacora = [
    { id: 1, fecha: new Date().toLocaleString(), usuario: 'Sistema', accion: 'Inicialización', bodega: '-', detalle: 'Servidor WMS iniciado.' }
];

// Pool de conexión a PostgreSQL
const pool = process.env.DATABASE_URL ? new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
}) : null;

// Inicialización de la Base de Datos PostgreSQL
const initDB = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS inventario (
                id VARCHAR(50) PRIMARY KEY,
                nombre_producto VARCHAR(150) NOT NULL,
                medidas VARCHAR(50),
                stock_pz INT DEFAULT 0,
                color VARCHAR(50),
                composicion VARCHAR(100),
                tipo VARCHAR(20) CHECK (tipo IN ('BULTO', 'PAQUETE', 'ROLLO')),
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

            ALTER TABLE inventario ADD COLUMN IF NOT EXISTS nombre_producto VARCHAR(150);
            ALTER TABLE inventario ADD COLUMN IF NOT EXISTS medidas VARCHAR(50);
            ALTER TABLE inventario ADD COLUMN IF NOT EXISTS stock_pz INT DEFAULT 0;
            ALTER TABLE inventario ADD COLUMN IF NOT EXISTS tipo VARCHAR(20);
            ALTER TABLE inventario ADD COLUMN IF NOT EXISTS tela VARCHAR(100);
            ALTER TABLE inventario ADD COLUMN IF NOT EXISTS presentacion VARCHAR(50);
            ALTER TABLE inventario ADD COLUMN IF NOT EXISTS metros NUMERIC(10,2);
            ALTER TABLE inventario ADD COLUMN IF NOT EXISTS peso NUMERIC(10,2);

            UPDATE inventario
            SET nombre_producto = COALESCE(NULLIF(nombre_producto, ''), tela, 'Producto sin nombre'),
                medidas = COALESCE(NULLIF(medidas, ''), 'N/A'),
                stock_pz = COALESCE(NULLIF(stock_pz, 0), GREATEST(COALESCE(metros, 0)::INT, 0)),
                tipo = COALESCE(NULLIF(tipo, ''), UPPER(COALESCE(presentacion, 'ROLLO')))
            WHERE nombre_producto IS NULL
               OR nombre_producto = ''
               OR medidas IS NULL
               OR stock_pz IS NULL
               OR tipo IS NULL
               OR tipo = '';
        `);

        const resInventario = await pool.query('SELECT COUNT(*) FROM inventario');
        if (parseInt(resInventario.rows[0].count, 10) === 0) {
            for (const item of fallbackInventario) {
                await pool.query(`
                    INSERT INTO inventario (id, nombre_producto, medidas, stock_pz, color, composicion, tipo, bodega, fecha, estado, tela, presentacion, metros, peso)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $2, $7, $4, 0)
                `, [item.id, item.nombre_producto, item.medidas, item.stock_pz, item.color, item.composicion, item.tipo, item.bodega, item.fecha, item.estado]);
            }
        }

        const resBitacora = await pool.query('SELECT COUNT(*) FROM bitacora');
        if (parseInt(resBitacora.rows[0].count, 10) === 0) {
            await pool.query(`
                INSERT INTO bitacora (fecha, usuario, accion, bodega, detalle)
                VALUES ($1, 'Sistema', 'Inicialización', '-', 'Base de datos PostgreSQL inicializada con esquema WMS.')
            `, [new Date().toLocaleString()]);
        }

        console.log('✅ Base de datos PostgreSQL estructurada e inicializada correctamente.');
    } catch (err) {
        console.error('❌ Error al inicializar la base de datos:', err.message);
    }
};

// Manejo centralizado de errores
const handleError = (err, res) => {
    console.error('Error en servidor:', err);
    res.status(500).json({ status: 'error', message: 'Error interno en el servidor WMS' });
};

/* =========================================================
 * 🛠️ RUTAS DE LA API REST
 * ========================================================= */

// 1. Obtener todos los productos del inventario
app.get('/api/productos', async (req, res) => {
    try {
        if (pool) {
            const result = await pool.query('SELECT * FROM inventario ORDER BY fecha DESC');
            return res.json(result.rows);
        }
        res.json(fallbackInventario);
    } catch (err) {
        handleError(err, res);
    }
});

// 2. Buscar producto específico por ID (Utilizado por el Escáner QR)
app.get('/api/productos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const cleanId = id.trim();

        if (pool) {
            const result = await pool.query('SELECT * FROM inventario WHERE id = $1', [cleanId]);
            if (result.rows.length === 0) {
                return res.status(404).json({ status: 'error', message: 'Producto no encontrado o fue eliminado.' });
            }
            return res.json(result.rows[0]);
        } else {
            const producto = fallbackInventario.find(item => item.id === cleanId);
            if (!producto) {
                return res.status(404).json({ status: 'error', message: 'Producto no encontrado en memoria local.' });
            }
            return res.json(producto);
        }
    } catch (err) {
        handleError(err, res);
    }
});

// 3. Crear o actualizar un producto individual
app.post('/api/productos', async (req, res) => {
    try {
        const { id, nombre_producto, medidas, stock_pz, color, composicion, tipo, bodega, fecha, estado } = req.body;

        if (!id || !nombre_producto || stock_pz === undefined || !tipo) {
            return res.status(400).json({ status: 'error', message: 'Faltan campos obligatorios para el producto.' });
        }

        const fechaReg = fecha || new Date().toLocaleString();
        const estReg = estado || 'Activo';

        if (pool) {
            await pool.query(`
                INSERT INTO inventario (id, nombre_producto, medidas, stock_pz, color, composicion, tipo, bodega, fecha, estado, tela, presentacion, metros, peso)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $2, $7, $4, 0)
                ON CONFLICT (id) DO UPDATE SET
                    nombre_producto = EXCLUDED.nombre_producto,
                    medidas = EXCLUDED.medidas,
                    stock_pz = EXCLUDED.stock_pz,
                    color = EXCLUDED.color,
                    composicion = EXCLUDED.composicion,
                    tipo = EXCLUDED.tipo,
                    bodega = EXCLUDED.bodega,
                    fecha = EXCLUDED.fecha,
                        estado = EXCLUDED.estado,
                        tela = EXCLUDED.tela,
                        presentacion = EXCLUDED.presentacion,
                        metros = EXCLUDED.metros,
                        peso = EXCLUDED.peso
            `, [id, nombre_producto, medidas, parseInt(stock_pz, 10), color, composicion, tipo, bodega || 1, fechaReg, estReg]);
        } else {
            const index = fallbackInventario.findIndex(item => item.id === id);
            const nuevoObj = { id, nombre_producto, medidas, stock_pz: parseInt(stock_pz, 10), color, composicion, tipo, bodega: bodega || 1, fecha: fechaReg, estado: estReg };
            if (index >= 0) {
                fallbackInventario[index] = nuevoObj;
            } else {
                fallbackInventario.unshift(nuevoObj);
            }
        }

        res.json({ status: 'ok', message: 'Producto guardado correctamente.' });
    } catch (err) {
        handleError(err, res);
    }
});

// 4. Eliminar producto por ID (Eliminación Física)
app.delete('/api/productos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const cleanId = id.trim();
        const motivo = String(req.body?.motivo || '').trim();
        if (!motivo) {
            return res.status(400).json({ status: 'error', message: 'El motivo de baja es obligatorio.' });
        }

        if (pool) {
            const result = await pool.query("UPDATE inventario SET estado = 'Merma/Defecto' WHERE id = $1 AND estado <> 'Merma/Defecto' RETURNING *", [cleanId]);
            if (result.rowCount === 0) {
                return res.status(404).json({ status: 'error', message: 'El producto no existe o ya está dado de baja.' });
            }
        } else {
            const producto = fallbackInventario.find(item => item.id === cleanId);
            if (!producto || producto.estado === 'Merma/Defecto') return res.status(404).json({ status: 'error', message: 'El producto no fue encontrado.' });
            producto.estado = 'Merma/Defecto';
        }

        res.json({ status: 'ok', message: `Producto ${cleanId} dado de baja; no se borró físicamente.` });
    } catch (err) {
        handleError(err, res);
    }
});

// 5. Obtener bitácora
app.get('/api/bitacora', async (req, res) => {
    try {
        if (pool) {
            const result = await pool.query('SELECT * FROM bitacora ORDER BY id DESC LIMIT 100');
            return res.json(result.rows);
        }
        res.json(fallbackBitacora);
    } catch (err) {
        handleError(err, res);
    }
});

// 6. Sincronización completa masiva
app.post('/api/sincronizar', async (req, res) => {
    if (!pool) {
        const { inventario: inv, bitacora: bit } = req.body;
        if (Array.isArray(inv)) fallbackInventario = inv;
        if (Array.isArray(bit)) fallbackBitacora = bit;
        return res.json({ status: 'ok', message: 'Datos sincronizados en memoria local.' });
    }

    const client = await pool.connect();
    try {
        const { inventario: inv, bitacora: bit } = req.body;

        await client.query('BEGIN');
        await client.query('DELETE FROM inventario');
        
        if (Array.isArray(inv)) {
            for (const item of inv) {
                await client.query(`
                    INSERT INTO inventario (id, nombre_producto, medidas, stock_pz, color, composicion, tipo, bodega, fecha, estado, tela, presentacion, metros, peso)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $2, $7, $4, $11)
                `, [item.id, item.nombre_producto || item.tela, item.medidas || 'N/A', item.stock_pz || item.metros || 0, item.color || '', item.composicion || '', item.tipo || item.presentacion || 'ROLLO', item.bodega || 1, item.fecha || new Date().toLocaleString(), item.estado || 'Activo', item.peso || 0]);
            }
        }

        if (Array.isArray(bit)) {
            await client.query('DELETE FROM bitacora');
            for (const item of bit) {
                await client.query(`
                    INSERT INTO bitacora (fecha, usuario, accion, bodega, detalle)
                    VALUES ($1, $2, $3, $4, $5)
                `, [item.fecha || new Date().toLocaleString(), item.usuario || 'Sistema', item.accion || 'Movimiento', item.bodega || '-', item.detalle || '']);
            }
        }

        await client.query('COMMIT');
        res.json({ status: 'ok', message: 'Base de datos sincronizada correctamente.' });
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

// Iniciar Servidor
const iniciarServidor = async () => {
    if (pool) await initDB();
    app.listen(PORT, () => {
        console.log(`🚀 Servidor WMS Textil H.A.M. Poo en línea en http://localhost:${PORT}`);
    });
};

iniciarServidor().catch((err) => {
    console.error('❌ No se pudo iniciar el servidor WMS:', err.message);
    process.exitCode = 1;
});