# H.A.M. Poo | WMS Textil Avanzado (FÁBRICA 2.0)

Sistema de Gestión de Almacén (WMS) para Hilaturas y Acabados Modernos Poo. Permite la administración en tiempo real de inventario textil, control de rollos por código QR, terminal de escaneo por cámara, bitácora de movimientos y reportes.

---

## 🚀 Características Principal

- 📦 **Gestión de Bodegas**: Control independiente para Bodega 1 y Bodega 2.
- 📱 **Terminal de Escaneo QR**: Lectura rápida con cámara web o carga de imágenes de códigos QR.
- 🏷️ **Impresión de Etiquetas QR**: Generación e impresión instantánea de etiquetas en formato térmico/estándar.
- 📊 **Dashboard Interactivo**: Métricas visuales de metros acumulados y movimientos recientes con Chart.js.
- 📜 **Auditoría y Bitácora**: Registro cronológico de ingresos, salidas, ediciones y eliminaciones.
- 🔐 **Roles de Usuario**: Acceso para `admin` (control total y edición) y `operador` (lectura e ingresos).
- 💾 **Persistencia Doble**: Sincronización automática con Servidor Backend API REST y respaldo local en `localStorage`.

---

## 🛠️ Instalación y Uso Local

### Requisitos
- [Node.js](https://nodejs.org/) (versión 16 o superior)

### Pasos
1. Abrir una terminal en la carpeta del proyecto.
2. Instalar dependencias:
   ```bash
   npm install
   ```
3. Iniciar el servidor de desarrollo:
   ```bash
   npm start
   ```
4. Abrir en el navegador: `http://localhost:3000`

---

## 📤 Instrucciones para Subir a GitHub

### 1. Inicializar el repositorio Git local
```bash
git init
git add .
git commit -m "Initial commit - WMS Textil Fabrica 2.0 refactored and optimized"
```

### 2. Conectar con GitHub
1. Entra a [GitHub](https://github.com) y crea un nuevo repositorio (por ejemplo: `wms-fabrica-textil`).
2. Copia los comandos proporcionados por GitHub para enlazar el repositorio remoto:
   ```bash
   git remote add origin https://github.com/TU_USUARIO/wms-fabrica-textil.git
   git branch -M main
   git push -u origin main
   ```

---

## 🌐 Despliegue en Servidor en la Nube (Gratis / Producción)

### Opción A: Despliegue en Render.com (Recomendado para Node.js)
1. Inicia sesión en [Render.com](https://render.com/).
2. Haz clic en **New +** -> **Web Service**.
3. Conecta tu cuenta de GitHub y selecciona el repositorio `wms-fabrica-textil`.
4. Configura los datos:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Haz clic en **Create Web Service**. ¡Tu aplicación estará en línea con HTTPS gratis!

### Opción B: Despliegue en Vercel o Railway
- Simplemente conecta el repositorio GitHub en el panel de Vercel o Railway y se desplegará automáticamente.
