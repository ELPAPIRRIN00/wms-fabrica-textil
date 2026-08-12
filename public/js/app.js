/**
 * =========================================================
 * 🧠 H.A.M. POO - WMS Textil (FABRICA 2.0)
 * Lógica Principal de la Aplicación (Múltiples Empaques & Stock)
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
        rolloSeleccionado: null,
        scanner: null,
        scannerLimpiando: false,
        inventario: [],
        bitacora: [],
        useBackend: false,

        /* ---------- Inicialización ---------- */
        async init() {
            await this.comprobarConexionBackend();
            await this.cargarDatos();
            this.configurarNavegacion();
            this.configurarEventos();
            this.poblarSelectorTelasExistentes();
            this.verificarSesion();
        },

        obtenerFechaActual() {
            const ahora = new Date();
            return ahora.toLocaleString('es-MX', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        },

        async comprobarConexionBackend() {
            try {
                const res = await fetch('/api/productos', { method: 'GET' });
                if (res.ok) {
                    this.useBackend = true;
                    console.log('🔗 Conectado al servidor Backend API REST.');
                }
            } catch (e) {
                this.useBackend = false;
                console.log('💾 Servidor API no disponible. Usando persistencia local (localStorage).');
            }
        },

        async cargarDatos() {
            if (this.useBackend) {
                try {
                    const resProductos = await fetch('/api/productos');
                    if (resProductos.ok) {
                        this.inventario = await resProductos.json();
                    }
                    const resBitacora = await fetch('/api/bitacora');
                    if (resBitacora.ok) {
                        this.bitacora = await resBitacora.json();
                    }
                    this.poblarSelectorTelasExistentes();
                    return;
                } catch (err) {
                    console.warn('Error cargando desde Backend, recurriendo a localStorage:', err);
                }
            }

            try {
                const rawInv = localStorage.getItem('ham_inventario');
                const rawBit = localStorage.getItem('ham_bitacora');
                this.inventario = rawInv !== null ? JSON.parse(rawInv) : this.getInventarioDemo();
                this.bitacora = rawBit !== null ? JSON.parse(rawBit) : [];
            } catch (e) {
                this.inventario = this.getInventarioDemo();
                this.bitacora = [];
            }
            this.poblarSelectorTelasExistentes();
        },

        getInventarioDemo() {
            return [
                { id: 'HAM-1001', tela: 'Algodón Peinado', presentacion: 'Rollo', composicion: '100% Algodón Peinado', color: 'Blanco Óptico', metros: 120, peso: 25, bodega: 1, fecha: this.obtenerFechaActual(), estado: 'Activo' },
                { id: 'HAM-1002', tela: 'Algodón Peinado', presentacion: 'Rollo', composicion: '100% Algodón Peinado', color: 'Negro Intenso', metros: 80, peso: 18, bodega: 1, fecha: this.obtenerFechaActual(), estado: 'Activo' },
                { id: 'HAM-1003', tela: 'Poliéster Deportivo', presentacion: 'Bulto', composicion: '100% Poliéster', color: 'Azul Marino', metros: 200, peso: 40, bodega: 2, fecha: this.obtenerFechaActual(), estado: 'Activo' }
            ];
        },

        async guardarDatos() {
            localStorage.setItem('ham_inventario', JSON.stringify(this.inventario));
            localStorage.setItem('ham_bitacora', JSON.stringify(this.bitacora));

            if (this.useBackend) {
                try {
                    await fetch('/api/sincronizar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ inventario: this.inventario, bitacora: this.bitacora })
                    });
                } catch (e) {
                    console.warn('Error sincronizando con backend:', e);
                }
            }
            this.poblarSelectorTelasExistentes();
        },

        /* ---------- Autocompletado de Telas Existentes ---------- */
        poblarSelectorTelasExistentes() {
            const select = document.getElementById('reg-tela-existente');
            if (!select) return;

            const valorActual = select.value;
            select.innerHTML = '<option value="">+ Registrar Nueva Tela...</option>';

            // Obtener tipos de telas únicas del inventario
            const telasUnicas = {};
            this.inventario.forEach(item => {
                if (item.tela && !telasUnicas[item.tela]) {
                    telasUnicas[item.tela] = item.composicion || '';
                }
            });

            for (const [tela, composicion] of Object.entries(telasUnicas)) {
                const opt = document.createElement('option');
                opt.value = tela;
                opt.dataset.composicion = composicion;
                opt.textContent = `${tela} (${composicion || 'Sin composición'})`;
                select.appendChild(opt);
            }

            select.value = valorActual;
        },

        /* ---------- Autenticación ---------- */
        verificarSesion() {
            const user = localStorage.getItem('ham_user');
            const role = localStorage.getItem('ham_role');
            if (user && role) {
                this.usuario = user;
                this.rol = role;
                const userEl = document.getElementById('txt-usuario-activo');
                if (userEl) {
                    userEl.textContent = `👤 ${user.toUpperCase()} (${role})`;
                }
                const loginModal = document.getElementById('modal-login');
                if (loginModal) loginModal.classList.remove('active');
                this.cambiarVista('dashboard');
            } else {
                const loginModal = document.getElementById('modal-login');
                if (loginModal) loginModal.classList.add('active');
            }
        },

        iniciarSesion(e) {
            e.preventDefault();
            const user = document.getElementById('login-user').value.trim().toLowerCase();
            const pass = document.getElementById('login-pass').value.trim();
            const errorEl = document.getElementById('error-login');

            if (pass !== '1234') {
                errorEl.textContent = 'Contraseña incorrecta (Usa 1234)';
                errorEl.style.display = 'block';
                return;
            }
            if (user !== 'admin' && user !== 'operador') {
                errorEl.textContent = 'Usuario no reconocido (Escribe "admin" u "operador")';
                errorEl.style.display = 'block';
                return;
            }

            localStorage.setItem('ham_user', user);
            localStorage.setItem('ham_role', user);
            this.registrarMovimiento('Inicio de Sesión', '-', `Usuario ${user}`);
            this.verificarSesion();
        },

        cerrarSesion() {
            if (this.usuario) {
                this.registrarMovimiento('Cierre de Sesión', '-', `Usuario ${this.usuario}`);
            }
            localStorage.removeItem('ham_user');
            localStorage.removeItem('ham_role');
            this.usuario = null;
            this.rol = null;

            const formLogin = document.getElementById('form-login');
            if (formLogin) formLogin.reset();
            const errorLogin = document.getElementById('error-login');
            if (errorLogin) errorLogin.style.display = 'none';
            const modalLogin = document.getElementById('modal-login');
            if (modalLogin) modalLogin.classList.add('active');
        },

        /* ---------- Navegación ---------- */
        configurarNavegacion() {
            const navMenu = document.getElementById('nav-menu');
            if (navMenu) {
                navMenu.addEventListener('click', (e) => {
                    const item = e.target.closest('.nav-item');
                    if (!item) return;
                    const vista = item.dataset.view;
                    if (vista) this.cambiarVista(vista);
                });
            }

            const btnLogout = document.getElementById('btn-logout');
            if (btnLogout) {
                btnLogout.addEventListener('click', () => this.cerrarSesion());
            }
        },

        async cambiarVista(vista) {
            if (this.vistaActual === 'escaner' && vista !== 'escaner') {
                await this.detenerScanner();
            }
            this.vistaActual = vista;

            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            const navItem = document.querySelector(`.nav-item[data-view="${vista}"]`);
            if (navItem) navItem.classList.add('active');

            document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));

            if (vista === 'bodega1' || vista === 'bodega2') {
                this.bodegaActiva = vista === 'bodega1' ? 1 : 2;
                const tituloBodega = document.getElementById('titulo-bodega');
                if (tituloBodega) {
                    tituloBodega.innerHTML = `<i class="ph ph-warehouse"></i> Gestión de Bodega ${this.bodegaActiva}`;
                }
                const badge = document.getElementById('badge-bodega');
                if (badge) {
                    badge.className = `badge badge-b${this.bodegaActiva}`;
                    badge.textContent = `Ubicación Física: Bodega ${this.bodegaActiva}`;
                }
                const vistaBodegas = document.getElementById('vista-bodegas');
                if (vistaBodegas) vistaBodegas.classList.add('active');
                this.renderTablaBodega();
            } else {
                const vistaTarget = document.getElementById(`vista-${vista}`);
                if (vistaTarget) vistaTarget.classList.add('active');
            }

            if (vista === 'dashboard') this.renderDashboard();
            if (vista === 'bitacora') this.renderBitacora();
            if (vista === 'escaner') this.iniciarScanner();
        },

        /* ---------- Eventos Generales ---------- */
        configurarEventos() {
            const formLogin = document.getElementById('form-login');
            if (formLogin) formLogin.addEventListener('submit', (e) => this.iniciarSesion(e));

            const formRegistro = document.getElementById('form-registro');
            if (formRegistro) formRegistro.addEventListener('submit', (e) => this.registrarNuevoRollo(e));

            // Cambio en el selector de Tela Existente -> Autocompletar nombre y composición
            const selectTelaExistente = document.getElementById('reg-tela-existente');
            if (selectTelaExistente) {
                selectTelaExistente.addEventListener('change', (e) => {
                    const selectedOpt = e.target.options[e.target.selectedIndex];
                    const inputNombre = document.getElementById('reg-nombre');
                    const inputComposicion = document.getElementById('reg-composicion');
                    if (e.target.value) {
                        inputNombre.value = e.target.value;
                        if (selectedOpt.dataset.composicion) {
                            inputComposicion.value = selectedOpt.dataset.composicion;
                        }
                    }
                });
            }

            const btnExportar = document.getElementById('btn-exportar');
            if (btnExportar) btnExportar.addEventListener('click', () => this.exportarCSV());

            const btnCerrarDetalles = document.getElementById('btn-cerrar-detalles');
            if (btnCerrarDetalles) btnCerrarDetalles.addEventListener('click', () => this.cerrarModal('modal-detalles'));

            const btnDescargarQR = document.getElementById('btn-descargar-qr');
            if (btnDescargarQR) btnDescargarQR.addEventListener('click', () => this.descargarQR());

            const btnReimprimir = document.getElementById('btn-reimprimir');
            if (btnReimprimir) btnReimprimir.addEventListener('click', () => this.imprimirQR());

            const btnSalida = document.getElementById('btn-salida');
            if (btnSalida) btnSalida.addEventListener('click', () => this.registrarSalida());

            const btnEditarAdmin = document.getElementById('btn-editar-admin');
            if (btnEditarAdmin) btnEditarAdmin.addEventListener('click', () => this.abrirEdicionAdmin());

            const btnEliminarAdmin = document.getElementById('btn-eliminar-admin');
            if (btnEliminarAdmin) btnEliminarAdmin.addEventListener('click', () => this.eliminarRolloAdmin());

            const btnCancelarEdicion = document.getElementById('btn-cancelar-edicion');
            if (btnCancelarEdicion) btnCancelarEdicion.addEventListener('click', () => this.cerrarModal('modal-editar'));

            const formEditar = document.getElementById('form-editar');
            if (formEditar) formEditar.addEventListener('submit', (e) => this.guardarEdicion(e));

            const inputQrFile = document.getElementById('input-qr-file');
            if (inputQrFile) {
                inputQrFile.addEventListener('change', (e) => this.procesarArchivoImagenQR(e));
            }

            // Búsqueda en bodega con debounce
            let timeoutBuscador;
            const buscador = document.getElementById('buscador-bodega');
            if (buscador) {
                buscador.addEventListener('input', () => {
                    clearTimeout(timeoutBuscador);
                    timeoutBuscador = setTimeout(() => this.renderTablaBodega(), 300);
                });
            }

            // Delegación de eventos en tablas
            const tablaBodega = document.getElementById('tabla-bodega-activa');
            if (tablaBodega) {
                tablaBodega.addEventListener('click', (e) => {
                    const row = e.target.closest('.data-row');
                    if (row && row.dataset.id) this.abrirDetalles(row.dataset.id);
                });
            }

            const tablaUltimos = document.getElementById('tabla-ultimos');
            if (tablaUltimos) {
                tablaUltimos.addEventListener('click', (e) => {
                    const row = e.target.closest('.data-row');
                    if (row && row.dataset.id) this.abrirDetalles(row.dataset.id);
                });
            }
        },

        /* ---------- Renderizado de Inventario Agrupado y Stock ---------- */
        renderTablaBodega() {
            const tbody = document.getElementById('tabla-bodega-activa');
            if (!tbody) return;
            tbody.innerHTML = '';

            const buscador = document.getElementById('buscador-bodega');
            const filtro = buscador ? buscador.value.toLowerCase().trim() : '';
            const activos = this.inventario.filter(r => r.bodega === this.bodegaActiva && r.estado === 'Activo');

            const filtrados = filtro ? activos.filter(r =>
                r.id.toLowerCase().includes(filtro) ||
                r.tela.toLowerCase().includes(filtro) ||
                (r.presentacion && r.presentacion.toLowerCase().includes(filtro)) ||
                (r.composicion && r.composicion.toLowerCase().includes(filtro)) ||
                r.color.toLowerCase().includes(filtro)
            ) : activos;

            const grupos = {};
            filtrados.forEach(r => {
                if (!grupos[r.tela]) grupos[r.tela] = [];
                grupos[r.tela].push(r);
            });

            for (const [tela, piezas] of Object.entries(grupos)) {
                // Métricas acumuladas del grupo de tela
                const totalMetros = piezas.reduce((acc, p) => acc + Number(p.metros), 0).toFixed(1);
                const totalPeso = piezas.reduce((acc, p) => acc + Number(p.peso), 0).toFixed(1);

                const trGrupo = document.createElement('tr');
                trGrupo.className = 'group-header';
                trGrupo.innerHTML = `
                    <td colspan="7">
                        <i class="ph ph-caret-down"></i> <strong>${tela}</strong> 
                        <span style="margin-left: 10px; font-weight:normal; font-size:0.8rem; color:#475569;">
                            (${piezas.length} piezas físicas | Stock: ${totalMetros} m | ${totalPeso} kg)
                        </span>
                    </td>
                `;
                tbody.appendChild(trGrupo);

                piezas.forEach(pieza => {
                    const presentacion = pieza.presentacion || 'Rollo';
                    const composicion = pieza.composicion || 'N/A';

                    const tr = document.createElement('tr');
                    tr.className = 'data-row';
                    tr.dataset.id = pieza.id;
                    tr.innerHTML = `
                        <td style="font-family:monospace; color:var(--primary); font-weight:600;">${pieza.id}</td>
                        <td><span class="badge" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1;">${presentacion}</span></td>
                        <td>${pieza.color}</td>
                        <td style="font-size:0.8rem; color:var(--text-muted);">${composicion}</td>
                        <td><strong>${pieza.metros} m</strong></td>
                        <td>${pieza.peso} kg</td>
                        <td><span class="badge badge-b${pieza.bodega}">Bodega ${pieza.bodega}</span></td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            if (filtrados.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted);">No hay piezas/telas registradas en esta bodega.</td></tr>';
            }
        },

        renderDashboard() {
            const tbody = document.getElementById('tabla-ultimos');
            if (tbody) {
                tbody.innerHTML = '';
                const ultimos = [...this.inventario].filter(r => r.estado === 'Activo').reverse().slice(0, 5);
                ultimos.forEach(r => {
                    const tr = document.createElement('tr');
                    tr.className = 'data-row';
                    tr.dataset.id = r.id;
                    tr.innerHTML = `
                        <td style="font-family:monospace; color:var(--primary); font-weight:600;">${r.id}</td>
                        <td>${r.tela}</td>
                        <td><span class="badge" style="background:#f1f5f9; color:#334155;">${r.presentacion || 'Rollo'}</span></td>
                        <td><span class="badge badge-b${r.bodega}">Bodega ${r.bodega}</span></td>
                        <td><strong>${r.metros} m</strong></td>
                    `;
                    tbody.appendChild(tr);
                });
                if (ultimos.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:var(--text-muted);">Sin ingresos recientes.</td></tr>';
                }
            }

            let mB1 = 0, mB2 = 0;
            this.inventario.forEach(r => {
                if (r.estado === 'Activo') {
                    if (r.bodega === 1) mB1 += Number(r.metros);
                    else if (r.bodega === 2) mB2 += Number(r.metros);
                }
            });

            const canvas = document.getElementById('chartBodegas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            if (this.chartInstancia) {
                this.chartInstancia.destroy();
                this.chartInstancia = null;
            }

            if (typeof Chart !== 'undefined') {
                this.chartInstancia = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: ['Bodega 1', 'Bodega 2'],
                        datasets: [{
                            data: [mB1, mB2],
                            backgroundColor: ['#2563eb', '#ec4899'],
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'bottom' }
                        },
                        cutout: '65%'
                    }
                });
            }
        },

        renderBitacora() {
            const tbody = document.getElementById('tabla-bitacora');
            if (!tbody) return;
            tbody.innerHTML = '';
            this.bitacora.forEach(b => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="font-size:0.8rem; color:var(--text-muted);">${b.fecha}</td>
                    <td><strong>${b.usuario}</strong></td>
                    <td style="color:var(--primary); font-weight:600;">${b.accion}</td>
                    <td>${b.bodega === '-' ? '-' : 'Bodega ' + b.bodega}</td>
                    <td>${b.detalle}</td>
                `;
                tbody.appendChild(tr);
            });
            if (this.bitacora.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">Sin movimientos registrados.</td></tr>';
            }
        },

        /* ---------- Operaciones CRUD e Ingresos ---------- */
        generarId() {
            const timestamp = Date.now().toString(36).toUpperCase().slice(-5);
            const random = Math.random().toString(36).substring(2, 5).toUpperCase();
            return `HAM-${timestamp}${random}`;
        },

        async registrarNuevoRollo(e) {
            e.preventDefault();
            const nombre = document.getElementById('reg-nombre').value.trim();
            const presentacion = document.getElementById('reg-presentacion').value;
            const composicion = document.getElementById('reg-composicion').value.trim();
            const color = document.getElementById('reg-color').value.trim();
            const metros = parseFloat(document.getElementById('reg-metros').value);
            const peso = parseFloat(document.getElementById('reg-peso').value);

            if (!nombre || !presentacion || !composicion || !color || isNaN(metros) || isNaN(peso) || metros <= 0 || peso <= 0) {
                this.mostrarToast('Por favor completa todos los campos con datos válidos.', 'error');
                return;
            }

            const nuevo = {
                id: this.generarId(),
                tela: nombre,
                presentacion: presentacion,
                composicion: composicion,
                color: color,
                metros: metros,
                peso: peso,
                bodega: this.bodegaActiva,
                fecha: this.obtenerFechaActual(),
                estado: 'Activo'
            };

            this.inventario.push(nuevo);
            this.registrarMovimiento('INGRESO', this.bodegaActiva, `Entrada de ${nuevo.presentacion} ${nuevo.id} (${nuevo.tela} - ${color} - ${composicion})`);
            await this.guardarDatos();
            this.renderTablaBodega();

            const formRegistro = document.getElementById('form-registro');
            if (formRegistro) formRegistro.reset();

            this.mostrarToast(`Pieza ${nuevo.id} (${nuevo.presentacion}) ingresada con éxito.`);
            this.abrirDetalles(nuevo.id);
        },

        abrirDetalles(id) {
            const rollo = this.inventario.find(r => r.id === id);
            if (!rollo) return;
            this.rolloSeleccionado = rollo;

            document.getElementById('det-id').textContent = rollo.id;
            document.getElementById('det-tela').textContent = rollo.tela;
            document.getElementById('det-presentacion').textContent = rollo.presentacion || 'Rollo';
            document.getElementById('det-composicion').textContent = rollo.composicion || 'N/A';
            document.getElementById('det-color').textContent = rollo.color;
            document.getElementById('det-metros').textContent = rollo.metros;
            document.getElementById('det-peso').textContent = rollo.peso;
            document.getElementById('det-bodega').textContent = `Bodega ${rollo.bodega}`;
            document.getElementById('det-fecha').textContent = rollo.fecha;

            // Generar vista previa del QR con Quiet Zone nítido
            const qrContainer = document.getElementById('modal-qr-preview');
            if (qrContainer) {
                qrContainer.innerHTML = '';
                if (typeof QRCode !== 'undefined') {
                    new QRCode(qrContainer, {
                        text: rollo.id,
                        width: 150,
                        height: 150,
                        colorDark: "#000000",
                        colorLight: "#ffffff",
                        correctLevel: QRCode.CorrectLevel.H
                    });
                    qrContainer.style.background = '#ffffff';
                    qrContainer.style.padding = '14px';
                    qrContainer.style.borderRadius = '8px';
                    qrContainer.style.display = 'inline-block';
                    qrContainer.style.border = '1px solid #cbd5e1';
                }
            }

            const btnSalida = document.getElementById('btn-salida');
            if (btnSalida) {
                btnSalida.style.display = rollo.estado === 'Activo' ? 'inline-flex' : 'none';
            }

            const adminActions = document.getElementById('admin-actions');
            if (adminActions) {
                adminActions.style.display = this.rol === 'admin' ? 'flex' : 'none';
            }

            const modalDetalles = document.getElementById('modal-detalles');
            if (modalDetalles) modalDetalles.classList.add('active');
        },

        descargarQR() {
            if (!this.rolloSeleccionado) return;
            const qrContainer = document.getElementById('modal-qr-preview');
            if (!qrContainer) return;

            const img = qrContainer.querySelector('img');
            const canvas = qrContainer.querySelector('canvas');
            let dataUrl = null;

            if (canvas) {
                const padding = 20;
                const exportCanvas = document.createElement('canvas');
                exportCanvas.width = canvas.width + (padding * 2);
                exportCanvas.height = canvas.height + (padding * 2);
                const ctx = exportCanvas.getContext('2d');

                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
                ctx.drawImage(canvas, padding, padding);

                dataUrl = exportCanvas.toDataURL('image/png');
            } else if (img && img.src) {
                dataUrl = img.src;
            }

            if (dataUrl) {
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = `QR_${this.rolloSeleccionado.id}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                this.mostrarToast('Código QR descargado como imagen PNG de alta precisión.');
            } else {
                this.mostrarToast('No se pudo generar la imagen para descarga.', 'error');
            }
        },

        cerrarModal(id) {
            const modal = document.getElementById(id);
            if (modal) modal.classList.remove('active');
        },

        /* ---------- Salidas Pieza por Pieza ---------- */
        async registrarSalida() {
            if (!this.rolloSeleccionado || this.rolloSeleccionado.estado !== 'Activo') return;

            const confirmacion = confirm(`📦 ¿Confirmar SALIDA de la pieza (${this.rolloSeleccionado.presentacion}): ${this.rolloSeleccionado.id}?`);
            if (!confirmacion) return;

            this.rolloSeleccionado.estado = 'Salida';
            this.registrarMovimiento(
                'SALIDA',
                this.rolloSeleccionado.bodega,
                `Salida de ${this.rolloSeleccionado.presentacion} ${this.rolloSeleccionado.id} (${this.rolloSeleccionado.tela} - ${this.rolloSeleccionado.composicion || ''}).`
            );
            await this.guardarDatos();
            this.cerrarModal('modal-detalles');
            this.mostrarToast(`✅ Salida de ${this.rolloSeleccionado.presentacion} ${this.rolloSeleccionado.id} registrada con éxito.`, 'success');
            
            this.renderTablaBodega();
            if (this.vistaActual === 'dashboard') this.renderDashboard();
            if (this.vistaActual === 'escaner') {
                // Volver a activar escáner para la siguiente pieza
                setTimeout(() => this.iniciarScanner(), 400);
            }
        },

        abrirEdicionAdmin() {
            if (!this.rolloSeleccionado || this.rol !== 'admin') return;
            document.getElementById('edit-id-display').textContent = `(${this.rolloSeleccionado.id})`;
            document.getElementById('edit-nombre').value = this.rolloSeleccionado.tela;
            document.getElementById('edit-presentacion').value = this.rolloSeleccionado.presentacion || 'Rollo';
            document.getElementById('edit-composicion').value = this.rolloSeleccionado.composicion || '';
            document.getElementById('edit-color').value = this.rolloSeleccionado.color;
            document.getElementById('edit-metros').value = this.rolloSeleccionado.metros;
            document.getElementById('edit-peso').value = this.rolloSeleccionado.peso;
            this.cerrarModal('modal-detalles');
            document.getElementById('modal-editar').classList.add('active');
        },

        async guardarEdicion(e) {
            e.preventDefault();
            if (!this.rolloSeleccionado) return;

            this.rolloSeleccionado.tela = document.getElementById('edit-nombre').value.trim();
            this.rolloSeleccionado.presentacion = document.getElementById('edit-presentacion').value;
            this.rolloSeleccionado.composicion = document.getElementById('edit-composicion').value.trim();
            this.rolloSeleccionado.color = document.getElementById('edit-color').value.trim();
            this.rolloSeleccionado.metros = parseFloat(document.getElementById('edit-metros').value);
            this.rolloSeleccionado.peso = parseFloat(document.getElementById('edit-peso').value);

            this.registrarMovimiento('EDICIÓN', this.rolloSeleccionado.bodega, `Administrador modificó ${this.rolloSeleccionado.id}`);
            await this.guardarDatos();
            this.cerrarModal('modal-editar');
            this.mostrarToast('Cambios guardados correctamente.');

            if (this.vistaActual === 'dashboard') this.renderDashboard();
            else this.renderTablaBodega();
            this.abrirDetalles(this.rolloSeleccionado.id);
        },

        async eliminarRolloAdmin() {
            if (!this.rolloSeleccionado || this.rol !== 'admin') return;
            if (!confirm(`⚠️ ¿Eliminar permanentemente la pieza ${this.rolloSeleccionado.id}?`)) return;

            const idEliminado = this.rolloSeleccionado.id;
            const bodegaTarget = this.rolloSeleccionado.bodega;
            this.inventario = this.inventario.filter(r => r.id !== idEliminado);
            this.registrarMovimiento('ELIMINACIÓN', bodegaTarget, `Administrador eliminó ${idEliminado}`);
            await this.guardarDatos();
            this.cerrarModal('modal-detalles');
            this.mostrarToast('Pieza eliminada del sistema.', 'error');

            if (this.vistaActual === 'dashboard') this.renderDashboard();
            else this.renderTablaBodega();
        },

        registrarMovimiento(accion, bodega, detalle) {
            this.bitacora.unshift({
                fecha: this.obtenerFechaActual(),
                usuario: this.usuario ? this.usuario.toUpperCase() : 'Sistema',
                accion: accion,
                bodega: bodega,
                detalle: detalle
            });
            this.guardarDatos();
        },

        /* ---------- Lector de Archivos de Imagen QR Directo ---------- */
        async procesarArchivoImagenQR(e) {
            const file = e.target.files[0];
            if (!file) return;

            const resultEl = document.getElementById('qr-file-result');
            if (resultEl) resultEl.innerHTML = '<span style="color:var(--primary);">🔍 Procesando y escaneando imagen...</span>';

            try {
                const html5Qrcode = new Html5Qrcode("scanner-container");
                const decodedText = await html5Qrcode.scanFile(file, true);

                if (resultEl) resultEl.innerHTML = `<span style="color:var(--success);">✅ ¡Código Detectado!: ${decodedText}</span>`;
                this.mostrarToast(`Código detectado: ${decodedText}`);

                const rollo = this.inventario.find(r => r.id === decodedText);
                if (rollo) {
                    this.abrirDetalles(rollo.id);
                } else {
                    this.mostrarToast(`El código (${decodedText}) no pertenece a ningún producto registrado.`, 'error');
                }
            } catch (err) {
                console.error('Error al decodificar imagen QR:', err);
                if (resultEl) {
                    resultEl.innerHTML = '<span style="color:var(--danger);">❌ No se detectó ningún código QR en la imagen.</span>';
                }
                this.mostrarToast('No se pudo decodificar el código QR de esta imagen.', 'error');
            } finally {
                e.target.value = '';
            }
        },

        /* ---------- Escáner QR de Cámara (Salidas Pieza por Pieza) ---------- */
        iniciarScanner() {
            const container = document.getElementById('scanner-container');
            if (!container) return;
            container.innerHTML = '';

            if (typeof Html5QrcodeScanner === 'undefined') {
                container.innerHTML = '<p style="padding:20px; color:var(--danger);">Cargando lector de código QR...</p>';
                return;
            }

            this.scanner = new Html5QrcodeScanner("scanner-container", {
                fps: 10,
                qrbox: { width: 240, height: 240 },
                experimentalFeatures: {
                    useBarCodeDetectorIfSupported: true
                },
                supportedScanTypes: [
                    Html5QrcodeScanType.SCAN_TYPE_CAMERA,
                    Html5QrcodeScanType.SCAN_TYPE_FILE
                ]
            }, false);

            this.scanner.render(
                async (decodedText) => {
                    await this.detenerScanner();
                    this.mostrarToast(`Código detectado: ${decodedText}`);
                    const rollo = this.inventario.find(r => r.id === decodedText);
                    if (rollo) {
                        this.abrirDetalles(rollo.id);
                    } else {
                        this.mostrarToast('El código QR no pertenece a ningún producto registrado.', 'error');
                    }
                },
                (error) => {
                    // Silenciar mensajes continuos
                }
            );

            this.traducirEscanerAEspanol();
        },

        traducirEscanerAEspanol() {
            const container = document.getElementById('scanner-container');
            if (!container) return;

            const traducirTextos = () => {
                const btnPermission = container.querySelector('#html5-qrcode-button-camera-permission');
                if (btnPermission && btnPermission.textContent.includes('Request Camera Permissions')) {
                    btnPermission.textContent = '🎥 Solicitar Permiso para Usar la Cámara';
                }

                const btnStart = container.querySelector('#html5-qrcode-button-camera-start');
                if (btnStart && btnStart.textContent.includes('Start Scanning')) {
                    btnStart.textContent = '▶️ Iniciar Escáner de Cámara';
                }

                const btnStop = container.querySelector('#html5-qrcode-button-camera-stop');
                if (btnStop && btnStop.textContent.includes('Stop Scanning')) {
                    btnStop.textContent = '⏹️ Detener Escáner';
                }

                const selectCamera = container.querySelector('#html5-qrcode-select-camera');
                if (selectCamera && selectCamera.previousSibling && selectCamera.previousSibling.textContent) {
                    if (selectCamera.previousSibling.textContent.includes('Select Camera')) {
                        selectCamera.previousSibling.textContent = 'Seleccionar Cámara: ';
                    }
                }

                const anchorType = container.querySelector('#html5-qrcode-anchor-scan-type-change');
                if (anchorType) {
                    if (anchorType.textContent.includes('Scan an Image File')) {
                        anchorType.textContent = '📁 Subir o escanear una imagen con código QR';
                    } else if (anchorType.textContent.includes('Scan using camera directly')) {
                        anchorType.textContent = '📷 Usar la cámara directamente';
                    }
                }

                const fileInputLabel = container.querySelector('#html5-qrcode-button-file-selection');
                if (fileInputLabel && fileInputLabel.textContent.includes('Choose Image')) {
                    fileInputLabel.textContent = '🖼️ Seleccionar Imagen de QR';
                }
            };

            traducirTextos();
            const observer = new MutationObserver(traducirTextos);
            observer.observe(container, { childList: true, subtree: true });
        },

        async detenerScanner() {
            if (this.scanner && !this.scannerLimpiando) {
                this.scannerLimpiando = true;
                try {
                    await this.scanner.clear();
                } catch (e) {
                    console.warn('Detención limpia del escáner:', e);
                } finally {
                    this.scanner = null;
                    this.scannerLimpiando = false;
                }
            }
        },

        /* ---------- Impresión de Etiquetas QR ---------- */
        imprimirQR() {
            if (!this.rolloSeleccionado) return;

            const iframe = document.getElementById('print-frame');
            if (!iframe) return;

            const doc = iframe.contentDocument || iframe.contentWindow.document;
            doc.open();
            doc.write(`
                <!DOCTYPE html>
                <html lang="es">
                <head>
                    <meta charset="UTF-8">
                    <title>Etiqueta QR - ${this.rolloSeleccionado.id}</title>
                    <style>
                        body { margin: 1cm; font-family: system-ui, -apple-system, sans-serif; text-align: center; color: #000; }
                        .etiqueta { border: 2px dashed #000; padding: 20px; width: 85mm; margin: auto; border-radius: 8px; }
                        h3 { margin: 0 0 5px 0; font-size: 14pt; font-weight: 800; text-transform: uppercase; }
                        .badge-type { display: inline-block; font-size: 9pt; font-weight: bold; background: #e2e8f0; padding: 2px 8px; border-radius: 4px; margin-bottom: 8px; }
                        p { margin: 4px 0; font-size: 10pt; }
                        .qr-box { margin: 15px auto; display: flex; justify-content: center; align-items: center; background: #fff; padding: 10px; border-radius: 6px; }
                        .qr-box img, .qr-box canvas { display: block; margin: 0 auto; }
                        .code-id { font-family: monospace; font-size: 13pt; font-weight: bold; margin-top: 8px; }
                        .empresa { font-size: 8pt; font-weight: bold; margin-top: 12px; border-top: 1px solid #000; padding-top: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
                    </style>
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
                </head>
                <body>
                    <div class="etiqueta">
                        <h3>${this.rolloSeleccionado.tela}</h3>
                        <div class="badge-type">Empaque: ${this.rolloSeleccionado.presentacion || 'Rollo'}</div>
                        <p><strong>Composición:</strong> ${this.rolloSeleccionado.composicion || 'N/A'}</p>
                        <p><strong>Color:</strong> ${this.rolloSeleccionado.color}</p>
                        <p><strong>Metros:</strong> ${this.rolloSeleccionado.metros} m | <strong>Peso:</strong> ${this.rolloSeleccionado.peso} kg</p>
                        <div id="qr-temp" class="qr-box"></div>
                        <div class="code-id">${this.rolloSeleccionado.id}</div>
                        <div class="empresa">H.A.M. Poo - Sistema WMS Textil</div>
                    </div>
                    <script>
                        window.onload = function() {
                            new QRCode(document.getElementById('qr-temp'), {
                                text: "${this.rolloSeleccionado.id}",
                                width: 140,
                                height: 140,
                                colorDark: "#000000",
                                colorLight: "#ffffff",
                                correctLevel: QRCode.CorrectLevel.H
                            });
                            setTimeout(function() {
                                window.focus();
                                window.print();
                            }, 250);
                        };
                    </script>
                </body>
                </html>
            `);
            doc.close();
        },

        /* ---------- Exportación a CSV ---------- */
        exportarCSV() {
            if (this.inventario.length === 0) {
                this.mostrarToast('No hay datos en el inventario para exportar.', 'error');
                return;
            }

            let csv = '\uFEFFID,Tela,Empaque,Composicion,Color,Metros,Peso,Bodega,Estado,Fecha\n';
            this.inventario.forEach(r => {
                const escapeCsv = (str) => `"${String(str).replace(/"/g, '""')}"`;
                csv += `${r.id},${escapeCsv(r.tela)},${escapeCsv(r.presentacion || 'Rollo')},${escapeCsv(r.composicion || 'N/A')},${escapeCsv(r.color)},${r.metros},${r.peso},${r.bodega},${r.estado},"${r.fecha}"\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Inventario_WMS_HAM_${Date.now()}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.registrarMovimiento('Exportación', '-', 'Inventario completo exportado a archivo CSV.');
        },

        /* ---------- Notificaciones Toast ---------- */
        mostrarToast(mensaje, tipo = 'success') {
            const container = document.getElementById('toast-container');
            if (!container) return;

            const toast = document.createElement('div');
            toast.className = `toast ${tipo}`;
            const icono = tipo === 'success' ? 'ph-check-circle' : 'ph-warning';
            toast.innerHTML = `<i class="ph ${icono}"></i> <span>${mensaje}</span>`;
            container.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }, 3500);
        }
    };

    window.addEventListener('DOMContentLoaded', () => App.init());
})();
