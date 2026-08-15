const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Servir archivos estáticos de la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

// Datos en memoria con presentación y composición
let inventario = [
    { id: 'HAM-1001', tela: 'Algodón Peinado', color: 'Blanco Óptico', presentacion: 'Rollo', composicion: '100% Algodón Peinado', metros: 120, peso: 25, bodega: 1, fecha: new Date().toLocaleString(), estado: 'Activo' },
    { id: 'HAM-1002', tela: 'Algodón Peinado', color: 'Negro Intenso', presentacion: 'Rollo', composicion: '100% Algodón Peinado', metros: 80, peso: 18, bodega: 1, fecha: new Date().toLocaleString(), estado: 'Activo' },
    { id: 'HAM-1003', tela: 'Poliéster Deportivo', color: 'Azul Marino', presentacion: 'Bulto', composicion: '100% Poliéster', metros: 200, peso: 40, bodega: 2, fecha: new Date().toLocaleString(), estado: 'Activo' }
];

let bitacora = [
    { fecha: new Date().toLocaleString(), usuario: 'Sistema', accion: 'Inicialización', bodega: '-', detalle: 'Servidor Express WMS iniciado.' }
];

// Middleware de manejo de errores global
const handleError = (err, res) => {
    console.error('Error en servidor:', err);
    res.status(500).json({ status: 'error', message: 'Error interno del servidor' });
};

// Rutas de API REST con validación
app.get('/api/productos', (req, res) => {
    try {
        if (!Array.isArray(inventario)) {
            throw new Error('Inventario no es un array válido');
        }
        res.json(inventario);
    } catch (err) {
        handleError(err, res);
    }
});

app.get('/api/bitacora', (req, res) => {
    try {
        if (!Array.isArray(bitacora)) {
            throw new Error('Bitácora no es un array válido');
        }
        res.json(bitacora);
    } catch (err) {
        handleError(err, res);
    }
});

app.post('/api/sincronizar', (req, res) => {
    try {
        const { inventario: inv, bitacora: bit } = req.body;

        // Validar que los datos sean arrays
        if (!Array.isArray(inv) || !Array.isArray(bit)) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Inventario y bitácora deben ser arrays válidos' 
            });
        }

        // Validar que los registros tengan los campos mínimos requeridos
        const inventarioValido = inv.every(item => 
            item.id && item.tela && typeof item.metros === 'number' && typeof item.peso === 'number'
        );
        
        if (!inventarioValido) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Algunos registros del inventario son inválidos' 
            });
        }

        // Actualizar datos si son válidos
        inventario = inv;
        bitacora = bit;
        
        console.log('✅ Datos sincronizados correctamente. Inventario:', inv.length, 'Bitácora:', bit.length);
        res.json({ status: 'ok', message: 'Datos sincronizados correctamente.' });
    } catch (err) {
        handleError(err, res);
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