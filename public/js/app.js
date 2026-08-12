/**
 * =========================================================
 * 🧠 H.A.M. POO - WMS Textil (FABRICA 2.0)
 * Lógica Principal de la Aplicación
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
            this.verificarSesion();
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
                    return;
                } catch (err) {
                    console.warn('Error cargando desde Backend, recurriendo a localStorage:', err);
                }
            }

            // Fallback a localStorage con validación correcta para arrays vacíos []
            try {
                const rawInv = localStorage.getItem('ham_inventario');
                const rawBit = localStorage.getItem('ham_bitacora');
                this.inventario = rawInv !== null ? JSON.parse(rawInv) : this.getInventarioDemo();
                this.bitacora = rawBit !== null ? JSON.parse(rawBit) : [];
            } catch (e) {
                this.inventario = this.getInventarioDemo();
                this.bitacora = [];
            }
        },

        getInventarioDemo() {
            return [
                { id: 'HAM-1001', tela: 'Algodón Peinado', color: 'Blanco Óptico', metros: 120, peso: 25, bodega: 1, fecha: new Date().toLocaleString(), estado: 'Activo' },
                { id: 'HAM-1002', tela: 'Algodón Peinado', color: 'Negro Intenso', metros: 80, peso: 18, bodega: 1, fecha: new Date().toLocaleString(), estado: 'Activo' },
                { id: 'HAM-1003', tela: 'Poliéster Deportivo', color: 'Azul Marino', metros: 200, peso: 40, bodega: 2, fecha: new Date().toLocaleString(), estado: 'Activo' }
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
                    tituloBodega.innerHTML = `<i class="ph ph-warehouse"></i> Bodega ${this.bodegaActiva}`;
                }
                const badge = document.getElementById('badge-bodega');
                if (badge) {
                    badge.className = `badge badge-b${this.bodegaActiva}`;
                    badge.textContent = `Ubicación Física: B${this.bodegaActiva}`;
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

            const btnExportar = document.getElementById('btn-exportar');
            if (btnExportar) btnExportar.addEventListener('click', () => this.exportarCSV());

            const btnCerrarDetalles = document.getElementById('btn-cerrar-detalles');
            if (btnCerrarDetalles) btnCerrarDetalles.addEventListener('click', () => this.cerrarModal('modal-detalles'));

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

        /* ---------- Renderizado ---------- */
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
                r.color.toLowerCase().includes(filtro)
            ) : activos;

            const grupos = {};
            filtrados.forEach(r => {
                if (!grupos[r.tela]) grupos[r.tela] = [];
                grupos[r.tela].push(r);
            });

            for (const [tela, rollos] of Object.entries(grupos)) {
                const trGrupo = document.createElement('tr');
                trGrupo.className = 'group-header';
                trGrupo.innerHTML = `<td colspan="5"><i class="ph ph-caret-down"></i> ${tela} (${rollos.length} rollos)</td>`;
                tbody.appendChild(trGrupo);

                rollos.forEach(rollo => {
                    const tr = document.createElement('tr');
                    tr.className = 'data-row';
                    tr.dataset.id = rollo.id;
                    tr.innerHTML = `
                        <td style="font-family:monospace; color:var(--primary); font-weight:600;">${rollo.id}</td>
                        <td>${rollo.color}</td>
                        <td>${rollo.metros} m</td>
                        <td>${rollo.peso} kg</td>
                        <td><span class="badge badge-b${rollo.bodega}">B${rollo.bodega}</span></td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            if (filtrados.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">No se encontraron rollos registrados.</td></tr>';
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
                        <td><span class="badge badge-b${r.bodega}">B${r.bodega}</span></td>
                        <td>${r.metros} m</td>
                    `;
                    tbody.appendChild(tr);
                });
                if (ultimos.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:15px; color:var(--text-muted);">Sin ingresos recientes.</td></tr>';
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
                    <td>${b.bodega === '-' ? '-' : 'B' + b.bodega}</td>
                    <td>${b.detalle}</td>
                `;
                tbody.appendChild(tr);
            });
            if (this.bitacora.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">Sin movimientos registrados.</td></tr>';
            }
        },

        /* ---------- Operaciones CRUD ---------- */
        generarId() {
            const timestamp = Date.now().toString(36).toUpperCase().slice(-5);
            const random = Math.random().toString(36).substring(2, 5).toUpperCase();
            return `HAM-${timestamp}${random}`;
        },

        async registrarNuevoRollo(e) {
            e.preventDefault();
            const nombre = document.getElementById('reg-nombre').value.trim();
            const color = document.getElementById('reg-color').value.trim();
            const metros = parseFloat(document.getElementById('reg-metros').value);
            const peso = parseFloat(document.getElementById('reg-peso').value);

            if (!nombre || !color || isNaN(metros) || isNaN(peso) || metros <= 0 || peso <= 0) {
                this.mostrarToast('Por favor completa los datos válidos.', 'error');
                return;
            }

            const nuevo = {
                id: this.generarId(),
                tela: nombre,
                color: color,
                metros: metros,
                peso: peso,
                bodega: this.bodegaActiva,
                fecha: new Date().toLocaleString(),
                estado: 'Activo'
            };

            this.inventario.push(nuevo);
            this.registrarMovimiento('INGRESO', this.bodegaActiva, `Rollo ${nuevo.id} (${nuevo.tela} - ${color})`);
            await this.guardarDatos();
            this.renderTablaBodega();

            const formRegistro = document.getElementById('form-registro');
            if (formRegistro) formRegistro.reset();

            this.mostrarToast(`Rollo ${nuevo.id} registrado con éxito.`);
            this.rolloSeleccionado = nuevo;
            this.imprimirQR();
        },

        abrirDetalles(id) {
            const rollo = this.inventario.find(r => r.id === id);
            if (!rollo) return;
            this.rolloSeleccionado = rollo;

            document.getElementById('det-id').textContent = rollo.id;
            document.getElementById('det-tela').textContent = rollo.tela;
            document.getElementById('det-color').textContent = rollo.color;
            document.getElementById('det-metros').textContent = rollo.metros;
            document.getElementById('det-peso').textContent = rollo.peso;
            document.getElementById('det-bodega').textContent = `Bodega ${rollo.bodega}`;
            document.getElementById('det-fecha').textContent = rollo.fecha;

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

        cerrarModal(id) {
            const modal = document.getElementById(id);
            if (modal) modal.classList.remove('active');
        },

        async registrarSalida() {
            if (!this.rolloSeleccionado || this.rolloSeleccionado.estado !== 'Activo') return;
            if (!confirm(`¿Confirmas dar de SALIDA al rollo ${this.rolloSeleccionado.id}?`)) return;

            this.rolloSeleccionado.estado = 'Salida';
            this.registrarMovimiento('SALIDA', this.rolloSeleccionado.bodega, `Rollo ${this.rolloSeleccionado.id} despachado del inventario.`);
            await this.guardarDatos();
            this.cerrarModal('modal-detalles');
            this.mostrarToast('Salida de inventario registrada con éxito.', 'success');
            this.renderTablaBodega();
            if (this.vistaActual === 'dashboard') this.renderDashboard();
        },

        abrirEdicionAdmin() {
            if (!this.rolloSeleccionado || this.rol !== 'admin') return;
            document.getElementById('edit-id-display').textContent = `(${this.rolloSeleccionado.id})`;
            document.getElementById('edit-nombre').value = this.rolloSeleccionado.tela;
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
            this.rolloSeleccionado.color = document.getElementById('edit-color').value.trim();
            this.rolloSeleccionado.metros = parseFloat(document.getElementById('edit-metros').value);
            this.rolloSeleccionado.peso = parseFloat(document.getElementById('edit-peso').value);

            this.registrarMovimiento('EDICIÓN', this.rolloSeleccionado.bodega, `Admin modificó ${this.rolloSeleccionado.id}`);
            await this.guardarDatos();
            this.cerrarModal('modal-editar');
            this.mostrarToast('Cambios guardados correctamente.');

            if (this.vistaActual === 'dashboard') this.renderDashboard();
            else this.renderTablaBodega();
            this.abrirDetalles(this.rolloSeleccionado.id);
        },

        async eliminarRolloAdmin() {
            if (!this.rolloSeleccionado || this.rol !== 'admin') return;
            if (!confirm(`⚠️ ¿Eliminar permanentemente el rollo ${this.rolloSeleccionado.id}?`)) return;

            const idEliminado = this.rolloSeleccionado.id;
            const bodegaTarget = this.rolloSeleccionado.bodega;
            this.inventario = this.inventario.filter(r => r.id !== idEliminado);
            this.registrarMovimiento('ELIMINACIÓN', bodegaTarget, `Admin eliminó ${idEliminado}`);
            await this.guardarDatos();
            this.cerrarModal('modal-detalles');
            this.mostrarToast('Rollo eliminado del sistema.', 'error');

            if (this.vistaActual === 'dashboard') this.renderDashboard();
            else this.renderTablaBodega();
        },

        registrarMovimiento(accion, bodega, detalle) {
            this.bitacora.unshift({
                fecha: new Date().toLocaleString(),
                usuario: this.usuario || 'Sistema',
                accion: accion,
                bodega: bodega,
                detalle: detalle
            });
            this.guardarDatos();
        },

        /* ---------- Escáner QR de Cámara / Archivo ---------- */
        iniciarScanner() {
            const container = document.getElementById('scanner-container');
            if (!container) return;
            container.innerHTML = '';

            if (typeof Html5QrcodeScanner === 'undefined') {
                container.innerHTML = '<p style="padding:20px; color:var(--danger);">Cargando lector QR...</p>';
                return;
            }

            this.scanner = new Html5QrcodeScanner("scanner-container", {
                fps: 10,
                qrbox: { width: 240, height: 240 },
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
                        this.mostrarToast('El QR no corresponde a ningún rollo registrado.', 'error');
                    }
                },
                (error) => {
                    // Silenciar mensajes informativos continuos del scanner
                }
            );
        },

        async detenerScanner() {
            if (this.scanner && !this.scannerLimpiando) {
                this.scannerLimpiando = true;
                try {
                    await this.scanner.clear();
                } catch (e) {
                    console.warn('Detención limpia de escáner:', e);
                } finally {
                    this.scanner = null;
                    this.scannerLimpiando = false;
                }
            }
        },

        /* ---------- Impresión de Etiquetas QR (Fix Asíncrono) ---------- */
        imprimirQR() {
            if (!this.rolloSeleccionado) return;

            const iframe = document.getElementById('print-frame');
            if (!iframe) return;

            const doc = iframe.contentDocument || iframe.contentWindow.document;
            doc.open();
            doc.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Etiqueta QR - ${this.rolloSeleccionado.id}</title>
                    <style>
                        body { margin: 1cm; font-family: system-ui, sans-serif; text-align: center; color: #000; }
                        .etiqueta { border: 2px dashed #000; padding: 20px; width: 85mm; margin: auto; border-radius: 8px; }
                        h3 { margin: 0 0 10px 0; font-size: 14pt; font-weight: 800; text-transform: uppercase; }
                        p { margin: 4px 0; font-size: 10pt; }
                        .qr-box { margin: 15px auto; display: flex; justify-content: center; align-items: center; }
                        .qr-box img, .qr-box canvas { display: block; margin: 0 auto; }
                        .code-id { font-family: monospace; font-size: 13pt; font-weight: bold; margin-top: 8px; }
                        .empresa { font-size: 8pt; font-weight: bold; margin-top: 12px; border-top: 1px solid #000; padding-top: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
                    </style>
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
                </head>
                <body>
                    <div class="etiqueta">
                        <h3>${this.rolloSeleccionado.tela}</h3>
                        <p><strong>Color:</strong> ${this.rolloSeleccionado.color}</p>
                        <p><strong>Metros:</strong> ${this.rolloSeleccionado.metros} m | <strong>Peso:</strong> ${this.rolloSeleccionado.peso} kg</p>
                        <div id="qr-temp" class="qr-box"></div>
                        <div class="code-id">${this.rolloSeleccionado.id}</div>
                        <div class="empresa">H.A.M. Poo - WMS Textil System</div>
                    </div>
                    <script>
                        window.onload = function() {
                            new QRCode(document.getElementById('qr-temp'), {
                                text: "${this.rolloSeleccionado.id}",
                                width: 130,
                                height: 130,
                                colorDark: "#000000",
                                colorLight: "#ffffff",
                                correctLevel: QRCode.CorrectLevel.H
                            });
                            // Dar 250ms para garantizar el renderizado del Canvas/IMG antes de imprimir
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
                this.mostrarToast('No hay datos de inventario para exportar.', 'error');
                return;
            }

            let csv = '\uFEFFID,Tela,Color,Metros,Peso,Bodega,Estado,Fecha\n';
            this.inventario.forEach(r => {
                const escapeCsv = (str) => `"${String(str).replace(/"/g, '""')}"`;
                csv += `${r.id},${escapeCsv(r.tela)},${escapeCsv(r.color)},${r.metros},${r.peso},${r.bodega},${r.estado},"${r.fecha}"\n`;
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
            this.registrarMovimiento('Exportación', '-', 'Inventario completo exportado a CSV.');
        },

        /* ---------- Toast Notifications ---------- */
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

    // Inicializar al cargar el DOM
    window.addEventListener('DOMContentLoaded', () => App.init());
})();
