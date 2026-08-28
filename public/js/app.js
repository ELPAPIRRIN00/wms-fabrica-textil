/**
 * =========================================================
 * 🧠 H.A.M. POO - WMS Textil (v2.0)
 * Lógica Principal Frontend (Integrado con PostgreSQL & Real-Time Sync)
 * =========================================================
 */

(function () {
    'use strict';

    const App = {
        usuario: null,
        rol: null,
        vistaActual: 'dashboard',
        chartInstancia: null,
        productoEscaneadoActual: null,
        productoQRActual: null,
        html5QrcodeScanner: null,
        ultimoQrEscaneado: null,
        ultimoQrTiempo: 0,
        inventario: [],
        bitacora: [],
        useBackend: true,
        pollingInterval: null,
        gruposAbiertos: {},
        storageKeys: {
            inventario: 'ham_wms_inventario_general',
            bitacora: 'ham_wms_bitacora_general'
        },

        cuentas: {
            admin: { password: '1234', nombre: 'Administrador' },
            operador: { password: '1234', nombre: 'Operador' }
        },

        /* ---------- Inicialización ---------- */
        async init() {
            this.iniciarReloj();
            this.configurarNavegacion();
            this.configurarEventos();
            this.verificarSesion();
            try {
                await this.cargarDatos();
                this.iniciarPolling();
            } catch (err) {
                console.error('Error al inicializar datos:', err);
            }
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

        iniciarPolling() {
            if (this.pollingInterval) clearInterval(this.pollingInterval);
            this.pollingInterval = setInterval(() => {
                const modalEditarActivo = document.getElementById('modal-editar')?.classList.contains('active');
                const modalQRActivo = document.getElementById('modal-qr-detalle')?.classList.contains('active');
                // Sincronización continua en segundo plano cada 4 segundos si el usuario no está editando
                if (this.useBackend && !modalEditarActivo && !modalQRActivo) {
                    this.cargarDatos(true);
                }
            }, 4000);
        },

        obtenerFechaActual() {
            return new Date().toLocaleString('es-MX', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
        },

        /* ---------- Conexión con Backend REST ---------- */
        async cargarDatos(silent = false) {
            try {
                const timestamp = Date.now();
                const [resInv, resBit] = await Promise.all([
                    fetch(`/api/productos?t=${timestamp}`),
                    fetch(`/api/bitacora?t=${timestamp}`)
                ]);
                if (!resInv.ok || !resBit.ok) throw new Error('API no disponible');

                const inventario = await resInv.json();
                const bitacora = await resBit.json();
                if (!Array.isArray(inventario) || !Array.isArray(bitacora)) {
                    throw new Error('Respuesta inválida de la API');
                }

                this.inventario = inventario.map(item => this.normalizarProducto(item));
                this.bitacora = bitacora;
                this.guardarRespaldoLocal();
                this.poblarFamiliasProducto();

                this.useBackend = true;
                this.actualizarStatusBadge(true);
            } catch (err) {
                if (!silent) {
                    console.warn('Servidor offline o sin conexión. Usando respaldo local.', err.message);
                    this.useBackend = false;
                    this.cargarRespaldoLocal();
                    this.actualizarStatusBadge(false);
                }
            }

            this.renderizarTodo();
        },

        poblarFamiliasProducto() {
            const selector = document.getElementById('reg-producto-existente');
            if (!selector) return;

            const actual = selector.value;
            const familias = [...new Set(this.productosActivos()
                .map(item => item.nombre_producto || item.tela)
                .filter(Boolean))]
                .sort((a, b) => a.localeCompare(b, 'es'));

            selector.innerHTML = '<option value="">+ Registrar nueva familia...</option>';
            familias.forEach(familia => {
                const option = document.createElement('option');
                option.value = familia;
                option.textContent = familia;
                selector.appendChild(option);
            });
            selector.value = familias.includes(actual) ? actual : '';
        },

        normalizarProducto(item) {
            return {
                ...item,
                id: String(item.id || '').trim(),
                nombre_producto: String(item.nombre_producto || item.tela || '').trim(),
                medidas: String(item.medidas || 'N/A').trim(),
                stock_pz: Math.max(0, parseInt(item.stock_pz ?? item.metros ?? 0, 10) || 0),
                color: String(item.color || '').trim(),
                composicion: String(item.composicion || '').trim(),
                tipo: String(item.tipo || item.presentacion || 'ROLLO').toUpperCase(),
                estado: item.estado || 'Activo'
            };
        },

        cargarRespaldoLocal() {
            const leer = (key) => {
                try {
                    const valor = JSON.parse(localStorage.getItem(key) || '[]');
                    return Array.isArray(valor) ? valor : [];
                } catch (error) {
                    return [];
                }
            };

            this.inventario = leer(this.storageKeys.inventario);

            try {
                const bitacora = JSON.parse(localStorage.getItem(this.storageKeys.bitacora) || '[]');
                this.bitacora = Array.isArray(bitacora) ? bitacora : [];
            } catch (error) {
                this.bitacora = [];
            }
        },

        guardarRespaldoLocal() {
            localStorage.setItem(this.storageKeys.inventario, JSON.stringify(this.inventario));
            localStorage.setItem(this.storageKeys.bitacora, JSON.stringify(this.bitacora));
        },

        productosActivos() {
            return this.inventario.filter(item => item.estado !== 'Merma/Defecto');
        },

        actualizarStatusBadge(online) {
            const badge = document.getElementById('backend-status-badge');
            if (!badge) return;
            if (online) {
                badge.className = 'badge badge-success';
                badge.innerHTML = '<i class="ph ph-circle-wavy-check"></i> PostgreSQL Conectado';
            } else {
                badge.className = 'badge badge-warning';
                badge.innerHTML = '<i class="ph ph-warning"></i> Modo Local (Sin Conexión DB)';
            }
        },

        /* ---------- Autenticación ---------- */
        verificarSesion() {
            const sesionGuardada = localStorage.getItem('ham_wms_session');
            if (sesionGuardada) {
                try {
                    const data = JSON.parse(sesionGuardada);
                    if (data.usuario && data.rol) {
                        this.usuario = data.usuario;
                        this.rol = data.rol;
                        document.getElementById('login-modal')?.classList.remove('active');
                        this.mostrarAppShell();
                        return;
                    }
                } catch (error) {
                    localStorage.removeItem('ham_wms_session');
                }
            }
            document.getElementById('login-modal').classList.add('active');
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
            const dashboardButton = document.querySelector('[data-target="dashboard"]');
            const exportButton = document.getElementById('btn-export-csv');
            const operador = this.rol === 'Operador';
            if (dashboardButton) dashboardButton.hidden = operador;
            if (exportButton) exportButton.hidden = operador;

            if (operador && this.vistaActual === 'dashboard') {
                this.vistaActual = 'inventario';
                document.querySelectorAll('.vista-page').forEach(page => page.classList.remove('active'));
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                
                const targetPage = document.getElementById('vista-inventario');
                const targetBtn = document.querySelector('[data-target="inventario"]');
                if (targetPage) targetPage.classList.add('active');
                if (targetBtn) targetBtn.classList.add('active');
            }

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
                    this.cerrarMenuMovil();
                });
            });

            document.getElementById('btn-mobile-menu')?.addEventListener('click', () => {
                document.body.classList.toggle('mobile-menu-open');
            });
            document.getElementById('btn-mobile-user')?.addEventListener('click', () => {
                document.body.classList.add('mobile-menu-open');
            });
            document.getElementById('mobile-backdrop')?.addEventListener('click', () => this.cerrarMenuMovil());
            window.addEventListener('resize', () => {
                if (window.innerWidth > 768) this.cerrarMenuMovil();
            });
        },

        cerrarMenuMovil() {
            document.body.classList.remove('mobile-menu-open');
        },

        /* ---------- Configuración de Eventos ---------- */
        configurarEventos() {
            // Formulario Login
            document.getElementById('form-login')?.addEventListener('submit', (e) => {
                e.preventDefault();
                const user = document.getElementById('login-usuario')?.value || 'admin';
                const pass = document.getElementById('login-pass')?.value || '1234';
                this.iniciarSesion(user, pass);
            });

            // Logout
            document.getElementById('btn-logout')?.addEventListener('click', () => this.cerrarSesion());

            document.getElementById('reg-producto-existente')?.addEventListener('change', (e) => {
                if (!e.target.value) return;
                const producto = this.productosActivos().find(item =>
                    (item.nombre_producto || item.tela) === e.target.value
                );
                const inputNombre = document.getElementById('reg-nombre');
                if (inputNombre) inputNombre.value = e.target.value;
                if (producto) {
                    const elMedidas = document.getElementById('reg-medidas');
                    if (elMedidas) elMedidas.value = producto.medidas || '';
                    const elColor = document.getElementById('reg-color');
                    if (elColor) elColor.value = producto.color || '';
                    const elComp = document.getElementById('reg-composicion');
                    if (elComp) elComp.value = producto.composicion || '';
                    const elTipo = document.getElementById('reg-tipo');
                    if (elTipo) elTipo.value = producto.tipo || 'ROLLO';
                }
            });

            // Generar ID Aleatorio
            document.getElementById('btn-gen-id')?.addEventListener('click', () => {
                const randomNum = Math.floor(1000 + Math.random() * 9000);
                const elRegId = document.getElementById('reg-id');
                if (elRegId) elRegId.value = `HAM-${randomNum}`;
            });

            // Formulario de Registro
            document.getElementById('form-registro')?.addEventListener('submit', (e) => {
                e.preventDefault();
                this.registrarProducto();
            });

            // Buscador e Invetario Filters
            document.getElementById('input-search-inventario')?.addEventListener('input', () => this.renderizarTablaInventario());
            document.getElementById('filter-tipo')?.addEventListener('change', () => this.renderizarTablaInventario());

            document.getElementById('tbody-inventario')?.addEventListener('click', (e) => {
                const button = e.target.closest('[data-action][data-id]');
                if (button) {
                    const id = button.dataset.id;
                    if (button.dataset.action === 'qr') this.abrirDetalleQR(id);
                    if (button.dataset.action === 'edit') this.abrirModalEditar(id);
                    if (button.dataset.action === 'delete') this.eliminarProducto(id);
                }

                const deleteTypeBtn = e.target.closest('[data-action="delete-type"]');
                if (deleteTypeBtn) {
                    this.abrirModalEliminarTipo(deleteTypeBtn.dataset.name, deleteTypeBtn.dataset.count);
                    e.stopPropagation();
                    return;
                }
                const groupButton = e.target.closest('[data-group]');
                if (!groupButton) return;
                const grupo = groupButton.dataset.group;
                this.gruposAbiertos[grupo] = !(this.gruposAbiertos[grupo] !== false);
                this.renderizarTablaInventario();
            });

            // Exportar CSV
            document.getElementById('btn-export-csv')?.addEventListener('click', () => this.exportarCSV());

            // Botón Imprimir QR
            document.getElementById('btn-imprimir-qr')?.addEventListener('click', () => this.imprimirEtiquetaQR());
            document.getElementById('btn-cerrar-qr-detalle')?.addEventListener('click', () => {
                document.getElementById('modal-qr-detalle')?.classList.remove('active');
            });
            document.getElementById('btn-descargar-qr-detalle')?.addEventListener('click', () => this.descargarQRDetalle());
            document.getElementById('btn-imprimir-qr-detalle')?.addEventListener('click', () => this.imprimirQRDetalle());

            // Control Escáner
            document.getElementById('btn-start-scanner')?.addEventListener('click', () => this.iniciarCamaraScanner());
            document.getElementById('btn-stop-scanner')?.addEventListener('click', () => this.detenerCamaraScanner());

            // Acciones Escáner
            document.getElementById('btn-scan-descontar')?.addEventListener('click', () => this.descontarStockEscaneado());
            document.getElementById('btn-scan-eliminar')?.addEventListener('click', () => this.eliminarProductoEscaneado());

            // Búsqueda Manual por ID QR
            const btnManualScan = document.getElementById('btn-manual-scan');
            const inputManualScan = document.getElementById('input-manual-scan');
            const ejecutarManualScan = () => {
                const val = inputManualScan?.value?.trim();
                if (!val) {
                    this.mostrarToast('Ingresa un ID de producto para consultar.', 'warning');
                    return;
                }
                this.procesarLecturaQR(val);
            };
            btnManualScan?.addEventListener('click', ejecutarManualScan);
            inputManualScan?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    ejecutarManualScan();
                }
            });

            // Modal Continuidad Post-Salida (Escanear Otro QR)
            document.getElementById('btn-modal-escanear-otro')?.addEventListener('click', () => {
                document.getElementById('modal-escanear-otro')?.classList.remove('active');
                const inputManual = document.getElementById('input-manual-scan');
                if (inputManual) inputManual.value = '';
                this.ocultarDetallesEscaneo();
                this.ultimoQrEscaneado = null;
                this.ultimoQrTiempo = 0;
                if (this.html5QrcodeScanner) {
                    try {
                        this.html5QrcodeScanner.resume();
                    } catch (e) {
                        this.iniciarCamaraScanner();
                    }
                } else {
                    this.iniciarCamaraScanner();
                }
                this.mostrarToast('Lector listo para escanear el siguiente código QR.', 'info');
            });

            document.getElementById('btn-modal-ver-inventario')?.addEventListener('click', () => {
                document.getElementById('modal-escanear-otro')?.classList.remove('active');
                this.ocultarDetallesEscaneo();
                const navInv = document.querySelector('[data-target="inventario"]');
                if (navInv) navInv.click();
            });

            // Modal Editar
            document.getElementById('btn-cancelar-editar')?.addEventListener('click', () => {
                document.getElementById('modal-editar')?.classList.remove('active');
            });
            document.getElementById('form-editar')?.addEventListener('submit', (e) => {
                e.preventDefault();
                this.guardarEdicionProducto();
            });

            // Modal Eliminar Familia
            document.getElementById('btn-cancelar-delete-type')?.addEventListener('click', () => {
                document.getElementById('modal-confirm-delete-type').classList.remove('active');
            });
            document.getElementById('form-delete-type')?.addEventListener('submit', (e) => {
                e.preventDefault();
                this.eliminarTipoProducto();
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
            const activos = this.inventario.filter(i => i.estado !== 'Merma/Defecto');
            const totalItems = activos.length;
            const totalPiezas = activos.reduce((acc, i) => acc + (parseInt(i.stock_pz, 10) || 0), 0);
            const rollos = activos.filter(i => i.tipo === 'ROLLO' || i.tipo === 'BULTO').length;
            const empaques = activos.filter(i => i.tipo === 'PAQUETE').length;

            const elTotalItems = document.getElementById('kpi-total-items');
            if (elTotalItems) elTotalItems.textContent = totalItems;

            const elTotalPiezas = document.getElementById('kpi-total-piezas');
            if (elTotalPiezas) elTotalPiezas.textContent = `${totalPiezas} pz`;

            const elRollos = document.getElementById('kpi-rollos');
            if (elRollos) elRollos.textContent = rollos;

            const elEmpaques = document.getElementById('kpi-empaques');
            if (elEmpaques) elEmpaques.textContent = empaques;
        },

        renderizarGraficoEmpaques() {
            const ctx = document.getElementById('chart-empaques');
            if (!ctx) return;

            if (typeof Chart === 'undefined') {
                ctx.parentElement.innerHTML = '<p class="empty-state">Gráfico no disponible sin conexión a la biblioteca visual.</p>';
                return;
            }

            const productos = this.productosActivos();
            const bultos = productos.filter(i => i.tipo === 'BULTO').length;
            const paquetes = productos.filter(i => i.tipo === 'PAQUETE').length;
            const rollos = productos.filter(i => i.tipo === 'ROLLO').length;

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
                        legend: { position: 'bottom', labels: { color: '#1e293b' } }
                    }
                }
            });
        },

        renderizarTablaInventario() {
            const tbody = document.getElementById('tbody-inventario');
            if (!tbody) return;

            const busqueda = document.getElementById('input-search-inventario').value.toLowerCase();
            const filtroTipo = document.getElementById('filter-tipo').value;

            const filtrados = this.productosActivos().filter(item => {
                const conc = `${item.id} ${item.nombre_producto} ${item.color} ${item.composicion}`.toLowerCase();
                const cumpleBusqueda = conc.includes(busqueda);
                const cumpleTipo = filtroTipo === 'TODOS' || item.tipo === filtroTipo;
                return cumpleBusqueda && cumpleTipo;
            });

            if (filtrados.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#64748b;">No se encontraron registros de inventario.</td></tr>`;
                return;
            }

            const grupos = filtrados.reduce((resultado, item) => {
                const nombre = item.nombre_producto || item.tela || 'Sin familia';
                if (!resultado[nombre]) resultado[nombre] = [];
                resultado[nombre].push(item);
                return resultado;
            }, {});

            tbody.innerHTML = Object.entries(grupos).map(([nombre, items]) => {
                const abierto = this.gruposAbiertos[nombre] !== false;
                const totalStock = items.reduce((total, item) => total + (Number(item.stock_pz) || 0), 0);
                const filas = abierto ? items.map(item => {
                const accionesAdmin = this.rol === 'Administrador' ? `
                    <button class="btn-icon" title="Ver QR" data-action="qr" data-id="${item.id}"><i class="ph ph-qr-code"></i></button>
                    <button class="btn-icon" title="Editar" data-action="edit" data-id="${item.id}"><i class="ph ph-pencil"></i></button>
                    <button class="btn-icon danger" title="Eliminar" data-action="delete" data-id="${item.id}"><i class="ph ph-trash"></i></button>
                ` : '<button class="btn-icon" title="Ver QR" data-action="qr" data-id="' + item.id + '"><i class="ph ph-qr-code"></i></button>';

                return `
                <tr class="inventory-product-row">
                    <td><strong>${item.id}</strong></td>
                    <td>${item.nombre_producto || item.tela}</td>
                    <td>${item.medidas || 'N/A'}</td>
                    <td><span class="badge badge-info">${item.stock_pz || item.metros || 0} pz</span></td>
                    <td>${item.color}</td>
                    <td>${item.composicion}</td>
                    <td><span class="badge badge-type">${item.tipo || item.presentacion}</span></td>
                    <td>
                        <div class="btn-group-sm">
                            ${accionesAdmin}
                        </div>
                    </td>
                </tr>
                `;
                }).join('') : '';

                const accionesFamiliaAdmin = this.rol === 'Administrador' ? `
                    <button type="button" class="btn btn-danger btn-sm" data-action="delete-type" data-name="${nombre}" data-count="${items.length}" title="Eliminar familia completa" style="float: right; margin-top: -4px;">
                        <i class="ph ph-trash"></i> Eliminar Familia
                    </button>
                ` : '';

                return `
                    <tr class="inventory-group-row">
                        <td colspan="8" style="position: relative;">
                            <button type="button" class="inventory-group-toggle" data-group="${nombre}" aria-expanded="${abierto}" style="display:inline-block; border: none; background: transparent; cursor: pointer; text-align: left; width: 100%;">
                                <i class="ph ph-caret-${abierto ? 'down' : 'right'}"></i>
                                <strong>${nombre}</strong>
                                <span class="group-summary">${items.length} pieza(s) | Stock total: ${totalStock} pz</span>
                            </button>
                            ${accionesFamiliaAdmin}
                        </td>
                    </tr>
                    ${filas}
                `;
            }).join('');
        },

        renderizarBitacora() {
            const tbody = document.getElementById('tbody-bitacora');
            if (!tbody) return;

            tbody.innerHTML = this.bitacora.map(b => `
                <tr>
                    <td style="font-size:0.85rem; color:#94a3b8;">${b.fecha}</td>
                    <td><strong>${b.usuario}</strong></td>
                    <td><span class="badge">${b.accion}</span></td>
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

        /* ---------- REGISTRO DE PRODUCTOS EN POSTGRESQL ---------- */
        async registrarProducto() {
            const id = document.getElementById('reg-id').value.trim();
            const nombre = document.getElementById('reg-nombre').value.trim();
            const medidas = document.getElementById('reg-medidas').value.trim();
            const stock = parseInt(document.getElementById('reg-stock').value, 10);
            const cantidad = parseInt(document.getElementById('reg-cantidad').value, 10);
            const color = document.getElementById('reg-color').value.trim();
            const composicion = document.getElementById('reg-composicion').value.trim();
            const tipo = document.getElementById('reg-tipo').value;

            if (!id || !nombre || !medidas || isNaN(stock) || stock < 1 || isNaN(cantidad) || cantidad < 1 || cantidad > 1000 || !color || !composicion) {
                this.mostrarToast('Por favor completa todos los campos requeridos', 'warning');
                return;
            }

            const productos = Array.from({ length: cantidad }, (_, indice) => ({
                id: cantidad === 1 ? id : `${id}-${String(indice + 1).padStart(3, '0')}`,
                nombre_producto: nombre,
                medidas,
                stock_pz: stock,
                color,
                composicion,
                tipo,
                fecha: this.obtenerFechaActual(),
                estado: 'Activo'
            }));

            if (productos.some(producto => this.inventario.some(item => item.id === producto.id && item.estado !== 'Merma/Defecto'))) {
                this.mostrarToast('Uno de los IDs ya existe en el inventario activo.', 'warning');
                return;
            }

            try {
                for (const producto of productos) {
                    const res = await fetch('/api/productos', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(producto)
                    });
                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        throw new Error(errData.message || `Error HTTP ${res.status} guardando en servidor`);
                    }
                }

                await this.registrarBitacora('Ingreso de Producto', `Registradas ${cantidad} pieza(s) de ${nombre} (${stock} pz c/u) - Tipo ${tipo}`);
                this.generarEtiquetasQR(productos);
                this.mostrarToast(`${cantidad} producto(s) guardado(s) en PostgreSQL correctamente`, 'success');

                // Limpiar formulario excepto familia de producto
                document.getElementById('reg-id').value = '';
                document.getElementById('reg-nombre').value = '';
                document.getElementById('reg-medidas').value = '';
                document.getElementById('reg-stock').value = '';
                document.getElementById('reg-color').value = '';
                document.getElementById('reg-composicion').value = '';

                // Recargar datos desde la DB inmediatamente
                await this.cargarDatos();

            } catch (err) {
                console.error('Error al registrar producto:', err);
                this.mostrarToast(`❌ No se pudo guardar en PostgreSQL: ${err.message}`, 'danger');
            }
        },

        /* ---------- GENERACIÓN DE QR POR ID ÚNICO ---------- */
        generarEtiquetaQR(idProducto) {
            const box = document.getElementById('qrcode');
            if (!box || typeof QRCode === 'undefined') {
                this.mostrarToast('No se pudo cargar el generador de códigos QR.', 'danger');
                return;
            }
            box.innerHTML = '';

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

        generarEtiquetasQR(productos) {
            if (typeof QRCode === 'undefined') {
                this.mostrarToast('No se cargó la biblioteca de códigos QR.', 'danger');
                return;
            }
            const primerProducto = productos[0];
            this.generarEtiquetaQR(primerProducto.id);
            const printArea = document.getElementById('print-area');
            if (!printArea) return;
            printArea.innerHTML = '';

            productos.forEach(producto => {
                const temp = document.createElement('div');
                temp.style.position = 'fixed';
                temp.style.left = '-10000px';
                document.body.appendChild(temp);
                new QRCode(temp, {
                    text: producto.id,
                    width: 220,
                    height: 220,
                    colorDark: '#111827',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.H
                });
                const image = temp.querySelector('img');
                const canvas = temp.querySelector('canvas');
                const source = image?.src || canvas?.toDataURL('image/png');
                if (source) {
                    printArea.insertAdjacentHTML('beforeend', `<section class="print-label"><h2>H.A.M. POO WMS</h2><h3>${producto.nombre_producto}</h3><img src="${source}" alt="QR ${producto.id}"><p><strong>${producto.id}</strong></p><p>${producto.tipo}</p></section>`);
                }
                temp.remove();
            });
        },

        abrirDetalleQR(id) {
            const producto = this.inventario.find(item => item.id === id);
            if (!producto) {
                this.mostrarToast('No se encontró el producto para generar su QR.', 'warning');
                return;
            }
            if (typeof QRCode === 'undefined') {
                this.mostrarToast('No se cargó la biblioteca de códigos QR.', 'danger');
                return;
            }

            this.productoQRActual = producto;
            const container = document.getElementById('qr-detail-code');
            container.innerHTML = '';
            new QRCode(container, {
                text: producto.id,
                width: 190,
                height: 190,
                colorDark: '#111827',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
            document.getElementById('qr-detail-title').textContent = producto.nombre_producto || producto.tela || producto.id;
            document.getElementById('qr-detail-id').textContent = producto.id;
            document.getElementById('qr-detail-meta').innerHTML = `
                <span><strong>Stock:</strong> ${producto.stock_pz ?? producto.metros ?? 0} pz</span>
                <span><strong>Color:</strong> ${producto.color || 'N/A'}</span>
                <span><strong>Tipo:</strong> ${producto.tipo || producto.presentacion || 'N/A'}</span>
            `;
            document.getElementById('modal-qr-detalle').classList.add('active');
        },

        descargarQRDetalle() {
            if (!this.productoQRActual) return;
            const dataUrl = this.obtenerDatosQR('#qr-detail-code');
            if (!dataUrl) {
                this.mostrarToast('El QR todavía no está listo.', 'warning');
                return;
            }
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `QR_${this.productoQRActual.id}.png`;
            document.body.appendChild(link);
            link.click();
            link.remove();
        },

        imprimirQRDetalle() {
            if (!this.productoQRActual) return;
            const dataUrl = this.obtenerDatosQR('#qr-detail-code');
            if (!dataUrl) {
                this.mostrarToast('El QR todavía no está listo.', 'warning');
                return;
            }
            const producto = this.productoQRActual;
            const printArea = document.getElementById('print-area');
            printArea.innerHTML = `<section class="print-label"><h2>H.A.M. POO WMS</h2><h3>${producto.nombre_producto || producto.tela || producto.id}</h3><img src="${dataUrl}" alt="QR ${producto.id}"><p><strong>${producto.id}</strong></p></section>`;
            window.print();
        },

        obtenerDatosQR(selector) {
            const container = document.querySelector(selector);
            if (!container) return null;
            const canvas = container.querySelector('canvas');
            if (canvas) return canvas.toDataURL('image/png');
            const image = container.querySelector('img');
            return image?.src || null;
        },

        imprimirEtiquetaQR() {
            const printArea = document.getElementById('print-area');
            if (!printArea || !printArea.querySelector('.print-label')) {
                this.mostrarToast('Genera un QR antes de imprimir', 'warning');
                return;
            }
            window.print();
        },

        /* ---------- ESCÁNER QR CON VALIDACIÓN DIRECTA ---------- */
        iniciarCamaraScanner() {
            if (this.html5QrcodeScanner) return;

            if (typeof Html5Qrcode === 'undefined') {
                this.mostrarToast('El lector QR no está disponible sin conexión.', 'warning');
                return;
            }

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

        async procesarLecturaQR(codigoEscaneado) {
            const cleanId = String(codigoEscaneado || '').trim();
            if (!cleanId) return;

            // Evitar duplicados por escaneo en bucle continuo de cámara
            if (this.ultimoQrEscaneado === cleanId && (Date.now() - (this.ultimoQrTiempo || 0)) < 3500) {
                return;
            }

            this.ultimoQrEscaneado = cleanId;
            this.ultimoQrTiempo = Date.now();

            // Pausar lectura de la cámara al detectar un QR
            if (this.html5QrcodeScanner) {
                try { this.html5QrcodeScanner.pause(true); } catch (e) {}
            }

            try {
                let producto = null;
                if (this.useBackend) {
                    const res = await fetch(`/api/productos/${encodeURIComponent(cleanId)}`);
                    if (res.ok) {
                        producto = await res.json();
                    }
                }

                if (!producto) {
                    producto = this.inventario.find(i => String(i.id).toLowerCase() === cleanId.toLowerCase());
                }

                if (!producto) {
                    this.mostrarToast(`⚠️ El código QR (${cleanId}) no fue encontrado en la Base de Datos.`, 'danger');
                    this.ocultarDetallesEscaneo();
                    if (this.html5QrcodeScanner) {
                        try { this.html5QrcodeScanner.resume(); } catch (e) {}
                    }
                    return;
                }

                if (producto.estado === 'Salida' || (parseInt(producto.stock_pz, 10) || 0) <= 0) {
                    this.mostrarToast(`⚠️ La pieza (${cleanId}) ya fue procesada como SALIDA previamente.`, 'warning');
                    this.mostrarDetallesEscaneo(producto);
                    return;
                }

                if (producto.estado === 'Merma/Defecto') {
                    this.mostrarToast(`⚠️ La pieza (${cleanId}) se encuentra en estado MERMA/DEFECTO.`, 'danger');
                    this.ocultarDetallesEscaneo();
                    if (this.html5QrcodeScanner) {
                        try { this.html5QrcodeScanner.resume(); } catch (e) {}
                    }
                    return;
                }

                this.mostrarDetallesEscaneo(producto);
                this.mostrarToast(`Pieza ${producto.id} identificada correctamente`, 'success');

            } catch (err) {
                console.error("Error consultando la base de datos:", err);
                const localMatch = this.inventario.find(i => String(i.id).toLowerCase() === cleanId.toLowerCase());
                if (localMatch) {
                    this.mostrarDetallesEscaneo(localMatch);
                    this.mostrarToast(`Pieza ${localMatch.id} identificada (Modo Local)`, 'success');
                } else {
                    this.mostrarToast('Error consultando la base de datos', 'danger');
                }
            }
        },

        mostrarDetallesEscaneo(producto) {
            this.productoEscaneadoActual = producto;
            document.getElementById('scanner-empty-state')?.classList.add('hidden');
            document.getElementById('scanner-details')?.classList.remove('hidden');

            const stockPz = parseInt(producto.stock_pz, 10);
            const stockVal = isNaN(stockPz) ? parseInt(producto.metros || 0, 10) : stockPz;

            document.getElementById('scan-title').textContent = producto.id;
            document.getElementById('scan-nombre').textContent = producto.nombre_producto || producto.tela || 'N/A';
            document.getElementById('scan-medidas').textContent = producto.medidas || 'N/A';
            document.getElementById('scan-stock').textContent = `${stockVal} pz`;
            document.getElementById('scan-color').textContent = producto.color || 'N/A';
            document.getElementById('scan-composicion').textContent = producto.composicion || 'N/A';
            document.getElementById('scan-tipo').textContent = producto.tipo || producto.presentacion || 'N/A';
            document.getElementById('scan-fecha').textContent = producto.fecha || 'N/A';

            // Ajustar estado visual según stock
            const badgeStatus = document.getElementById('scan-status');
            const btnDescontar = document.getElementById('btn-scan-descontar');

            if (badgeStatus) {
                if (producto.estado === 'Salida' || stockVal <= 0) {
                    badgeStatus.className = 'badge badge-danger';
                    badgeStatus.textContent = 'PROCESADA (SALIDA REALIZADA)';
                    if (btnDescontar) {
                        btnDescontar.disabled = true;
                        btnDescontar.innerHTML = '<i class="ph ph-check-circle"></i> Salida ya registrada';
                    }
                } else {
                    badgeStatus.className = 'badge badge-success';
                    badgeStatus.textContent = 'DISPONIBLE EN BODEGA';
                    if (btnDescontar) {
                        btnDescontar.disabled = false;
                        btnDescontar.innerHTML = '<i class="ph ph-box-arrow-up"></i> Registrar Salida de esta Pieza';
                    }
                }
            }

            // Visibilidad de botón Eliminar Registro (Solo Administrador)
            const btnEliminar = document.getElementById('btn-scan-eliminar');
            if (btnEliminar) {
                btnEliminar.style.display = this.rol === 'Administrador' ? 'inline-block' : 'none';
            }
        },

        ocultarDetallesEscaneo() {
            this.productoEscaneadoActual = null;
            document.getElementById('scanner-details')?.classList.add('hidden');
            document.getElementById('scanner-empty-state')?.classList.remove('hidden');
        },

        async descontarStockEscaneado() {
            if (!this.productoEscaneadoActual) {
                this.mostrarToast('No hay ninguna pieza escaneada.', 'warning');
                return;
            }

            if (this.rol !== 'Administrador' && this.rol !== 'Operador') {
                this.mostrarToast('No tienes permisos para registrar salidas.', 'warning');
                return;
            }

            const idEscaneado = this.productoEscaneadoActual.id;
            const nombrePieza = this.productoEscaneadoActual.nombre_producto || this.productoEscaneadoActual.tela || idEscaneado;
            let stockActual = parseInt(this.productoEscaneadoActual.stock_pz, 10);
            if (isNaN(stockActual)) stockActual = parseInt(this.productoEscaneadoActual.metros || 0, 10);

            if (this.productoEscaneadoActual.estado === 'Salida' || stockActual <= 0) {
                this.mostrarToast(`La pieza ${idEscaneado} ya fue procesada como salida previamente.`, 'warning');
                return;
            }

            // Registrar la salida de esta pieza única (stock 0, estado Salida)
            const productoActualizado = {
                ...this.productoEscaneadoActual,
                stock_pz: 0,
                estado: 'Salida'
            };

            try {
                if (this.useBackend) {
                    const res = await fetch('/api/productos', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(productoActualizado)
                    });
                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        throw new Error(errData.message || 'No se pudo registrar la salida de la pieza');
                    }
                } else {
                    const idx = this.inventario.findIndex(i => i.id === productoActualizado.id);
                    if (idx !== -1) {
                        this.inventario[idx] = productoActualizado;
                    }
                    this.guardarRespaldoLocal();
                }

                await this.registrarBitacora('Salida de Producto (QR)', `Pieza ${idEscaneado} (${nombrePieza}): Salida procesada por ${this.usuario || 'Usuario'}.`);
                await this.cargarDatos();

                // Ocultar detalles del escáner
                this.ocultarDetallesEscaneo();

                // Abrir modal de confirmación post-salida ("¿Deseas escanear otro QR?")
                const modalMsg = document.getElementById('modal-escanear-otro-msg');
                if (modalMsg) {
                    modalMsg.textContent = `Salida de la pieza ${idEscaneado} (${nombrePieza}) registrada con éxito.`;
                }

                const modalOtro = document.getElementById('modal-escanear-otro');
                if (modalOtro) modalOtro.classList.add('active');

            } catch (e) {
                this.mostrarToast(`❌ Error al registrar salida: ${e.message}`, 'danger');
            }
        },

        async eliminarProductoEscaneado() {
            if (!this.productoEscaneadoActual) return;
            const id = this.productoEscaneadoActual.id;
            await this.eliminarProducto(id);
            this.ocultarDetallesEscaneo();
        },

        /* ---------- ELIMINACIÓN DE PRODUCTO ---------- */
        async eliminarProducto(id) {
            if (this.rol !== 'Administrador') {
                this.mostrarToast('Solo el administrador puede eliminar registros.', 'warning');
                return;
            }
            const motivo = window.prompt(`Indica el motivo de baja por merma/defecto para ${id}:`);
            if (!motivo || !motivo.trim()) {
                this.mostrarToast('La baja requiere un motivo obligatorio.', 'warning');
                return;
            }

            try {
                const res = await fetch(`/api/productos/${encodeURIComponent(id)}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ motivo: motivo.trim(), usuario: this.usuario })
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.message || 'No se pudo eliminar');
                }

                await this.registrarBitacora('Baja por merma/defecto', `${id}: ${motivo.trim()}`);
                this.mostrarToast(`Producto ${id} dado de baja correctamente`, 'success');

                await this.cargarDatos();

            } catch (err) {
                this.mostrarToast(`❌ Error al dar de baja en PostgreSQL: ${err.message}`, 'danger');
            }
        },

        /* ---------- ELIMINACIÓN DE TIPO / FAMILIA ---------- */
        abrirModalEliminarTipo(nombre, count) {
            if (this.rol !== 'Administrador') {
                this.mostrarToast('Solo el administrador puede eliminar familias.', 'warning');
                return;
            }
            document.getElementById('delete-type-name').textContent = nombre;
            document.getElementById('delete-type-count').textContent = count;
            document.getElementById('delete-type-hidden-name').value = nombre;
            document.getElementById('delete-type-motivo').value = '';
            document.getElementById('modal-confirm-delete-type').classList.add('active');
        },

        async eliminarTipoProducto() {
            if (this.rol !== 'Administrador') return;
            const nombre = document.getElementById('delete-type-hidden-name').value;
            const motivo = document.getElementById('delete-type-motivo').value.trim();

            if (!motivo) {
                this.mostrarToast('El motivo es obligatorio.', 'warning');
                return;
            }

            try {
                const res = await fetch(`/api/productos/tipo/${encodeURIComponent(nombre)}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ motivo: motivo, usuario: this.usuario })
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.message || 'No se pudo eliminar la familia');
                }

                document.getElementById('modal-confirm-delete-type').classList.remove('active');
                this.mostrarToast(`Familia ${nombre} dada de baja correctamente`, 'success');
                await this.cargarDatos();

            } catch (err) {
                this.mostrarToast(`❌ Error al dar de baja masiva en PostgreSQL: ${err.message}`, 'danger');
            }
        },

        /* ---------- EDICIÓN ---------- */
        abrirModalEditar(id) {
            if (this.rol !== 'Administrador') {
                this.mostrarToast('Solo el administrador puede editar registros.', 'warning');
                return;
            }
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
            if (this.rol !== 'Administrador') {
                this.mostrarToast('Solo el administrador puede guardar ediciones.', 'warning');
                return;
            }
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

            if (!editado.nombre_producto || !editado.medidas || !editado.color || !editado.composicion || Number.isNaN(editado.stock_pz) || editado.stock_pz < 0) {
                this.mostrarToast('Completa correctamente todos los campos.', 'warning');
                return;
            }

            try {
                const res = await fetch('/api/productos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(editado)
                });
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.message || 'No se pudo guardar la edición');
                }

                document.getElementById('modal-editar').classList.remove('active');
                await this.registrarBitacora('Edición de Producto', `Actualizados datos de ${id}`);
                this.mostrarToast(`Registro ${id} actualizado en PostgreSQL`, 'success');
                await this.cargarDatos();

            } catch (e) {
                this.mostrarToast(`❌ Error al guardar edición en PostgreSQL: ${e.message}`, 'danger');
            }
        },

        /* ---------- BITÁCORA Y EXPORTACIÓN ---------- */
        async registrarBitacora(accion, detalle) {
            const nuevoRegistro = {
                fecha: this.obtenerFechaActual(),
                usuario: this.usuario || 'Sistema',
                accion,
                bodega: 'General',
                detalle
            };

            try {
                await fetch('/api/bitacora', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(nuevoRegistro)
                });
            } catch (e) {
                console.warn('No se pudo guardar bitácora en el servidor:', e.message);
            }

            this.bitacora.unshift(nuevoRegistro);
            this.guardarRespaldoLocal();
            this.renderizarBitacora();
            this.renderizarRecientesDashboard();
        },

        exportarCSV() {
            const activos = this.inventario.filter(i => i.estado !== 'Merma/Defecto');
            if (activos.length === 0) {
                this.mostrarToast('No hay datos para exportar', 'warning');
                return;
            }

            let csv = 'ID,Nombre Producto,Medidas,Stock (Pz),Color,Composición,Tipo,Bodega,Fecha Reg\n';
            activos.forEach(i => {
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
            const mappedTipo = tipo === 'danger' ? 'error' : tipo;
            toast.className = `toast ${mappedTipo}`;
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