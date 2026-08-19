/**
 * =========================================================
 * 🧠 H.A.M. POO - WMS Textil (v2.0)
 * Lógica Principal Frontend (Integrado con PostgreSQL & QR por ID)
 * =========================================================
 */

(function () {
    'use strict';

    const App = {
        usuario: null,
        rol: null,
        bodegaActiva: 1,
        vistaActual: 'dashboard',
        chartInstancia: null,
        productoEscaneadoActual: null,
        html5QrcodeScanner: null,
        inventario: [],
        bitacora: [],
        useBackend: true,

        cuentas: {
            admin: { password: '1234', nombre: 'Administrador' },
            operador: { password: '1234', nombre: 'Operador de Bodega' }
        },

        /* ---------- Inicialización ---------- */
        async init() {
            this.iniciarReloj();
            await this.cargarDatos();
            this.configurarNavegacion();
            this.configurarEventos();
            this.verificarSesion();
        },

        iniciarReloj() {
            const clockEl = document.getElementById('clock-display');
            setInterval(() => {
                const now = new Date();
                if (clockEl) {
                    clockEl.textContent = now.toLocaleTimeString('es-MX');
                }
            }, 1000);
        },

        obtenerFechaActual() {
            return new Date().toLocaleString('es-MX', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
        },

        /* ---------- Conexión con Backend REST ---------- */
        async cargarDatos() {
            try {
                const resInv = await fetch('/api/productos');
                if (resInv.ok) {
                    this.inventario = await resInv.json();
                }

                const resBit = await fetch('/api/bitacora');
                if (resBit.ok) {
                    this.bitacora = await resBit.json();
                }

                this.useBackend = true;
                this.actualizarStatusBadge(true);
            } catch (err) {
                console.warn('Servidor offline o sin conexión. Usando respaldo local.', err);
                this.useBackend = false;
                this.actualizarStatusBadge(false);
            }

            this.renderizarTodo();
        },

        actualizarStatusBadge(online) {
            const badge = document.getElementById('backend-status-badge');
            if (!badge) return;
            if (online) {
                badge.className = 'badge badge-success';
                badge.innerHTML = '<i class="ph ph-circle-wavy-check"></i> PostgreSQL Conectado';
            } else {
                badge.className = 'badge badge-warning';
                badge.innerHTML = '<i class="ph ph-warning"></i> Modo Local (Memoria)';
            }
        },

        async sincronizarConBackend() {
            if (!this.useBackend) return;
            try {
                await fetch('/api/sincronizar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        inventario: this.inventario,
                        bitacora: this.bitacora
                    })
                });
            } catch (e) {
                console.error('Error al sincronizar con backend:', e);
            }
        },

        /* ---------- Autenticación ---------- */
        verificarSesion() {
            const sesionGuardada = localStorage.getItem('ham_wms_session');
            if (sesionGuardada) {
                const data = JSON.parse(sesionGuardada);
                this.usuario = data.usuario;
                this.rol = data.rol;
                this.mostrarAppShell();
            } else {
                document.getElementById('login-modal').classList.add('active');
            }
        },

        iniciarSesion(usuario, password) {
            const cuenta = this.cuentas[usuario];
            if (cuenta && cuenta.password === password) {
                this.usuario = cuenta.nombre;
                this.rol = usuario === 'admin' ? 'Administrador' : 'Operador';
                localStorage.setItem('ham_wms_session', JSON.stringify({ usuario: this.usuario, rol: this.rol }));
                document.getElementById('login-modal').classList.remove('active');
                this.mostrarAppShell();
                this.mostrarToast(`Bienvenido al sistema, ${this.usuario}`, 'success');
            } else {
                this.mostrarToast('Contraseña incorrecta', 'danger');
            }
        },

        cerrarSesion() {
            localStorage.removeItem('ham_wms_session');
            location.reload();
        },

        mostrarAppShell() {
            document.getElementById('app-shell').classList.remove('hidden');
            document.getElementById('user-display-name').textContent = this.usuario;
            document.getElementById('user-display-role').textContent = this.rol;
            this.renderizarTodo();
        },

        /* ---------- Navegación ---------- */
        configurarNavegacion() {
            const btns = document.querySelectorAll('.nav-btn');
            btns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const target = btn.getAttribute('data-target');
                    btns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    document.querySelectorAll('.vista-page').forEach(page => page.classList.remove('active'));
                    const pageTarget = document.getElementById(`vista-${target}`);
                    if (pageTarget) pageTarget.classList.add('active');

                    this.vistaActual = target;
                    if (target === 'escaner') {
                        this.iniciarCamaraScanner();
                    } else {
                        this.detenerCamaraScanner();
                    }

                    this.renderizarTodo();
                });
            });
        },

        /* ---------- Configuración de Eventos ---------- */
        configurarEventos() {
            // Formulario Login
            document.getElementById('form-login').addEventListener('submit', (e) => {
                e.preventDefault();
                const user = document.getElementById('login-usuario').value;
                const pass = document.getElementById('login-pass').value;
                this.iniciarSesion(user, pass);
            });

            // Logout
            document.getElementById('btn-logout').addEventListener('click', () => this.cerrarSesion());

            // Bodega Selector
            document.getElementById('select-bodega').addEventListener('change', (e) => {
                this.bodegaActiva = parseInt(e.target.value, 10);
                this.mostrarToast(`Cambiado a Bodega ${this.bodegaActiva}`, 'info');
                this.renderizarTodo();
            });

            // Generar ID Aleatorio
            document.getElementById('btn-gen-id').addEventListener('click', () => {
                const randomNum = Math.floor(1000 + Math.random() * 9000);
                document.getElementById('reg-id').value = `HAM-${randomNum}`;
            });

            // Formulario de Registro (En el orden solicitado)
            document.getElementById('form-registro').addEventListener('submit', (e) => {
                e.preventDefault();
                this.registrarProducto();
            });

            // Buscador e Invetario Filters
            document.getElementById('input-search-inventario').addEventListener('input', () => this.renderizarTablaInventario());
            document.getElementById('filter-tipo').addEventListener('change', () => this.renderizarTablaInventario());

            // Exportar CSV
            document.getElementById('btn-export-csv').addEventListener('click', () => this.exportarCSV());

            // Botón Imprimir QR
            document.getElementById('btn-imprimir-qr').addEventListener('click', () => this.imprimirEtiquetaQR());

            // Control Escáner
            document.getElementById('btn-start-scanner').addEventListener('click', () => this.iniciarCamaraScanner());
            document.getElementById('btn-stop-scanner').addEventListener('click', () => this.detenerCamaraScanner());

            // Acciones Escáner
            document.getElementById('btn-scan-descontar').addEventListener('click', () => this.descontarStockEscaneado());
            document.getElementById('btn-scan-eliminar').addEventListener('click', () => this.eliminarProductoEscaneado());

            // Modal Editar
            document.getElementById('btn-cancelar-editar').addEventListener('click', () => {
                document.getElementById('modal-editar').classList.remove('active');
            });
            document.getElementById('form-editar').addEventListener('submit', (e) => {
                e.preventDefault();
                this.guardarEdicionProducto();
            });
        },

        /* ---------- Renderizado General ---------- */
        renderizarTodo() {
            this.renderizarKPIs();
            this.renderizarGraficoEmpaques();
            this.renderizarTablaInventario();
            this.renderizarBitacora();
            this.renderizarRecientesDashboard();
        },

        renderizarKPIs() {
            const totalItems = this.inventario.length;
            const totalPiezas = this.inventario.reduce((acc, i) => acc + (parseInt(i.stock_pz, 10) || 0), 0);
            const bodega1 = this.inventario.filter(i => parseInt(i.bodega, 10) === 1).length;
            const bodega2 = this.inventario.filter(i => parseInt(i.bodega, 10) === 2).length;

            document.getElementById('kpi-total-items').textContent = totalItems;
            document.getElementById('kpi-total-piezas').textContent = `${totalPiezas} pz`;
            document.getElementById('kpi-bodega-1').textContent = bodega1;
            document.getElementById('kpi-bodega-2').textContent = bodega2;
        },

        renderizarGraficoEmpaques() {
            const ctx = document.getElementById('chart-empaques');
            if (!ctx) return;

            const bultos = this.inventario.filter(i => i.tipo === 'BULTO').length;
            const paquetes = this.inventario.filter(i => i.tipo === 'PAQUETE').length;
            const rollos = this.inventario.filter(i => i.tipo === 'ROLLO').length;

            if (this.chartInstancia) {
                this.chartInstancia.destroy();
            }

            this.chartInstancia = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Bultos', 'Paquetes', 'Rollos'],
                    datasets: [{
                        data: [bultos, paquetes, rollos],
                        backgroundColor: ['#f59e0b', '#8b5cf6', '#3b82f6'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: '#94a3b8' } }
                    }
                }
            });
        },

        renderizarTablaInventario() {
            const tbody = document.getElementById('tbody-inventario');
            if (!tbody) return;

            const busqueda = document.getElementById('input-search-inventario').value.toLowerCase();
            const filtroTipo = document.getElementById('filter-tipo').value;

            const filtrados = this.inventario.filter(item => {
                const conc = `${item.id} ${item.nombre_producto} ${item.color} ${item.composicion}`.toLowerCase();
                const cumpleBusqueda = conc.includes(busqueda);
                const cumpleTipo = filtroTipo === 'TODOS' || item.tipo === filtroTipo;
                return cumpleBusqueda && cumpleTipo;
            });

            if (filtrados.length === 0) {
                tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:30px; color:#64748b;">No se encontraron registros de inventario.</td></tr>`;
                return;
            }

            tbody.innerHTML = filtrados.map(item => `
                <tr>
                    <td><strong>${item.id}</strong></td>
                    <td>${item.nombre_producto || item.tela}</td>
                    <td>${item.medidas || 'N/A'}</td>
                    <td><span class="badge badge-info">${item.stock_pz || item.metros || 0} pz</span></td>
                    <td>${item.color}</td>
                    <td>${item.composicion}</td>
                    <td><span class="badge badge-type">${item.tipo || item.presentacion}</span></td>
                    <td>Bodega ${item.bodega}</td>
                    <td>
                        <div class="btn-group-sm">
                            <button class="btn-icon" title="Editar" onclick="App.abrirModalEditar('${item.id}')"><i class="ph ph-pencil"></i></button>
                            <button class="btn-icon danger" title="Eliminar" onclick="App.eliminarProducto('${item.id}')"><i class="ph ph-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `).join('');
        },

        renderizarBitacora() {
            const tbody = document.getElementById('tbody-bitacora');
            if (!tbody) return;

            tbody.innerHTML = this.bitacora.map(b => `
                <tr>
                    <td style="font-size:0.85rem; color:#94a3b8;">${b.fecha}</td>
                    <td><strong>${b.usuario}</strong></td>
                    <td><span class="badge">${b.accion}</span></td>
                    <td>${b.bodega}</td>
                    <td>${b.detalle}</td>
                </tr>
            `).join('');
        },

        renderizarRecientesDashboard() {
            const container = document.getElementById('dashboard-recent-list');
            if (!container) return;

            const ultimos = this.bitacora.slice(0, 5);
            container.innerHTML = ultimos.map(b => `
                <div class="recent-item">
                    <i class="ph ph-clock-counter-clock-wise"></i>
                    <div>
                        <strong>${b.accion} - ${b.usuario}</strong>
                        <p>${b.detalle}</p>
                        <small>${b.fecha}</small>
                    </div>
                </div>
            `).join('');
        },

        /* ---------- REGISTRO DE PRODUCTOS EN ORDEN ---------- */
        async registrarProducto() {
            const id = document.getElementById('reg-id').value.trim();
            const nombre = document.getElementById('reg-nombre').value.trim();
            const medidas = document.getElementById('reg-medidas').value.trim();
            const stock = parseInt(document.getElementById('reg-stock').value, 10);
            const color = document.getElementById('reg-color').value.trim();
            const composicion = document.getElementById('reg-composicion').value.trim();
            const tipo = document.getElementById('reg-tipo').value;

            if (!id || !nombre || isNaN(stock) || !color) {
                this.mostrarToast('Por favor completa los campos requeridos', 'warning');
                return;
            }

            const nuevoProducto = {
                id,
                nombre_producto: nombre,
                medidas,
                stock_pz: stock,
                color,
                composicion,
                tipo,
                bodega: this.bodegaActiva,
                fecha: this.obtenerFechaActual(),
                estado: 'Activo'
            };

            // Guardar en backend REST
            try {
                const res = await fetch('/api/productos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(nuevoProducto)
                });

                if (!res.ok) throw new Error('Error guardando en base de datos');

                // Actualizar array local
                const existingIdx = this.inventario.findIndex(i => i.id === id);
                if (existingIdx >= 0) {
                    this.inventario[existingIdx] = nuevoProducto;
                } else {
                    this.inventario.unshift(nuevoProducto);
                }

                this.registrarBitacora('Ingreso de Producto', `Registrado ${nombre} (${stock} pz) - Tipo ${tipo}`);
                this.generarEtiquetaQR(id);
                this.mostrarToast(`Producto ${id} registrado correctamente`, 'success');
                this.renderizarTodo();

            } catch (err) {
                this.mostrarToast('Error al conectar con PostgreSQL', 'danger');
            }
        },

        /* ---------- GENERACIÓN DE QR POR ID ÚNICO ---------- */
        generarEtiquetaQR(idProducto) {
            const box = document.getElementById('qrcode');
            box.innerHTML = '';

            // EL CÓDIGO QR GUARDA ÚNICAMENTE EL STRING DEL ID
            new QRCode(box, {
                text: idProducto,
                width: 140,
                height: 140,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });

            document.getElementById('qr-preview-text').textContent = `Código QR para ID: ${idProducto}`;
            document.getElementById('btn-imprimir-qr').removeAttribute('disabled');
        },

        imprimirEtiquetaQR() {
            const qrCanvas = document.querySelector('#qrcode canvas');
            if (!qrCanvas) {
                this.mostrarToast('Genera un QR antes de imprimir', 'warning');
                return;
            }

            const qrDataUrl = qrCanvas.toDataURL("image/png");
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <html>
                <head>
                    <title>Impresión de Etiqueta QR WMS</title>
                    <style>
                        body { font-family: sans-serif; text-align: center; padding: 20px; }
                        .ticket { border: 2px dashed #000; padding: 15px; display: inline-block; width: 220px; }
                        h3 { margin: 5px 0; font-size: 16px; }
                        p { margin: 3px 0; font-size: 12px; }
                    </style>
                </head>
                <body onload="window.print(); window.close();">
                    <div class="ticket">
                        <h3>H.A.M. POO WMS</h3>
                        <img src="${qrDataUrl}" width="130" />
                        <p><strong>ID:</strong> ${document.getElementById('reg-id').value}</p>
                        <p>${document.getElementById('reg-nombre').value}</p>
                    </div>
                </body>
                </html>
            `);
            printWindow.document.close();
        },

        /* ---------- ESCÁNER QR CON VALIDACIÓN DIRECTA ---------- */
        iniciarCamaraScanner() {
            if (this.html5QrcodeScanner) return;

            const config = { fps: 10, qrbox: { width: 220, height: 220 } };
            this.html5QrcodeScanner = new Html5Qrcode("reader");

            this.html5QrcodeScanner.start(
                { facingMode: "environment" },
                config,
                (decodedText) => this.procesarLecturaQR(decodedText),
                () => {}
            ).then(() => {
                document.getElementById('btn-start-scanner').style.display = 'none';
                document.getElementById('btn-stop-scanner').style.display = 'inline-block';
            }).catch(err => {
                console.error("Error iniciando cámara:", err);
                this.mostrarToast("No se pudo acceder a la cámara", "danger");
            });
        },

        detenerCamaraScanner() {
            if (this.html5QrcodeScanner) {
                this.html5QrcodeScanner.stop().then(() => {
                    this.html5QrcodeScanner.clear();
                    this.html5QrcodeScanner = null;
                    document.getElementById('btn-start-scanner').style.display = 'inline-block';
                    document.getElementById('btn-stop-scanner').style.display = 'none';
                }).catch(err => console.error(err));
            }
        },

        // PROCESAMIENTO Y VALIDACIÓN EN BASE DE DATOS
        async procesarLecturaQR(codigoEscaneado) {
            const cleanId = codigoEscaneado.trim();

            try {
                // Consulta directa a PostgreSQL para verificar existencia real
                const res = await fetch(`/api/productos/${encodeURIComponent(cleanId)}`);

                if (!res.ok) {
                    // SI FUE ELIMINADO MUESTRA ALERTA Y LIMPIA LA PANTALLA
                    this.mostrarToast(`⚠️ El producto (${cleanId}) ha sido ELIMINADO de la Base de Datos.`, 'danger');
                    this.ocultarDetallesEscaneo();
                    return;
                }

                const producto = await res.json();
                this.mostrarDetallesEscaneo(producto);
                this.mostrarToast(`Producto ${producto.id} detectado correctamente`, 'success');

            } catch (err) {
                this.mostrarToast('Error consultando la base de datos', 'danger');
            }
        },

        mostrarDetallesEscaneo(producto) {
            this.productoEscaneadoActual = producto;
            document.getElementById('scanner-empty-state').classList.add('hidden');
            document.getElementById('scanner-details').classList.remove('hidden');

            document.getElementById('scan-title').textContent = producto.id;
            document.getElementById('scan-nombre').textContent = producto.nombre_producto || producto.tela;
            document.getElementById('scan-medidas').textContent = producto.medidas || 'N/A';
            document.getElementById('scan-stock').textContent = `${producto.stock_pz || producto.metros || 0} pz`;
            document.getElementById('scan-color').textContent = producto.color;
            document.getElementById('scan-composicion').textContent = producto.composicion;
            document.getElementById('scan-tipo').textContent = producto.tipo || producto.presentacion;
            document.getElementById('scan-bodega').textContent = `Bodega ${producto.bodega}`;
            document.getElementById('scan-fecha').textContent = producto.fecha;
        },

        ocultarDetallesEscaneo() {
            this.productoEscaneadoActual = null;
            document.getElementById('scanner-details').classList.add('hidden');
            document.getElementById('scanner-empty-state').classList.remove('hidden');
        },

        async descontarStockEscaneado() {
            if (!this.productoEscaneadoActual) return;

            let stockActual = parseInt(this.productoEscaneadoActual.stock_pz, 10);
            if (stockActual <= 0) {
                this.mostrarToast('El producto ya no tiene stock disponible', 'warning');
                return;
            }

            this.productoEscaneadoActual.stock_pz = stockActual - 1;

            try {
                await fetch('/api/productos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.productoEscaneadoActual)
                });

                this.registrarBitacora('Salida de Stock', `Descontada 1 pz de ${this.productoEscaneadoActual.id}. Quedan: ${this.productoEscaneadoActual.stock_pz} pz`);
                this.mostrarDetallesEscaneo(this.productoEscaneadoActual);
                this.mostrarToast('Stock actualizado (-1 pz)', 'success');
                this.cargarDatos();

            } catch (e) {
                this.mostrarToast('Error al actualizar stock', 'danger');
            }
        },

        async eliminarProductoEscaneado() {
            if (!this.productoEscaneadoActual) return;
            const id = this.productoEscaneadoActual.id;
            await this.eliminarProducto(id);
            this.ocultarDetallesEscaneo();
        },

        /* ---------- ELIMINACIÓN DEFINITIVA ---------- */
        async eliminarProducto(id) {
            if (!confirm(`¿Estás seguro de eliminar definitivamente el registro ${id}?`)) return;

            try {
                const res = await fetch(`/api/productos/${encodeURIComponent(id)}`, {
                    method: 'DELETE'
                });

                if (!res.ok) throw new Error('No se pudo eliminar');

                this.inventario = this.inventario.filter(i => i.id !== id);
                this.registrarBitacora('Eliminación de Registro', `Registro ${id} eliminado de PostgreSQL.`);
                this.mostrarToast(`Producto ${id} eliminado correctamente`, 'info');
                this.renderizarTodo();

            } catch (err) {
                this.mostrarToast('Error al eliminar producto', 'danger');
            }
        },

        /* ---------- EDICIÓN ---------- */
        abrirModalEditar(id) {
            const item = this.inventario.find(i => i.id === id);
            if (!item) return;

            document.getElementById('edit-id').value = item.id;
            document.getElementById('edit-nombre').value = item.nombre_producto || item.tela;
            document.getElementById('edit-medidas').value = item.medidas || '';
            document.getElementById('edit-stock').value = item.stock_pz || item.metros || 0;
            document.getElementById('edit-color').value = item.color;
            document.getElementById('edit-composicion').value = item.composicion;
            document.getElementById('edit-tipo').value = item.tipo || 'ROLLO';

            document.getElementById('modal-editar').classList.add('active');
        },

        async guardarEdicionProducto() {
            const id = document.getElementById('edit-id').value;
            const itemOriginal = this.inventario.find(i => i.id === id);

            if (!itemOriginal) return;

            const editado = {
                ...itemOriginal,
                nombre_producto: document.getElementById('edit-nombre').value.trim(),
                medidas: document.getElementById('edit-medidas').value.trim(),
                stock_pz: parseInt(document.getElementById('edit-stock').value, 10),
                color: document.getElementById('edit-color').value.trim(),
                composicion: document.getElementById('edit-composicion').value.trim(),
                tipo: document.getElementById('edit-tipo').value
            };

            try {
                await fetch('/api/productos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(editado)
                });

                document.getElementById('modal-editar').classList.remove('active');
                this.registrarBitacora('Edición de Producto', `Actualizados datos de ${id}`);
                this.mostrarToast(`Registro ${id} actualizado`, 'success');
                this.cargarDatos();

            } catch (e) {
                this.mostrarToast('Error al guardar edición', 'danger');
            }
        },

        /* ---------- BITÁCORA Y EXPORTACIÓN ---------- */
        async registrarBitacora(accion, detalle) {
            const nuevoRegistro = {
                fecha: this.obtenerFechaActual(),
                usuario: this.usuario || 'Sistema',
                accion,
                bodega: `Bodega ${this.bodegaActiva}`,
                detalle
            };

            this.bitacora.unshift(nuevoRegistro);
            this.sincronizarConBackend();
            this.renderizarBitacora();
            this.renderizarRecientesDashboard();
        },

        exportarCSV() {
            if (this.inventario.length === 0) {
                this.mostrarToast('No hay datos para exportar', 'warning');
                return;
            }

            let csv = 'ID,Nombre Producto,Medidas,Stock (Pz),Color,Composición,Tipo,Bodega,Fecha Reg\n';
            this.inventario.forEach(i => {
                csv += `"${i.id}","${i.nombre_producto || i.tela}","${i.medidas || ''}",${i.stock_pz || 0},"${i.color}","${i.composicion}","${i.tipo}","Bodega ${i.bodega}","${i.fecha}"\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Inventario_WMS_Textil_${Date.now()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            this.registrarBitacora('Exportación CSV', 'Inventario descargado en formato CSV');
        },

        mostrarToast(mensaje, tipo = 'info') {
            const container = document.getElementById('toast-container');
            if (!container) return;

            const toast = document.createElement('div');
            toast.className = `toast toast-${tipo}`;
            toast.innerHTML = `<span>${mensaje}</span>`;
            container.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }, 3500);
        }
    };

    window.App = App;
    document.addEventListener('DOMContentLoaded', () => App.init());
})();