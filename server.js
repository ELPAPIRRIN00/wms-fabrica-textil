const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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

// Rutas de API REST
app.get('/api/productos', (req, res) => {
    res.json(inventario);
});

app.get('/api/bitacora', (req, res) => {
    res.json(bitacora);
});

app.post('/api/sincronizar', (req, res) => {
    const { inventario: inv, bitacora: bit } = req.body;
    if (Array.isArray(inv)) inventario = inv;
    if (Array.isArray(bit)) bitacora = bit;
    res.json({ status: 'ok', message: 'Datos sincronizados correctamente.' });
});

// Fallback SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor WMS Textil H.A.M. Poo en línea: http://localhost:${PORT}`);
});