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
    { id: 'HAM-1001', nombre_producto: 'Toalla Facial Hilaza', medidas: '40x70', stock_pz: 1, color: 'Blanco Óptico', composicion: '100% Algodón', tipo: 'ROLLO', bodega: 1, fecha: new Date().toLocaleString('es-MX'), estado: 'Activo' },
    { id: 'HAM-1002', nombre_producto: 'Sabana Algodón Peinado', medidas: '160x200', stock_pz: 1, color: 'Negro Intenso', composicion: '100% Algodón Peinado', tipo: 'PAQUETE', bodega: 1, fecha: new Date().toLocaleString('es-MX'), estado: 'Activo' },
    { id: 'HAM-1003', nombre_producto: 'Tela Poliéster Deportivo', medidas: '150x300', stock_pz: 1, color: 'Azul Marino', composicion: '100% Poliéster', tipo: 'BULTO', bodega: 2, fecha: new Date().toLocaleString('es-MX'), estado: 'Activo' }
];

let fallbackBitacora = [
    { id: 1, fecha: new Date().toLocaleString('es-MX'), usuario: 'Sistema', accion: 'Inicialización', bodega: '-', detalle: 'Servidor WMS iniciado.' }
];

// Pool de conexión a PostgreSQL
const pool = process.env.DATABASE_URL ? new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
}) : null;

// Inicialización de la Base de Datos PostgreSQL
const initDB = async () => {
    if (!pool) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS inventario (
                id VARCHAR(50) PRIMARY KEY,
                nombre_producto VARCHAR(150) NOT NULL,
                medidas VARCHAR(50),
                stock_pz INT DEFAULT 0,
                color VARCHAR(50),
                composicion VARCHAR(100),
                tipo VARCHAR(20) DEFAULT 'ROLLO',
                bodega INT DEFAULT 1,
                fecha VARCHAR(100),
                estado VARCHAR(20) DEFAULT 'Activo',
                tela VARCHAR(100),
                presentacion VARCHAR(50),
                metros NUMERIC(10,2),
                peso NUMERIC(10,2)
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

        // Garantizar existencia de columnas en migraciones de esquemas anteriores
        const alterQueries = [
            "ALTER TABLE inventario ADD COLUMN IF NOT EXISTS nombre_producto VARCHAR(150)",
            "ALTER TABLE inventario ADD COLUMN IF NOT EXISTS medidas VARCHAR(50)",
            "ALTER TABLE inventario ADD COLUMN IF NOT EXISTS stock_pz INT DEFAULT 0",
            "ALTER TABLE inventario ADD COLUMN IF NOT EXISTS tipo VARCHAR(20)",
            "ALTER TABLE inventario ADD COLUMN IF NOT EXISTS tela VARCHAR(100)",
            "ALTER TABLE inventario ADD COLUMN IF NOT EXISTS presentacion VARCHAR(50)",
            "ALTER TABLE inventario ADD COLUMN IF NOT EXISTS metros NUMERIC(10,2)",
            "ALTER TABLE inventario ADD COLUMN IF NOT EXISTS peso NUMERIC(10,2)"
        ];

        for (const q of alterQueries) {
            try { await pool.query(q); } catch (e) { /* Columna ya existente */ }
        }

        const resInventario = await pool.query('SELECT COUNT(*) FROM inventario');
        if (parseInt(resInventario.rows[0].count, 10) === 0) {
            for (const item of fallbackInventario) {
                await pool.query(`
                    INSERT INTO inventario (id, nombre_producto, medidas, stock_pz, color, composicion, tipo, bodega, fecha, estado, tela, presentacion, metros, peso)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                    ON CONFLICT (id) DO NOTHING
                `, [item.id, item.nombre_producto, item.medidas, item.stock_pz, item.color, item.composicion, item.tipo, item.bodega, item.fecha, item.estado, item.nombre_producto, item.tipo, item.stock_pz, 0]);
            }
        }

        const resBitacora = await pool.query('SELECT COUNT(*) FROM bitacora');
        if (parseInt(resBitacora.rows[0].count, 10) === 0) {
            await pool.query(`
                INSERT INTO bitacora (fecha, usuario, accion, bodega, detalle)
                VALUES ($1, 'Sistema', 'Inicialización', '-', 'Base de datos PostgreSQL inicializada con esquema WMS.')
            `, [new Date().toLocaleString('es-MX')]);
        }

        console.log('✅ Base de datos PostgreSQL estructurada e inicializada correctamente.');
    } catch (err) {
        console.error('❌ Error al inicializar la base de datos PostgreSQL:', err.message);
    }
};

// Manejo centralizado de errores
const handleError = (err, res) => {
    console.error('❌ Error en servidor WMS:', err.message || err);
    res.status(500).json({ status: 'error', message: err.message || 'Error interno en el servidor WMS' });
};

// Healthcheck endpoint
app.get('/api/health', async (req, res) => {
    if (!pool) return res.json({ status: 'ok', database: 'fallback' });
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'connected' });
    } catch (err) {
        console.error('Healthcheck PostgreSQL fallido:', err.message);
        res.status(503).json({ status: 'error', database: 'unavailable', error: err.message });
    }
});

/* =========================================================
 * 🛠️ RUTAS DE LA API REST (POSTGRESQL REAL-TIME)
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
        const cleanId = String(id).trim();

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

// 3. Crear o actualizar una pieza individual. Un ID/QR siempre equivale a una pieza.
app.post('/api/productos', async (req, res) => {
    try {
        const { id, nombre_producto, medidas, stock_pz, color, composicion, tipo, bodega, fecha, estado } = req.body;

        if (!id || !nombre_producto || stock_pz === undefined || !tipo) {
            return res.status(400).json({ status: 'error', message: 'Faltan campos obligatorios (ID, Nombre, Stock o Tipo).' });
        }

        const cleanId = String(id).trim();
        const cleanNombre = String(nombre_producto).trim();
        const cleanMedidas = String(medidas || 'N/A').trim();
        const estReg = estado || 'Activo';
        // No se permiten cantidades por QR: activo = 1 pieza, salida = 0 piezas.
        const numStock = estReg === 'Salida' ? 0 : 1;
        const cleanColor = String(color || '').trim();
        const cleanComposicion = String(composicion || '').trim();
        const cleanTipo = String(tipo || 'ROLLO').toUpperCase().trim();
        const numBodega = parseInt(bodega, 10) || 1;
        const fechaReg = fecha || new Date().toLocaleString('es-MX');

        if (pool) {
            await pool.query(`
                INSERT INTO inventario (id, nombre_producto, medidas, stock_pz, color, composicion, tipo, bodega, fecha, estado, tela, presentacion, metros, peso)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
            `, [
                cleanId,           // $1
                cleanNombre,       // $2
                cleanMedidas,      // $3
                numStock,          // $4 (int)
                cleanColor,        // $5
                cleanComposicion,  // $6
                cleanTipo,         // $7
                numBodega,         // $8
                fechaReg,          // $9
                estReg,            // $10
                cleanNombre,       // $11 (tela)
                cleanTipo,         // $12 (presentacion)
                numStock,          // $13 (metros)
                0                  // $14 (peso)
            ]);
        } else {
            const index = fallbackInventario.findIndex(item => item.id === cleanId);
            const nuevoObj = { id: cleanId, nombre_producto: cleanNombre, medidas: cleanMedidas, stock_pz: numStock, color: cleanColor, composicion: cleanComposicion, tipo: cleanTipo, bodega: numBodega, fecha: fechaReg, estado: estReg };
            if (index >= 0) {
                fallbackInventario[index] = nuevoObj;
            } else {
                fallbackInventario.unshift(nuevoObj);
            }
        }

        res.json({ status: 'ok', message: 'Producto guardado correctamente en la Base de Datos.' });
    } catch (err) {
        handleError(err, res);
    }
});

// 4. Eliminar una pieza y su QR. La evidencia permanece en la bitácora del cliente.
app.delete('/api/productos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const cleanId = String(id).trim();
        const motivo = String(req.body?.motivo || '').trim();
        if (!motivo) {
            return res.status(400).json({ status: 'error', message: 'El motivo de baja es obligatorio.' });
        }

        if (pool) {
            const result = await pool.query('DELETE FROM inventario WHERE id = $1 RETURNING *', [cleanId]);
            if (result.rowCount === 0) {
                return res.status(404).json({ status: 'error', message: 'El producto no existe en la base de datos.' });
            }
        } else {
            const producto = fallbackInventario.find(item => item.id === cleanId);
            if (!producto) return res.status(404).json({ status: 'error', message: 'El producto no fue encontrado.' });
            fallbackInventario = fallbackInventario.filter(item => item.id !== cleanId);
        }

        res.json({ status: 'ok', message: `Pieza ${cleanId} y su código QR fueron eliminados correctamente.` });
    } catch (err) {
        handleError(err, res);
    }
});

// 4b. Eliminar productos por familia/tipo, incluidos sus QR individuales.
app.delete('/api/productos/tipo/:nombre', async (req, res) => {
    try {
        const { nombre } = req.params;
        const cleanNombre = String(nombre).trim();
        const motivo = String(req.body?.motivo || '').trim();
        const usuario = String(req.body?.usuario || 'Administrador').trim();
        if (!motivo) {
            return res.status(400).json({ status: 'error', message: 'El motivo de baja es obligatorio.' });
        }

        if (pool) {
            const result = await pool.query(
                'DELETE FROM inventario WHERE nombre_producto = $1 OR tela = $1 RETURNING *',
                [cleanNombre]
            );
            if (result.rowCount === 0) {
                return res.status(404).json({ status: 'error', message: 'No se encontraron productos activos de esta familia.' });
            }
        } else {
            let actualizados = 0;
            const originales = fallbackInventario.length;
            fallbackInventario = fallbackInventario.filter(item => item.nombre_producto !== cleanNombre && item.tela !== cleanNombre);
            actualizados = originales - fallbackInventario.length;
            if (actualizados === 0) {
                 return res.status(404).json({ status: 'error', message: 'No se encontraron productos activos de esta familia.' });
            }
        }

        const detalleBitacora = `Eliminación de familia y sus QR: "${cleanNombre}". Motivo: ${motivo}`;
        const fechaReg = new Date().toLocaleString('es-MX');
        
        if (pool) {
             await pool.query(
                'INSERT INTO bitacora (fecha, usuario, accion, bodega, detalle) VALUES ($1, $2, $3, $4, $5)',
                [fechaReg, usuario, 'Eliminación de piezas y QR', 'General', detalleBitacora]
            );
        } else {
             fallbackBitacora.unshift({ id: Date.now(), fecha: fechaReg, usuario: usuario, accion: 'Eliminación de piezas y QR', bodega: 'General', detalle: detalleBitacora });
        }

        res.json({ status: 'ok', message: `Familia de productos '${cleanNombre}' dada de baja correctamente.` });
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

// 5b. Crear entrada individual en bitácora
app.post('/api/bitacora', async (req, res) => {
    try {
        const { fecha, usuario, accion, bodega, detalle } = req.body;

        if (!accion) {
            return res.status(400).json({ status: 'error', message: 'La acción es obligatoria.' });
        }

        const fechaReg = fecha || new Date().toLocaleString('es-MX');
        const usuarioReg = usuario || 'Sistema';
        const bodegaReg = bodega || '-';
        const detalleReg = detalle || '';

        if (pool) {
            await pool.query(
                'INSERT INTO bitacora (fecha, usuario, accion, bodega, detalle) VALUES ($1, $2, $3, $4, $5)',
                [fechaReg, usuarioReg, accion, bodegaReg, detalleReg]
            );
        } else {
            fallbackBitacora.unshift({ id: Date.now(), fecha: fechaReg, usuario: usuarioReg, accion, bodega: bodegaReg, detalle: detalleReg });
        }

        res.json({ status: 'ok', message: 'Entrada de bitácora registrada.' });
    } catch (err) {
        handleError(err, res);
    }
});

// 6. Sincronización masiva de respaldo
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
        
        if (Array.isArray(inv) && inv.length > 0) {
            for (const item of inv) {
                const cleanId = String(item.id).trim();
                const cleanNombre = String(item.nombre_producto || item.tela || '').trim();
                const cleanMedidas = String(item.medidas || 'N/A').trim();
                const numStock = item.estado === 'Salida' ? 0 : 1;
                const cleanColor = String(item.color || '').trim();
                const cleanComposicion = String(item.composicion || '').trim();
                const cleanTipo = String(item.tipo || item.presentacion || 'ROLLO').toUpperCase().trim();
                const numBodega = parseInt(item.bodega || 1, 10) || 1;
                const fechaReg = item.fecha || new Date().toLocaleString('es-MX');
                const estReg = item.estado || 'Activo';

                await client.query(`
                    INSERT INTO inventario (id, nombre_producto, medidas, stock_pz, color, composicion, tipo, bodega, fecha, estado, tela, presentacion, metros, peso)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                    ON CONFLICT (id) DO UPDATE SET
                        nombre_producto = EXCLUDED.nombre_producto,
                        medidas = EXCLUDED.medidas,
                        stock_pz = EXCLUDED.stock_pz,
                        color = EXCLUDED.color,
                        composicion = EXCLUDED.composicion,
                        tipo = EXCLUDED.tipo,
                        bodega = EXCLUDED.bodega,
                        fecha = EXCLUDED.fecha,
                        estado = EXCLUDED.estado
                `, [cleanId, cleanNombre, cleanMedidas, numStock, cleanColor, cleanComposicion, cleanTipo, numBodega, fechaReg, estReg, cleanNombre, cleanTipo, numStock, 0]);
            }
        }

        if (Array.isArray(bit) && bit.length > 0) {
            for (const item of bit) {
                await client.query(`
                    INSERT INTO bitacora (fecha, usuario, accion, bodega, detalle)
                    VALUES ($1, $2, $3, $4, $5)
                `, [item.fecha || new Date().toLocaleString('es-MX'), item.usuario || 'Sistema', item.accion || 'Movimiento', item.bodega || '-', item.detalle || '']);
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
        console.log(`🚀 Servidor WMS Textil H.A.M. Poo en línea en puerto ${PORT}`);
    });
};

iniciarServidor().catch((err) => {
    console.error('❌ No se pudo iniciar el servidor WMS:', err.message);
    process.exitCode = 1;
});
