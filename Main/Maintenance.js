// Se asume que Firebase (compatibilidad) está disponible globalmente desde Main.js.
// Se asume que Main.js ha establecido window.db y window.auth tras el login.

(function () { // ⬅️ INICIO: IIFE para aislar el ámbito

    // =======================================================
    // 1. VARIABLES LOCALES Y CONFIGURACIÓN FIREBASE (Lectura de window)
    // =======================================================

    // Utilizamos la bandera de window para la inicialización (si existe)
    const IS_MOCK_MODE = window.IS_MOCK_MODE;
    const userId = sessionStorage.getItem('portis-user-identifier') || 'mock-user';

    let db = null;
    let isFirebaseReady = false;
    let currentViewDate = new Date();

    // --- [Mock Data y showMessage se mantienen] ---

    // 🔑 CLAVE COMPARTIDA con Repairs.js para leer los mismos datos
    const MOCK_REPAIRS_KEY = 'portis-repairs-mock';

    // Función para cargar datos desde localStorage (compartidos con Repairs.js)
    function loadMaintenanceFromStorage() {
        try {
            const repairsJson = localStorage.getItem(MOCK_REPAIRS_KEY);
            return repairsJson ? JSON.parse(repairsJson) : [];
        } catch (e) {
            console.error("Error al cargar mantenimientos desde localStorage:", e);
            return [];
        }
    }

    function showMessage(type, message) {
        // Usamos la función global showAppMessage de config.js si está disponible
        if (typeof window.showAppMessage === 'function') {
            window.showAppMessage(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] Notificación: ${message}`);
            const messageBox = document.getElementById('app-message');
            if (!messageBox) return;

            messageBox.textContent = message;
            messageBox.className = `message-box message-${type} fixed top-20 left-1/2 -translate-x-1/2 z-[1000] w-[90%] md:w-auto message-box-show`;
            messageBox.style.display = 'block';

            setTimeout(() => {
                messageBox.classList.remove('message-box-show');
                setTimeout(() => messageBox.style.display = 'none', 300);
            }, 4000);
        }
    }

    // ----------------------------------------------------------------------------------
    // 🚨 FUNCIÓN MEJORADA: Inicialización más robusta
    // ----------------------------------------------------------------------------------
    async function setupFirebase() {
        if (IS_MOCK_MODE) {
            console.warn("Maintenance: MODO MOCK activado.");
            isFirebaseReady = true;
            return true;
        }

        // 🔑 CRÍTICO: Esperamos a que la promesa de inicialización de Main.js se resuelva
        if (typeof window.firebaseReadyPromise !== 'undefined') {
            console.log("Maintenance: Esperando señal de Firebase Ready...");
            await window.firebaseReadyPromise;
        }

        // 🔑 CRÍTICO: Comprobamos si las instancias globales están listas.
        if (typeof window.db !== 'undefined' && window.db !== null) {
            db = window.db; // Asignamos la instancia global a la local
            isFirebaseReady = true;
            console.log(`Maintenance: Firestore conectado a través de window.db.`);
            return true;
        }

        // Fallback si la DB no está lista
        console.error("Maintenance: window.db no está disponible. Verifique Main.js. Fallback a Mock Mode.");
        showMessage('error', 'Error de base de datos. Usando modo simulado.');
        window.IS_MOCK_MODE = true; // Forzamos Mock Mode globalmente
        isFirebaseReady = false;
        return false;
    }

    /**
     * Obtiene la referencia a la colección 'repairs' con la ruta users/{userId}/repairs
     */
    function getRepairsCollectionRef() {
        // 🔑 CRÍTICO: Leer el userId ACTUAL de sessionStorage, no el que había al cargar el script
        const currentUserId = sessionStorage.getItem('portis-user-identifier');

        // Aseguramos que DB esté inicializada y que haya un ID de usuario válido (no mock)
        if (!db || !currentUserId || currentUserId === 'mock-user' || !isFirebaseReady) return null;

        // Ruta correcta: users/{userId}/repairs
        const path = `users/${currentUserId}/repairs`;

        // Retorna la subcolección para el usuario actual
        return db.collection(path);
    }

    // ====================================
    // 2. LÓGICA DE CARGA DE DATOS
    // ====================================

    /**
     * Obtiene los mantenimientos para el mes y año actual desde Firestore.
     */
    async function fetchMaintenanceFromFirestore(date) {
        const currentMonth = date.getMonth() + 1; // 1-12
        const currentYear = date.getFullYear();

        const repairsRef = getRepairsCollectionRef();
        if (!repairsRef) {
            showMessage('error', 'Error de sesión: ID de usuario no válido o DB no lista.');
            return [];
        }

        try {
            // NOTA: Para soportar la lógica de "Anual solo por año" y "Mensual por mes y año" en Firestore
            // sin índices complejos excesivos, traemos todo el año y filtramos en cliente.
            // Esto es aceptable dado que el volumen de mantenimientos por usuario no suele ser masivo.

            const snapshot = await repairsRef
                .where('maintenance_year', '==', currentYear)
                .get();

            const data = [];
            snapshot.forEach(doc => {
                const item = { ...doc.data(), id: doc.id };

                // Lógica de filtrado CLIENT-SIDE para Firestore
                const isAnnual = item.contract && item.contract.toLowerCase().includes('anual');

                if (isAnnual) {
                    // Si es anual, basta con que coincida el año (ya filtrado por query)
                    data.push(item);
                } else {
                    // Si NO es anual (mensual, etc), debe coincidir también el mes
                    if (item.maintenance_month === currentMonth) {
                        data.push(item);
                    }
                }
            });
            return data;

        } catch (error) {
            console.error("Error al cargar mantenimientos desde Firestore:", error);
            showMessage('error', 'Error al consultar mantenimientos.');
            return [];
        }
    }

    /**
     * Función principal para obtener y renderizar mantenimientos.
     */
    window.fetchMaintenanceData = async function () {
        let data = [];

        // 🔑 CRÍTICO: Aseguramos que DB se asigne antes de intentar usarla en el fetch.
        if (db === null) {
            await setupFirebase();
        }

        const date = currentViewDate;
        const currentMonth = date.getMonth() + 1;
        const currentYear = date.getFullYear();

        // 🚨 Verificamos la bandera global, que setupFirebase puede haber cambiado a true
        if (window.IS_MOCK_MODE || !isFirebaseReady) {
            console.log('MOCK MODE: Cargando datos de mantenimiento de prueba.');

            const allRepairs = loadMaintenanceFromStorage();

            // Lógica de Filtrado:
            // - Si contrato es Anual (o superior): Coincide AÑO.
            // - Si contrato es Mensual (o resto): Coincide MES y AÑO.
            data = allRepairs.filter(item => {
                const isAnnual = item.contract && item.contract.toLowerCase().includes('anual');
                if (isAnnual) {
                    return item.maintenance_year === currentYear;
                } else {
                    return item.maintenance_month === currentMonth && item.maintenance_year === currentYear;
                }
            });
        } else {
            // Modo Normal (Firebase/API)
            data = await fetchMaintenanceFromFirestore(date);
        }

        renderMaintenanceList(data, date);
    }

    // ====================================
    // 3. LÓGICA DE RENDERIZADO Y NAVEGACIÓN
    // ====================================

    /**
     * Renderiza la lista de mantenimientos en la vista.
     */
    function renderMaintenanceList(data, currentDate) {
        const listContainer = document.getElementById('monthly-maintenance-list');
        const noMaintenanceMessage = document.getElementById('no-maintenance-message');
        const monthYearDisplay = document.getElementById('current-maintenance-month-year');
        const monthlyCountDisplay = document.getElementById('monthly-count');

        if (!listContainer || !monthYearDisplay) return;

        const month = currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

        monthYearDisplay.textContent = month.charAt(0).toUpperCase() + month.slice(1);

        listContainer.innerHTML = '';

        // 1. Actualizar el resumen
        monthlyCountDisplay.textContent = data.length;

        // 2. Renderizar items o mensaje de vacío
        if (data.length === 0) {
            if (noMaintenanceMessage) noMaintenanceMessage.style.display = 'block';
        } else {
            if (noMaintenanceMessage) noMaintenanceMessage.style.display = 'none';

            // Lógica de Ordenamiento:
            // 1. Prioridad: Alta > Media > Baja
            // 2. Contrato: Mensual > Anual (Mensual arriba, Anual abajo)

            const priorityValue = (p) => {
                if (!p) return 3;
                const lower = p.toLowerCase();
                if (lower === 'alta' || lower === 'high') return 1;
                if (lower === 'media' || lower === 'medium') return 2;
                return 3; // Baja
            };

            const contractValue = (c) => {
                if (!c) return 2;
                const lower = c.toLowerCase();
                if (lower.includes('mensual')) return 1; // Mensual primero
                return 2; // Anual (y otros) después
            };

            data.sort((a, b) => {
                const pA = priorityValue(a.priority);
                const pB = priorityValue(b.priority);

                if (pA !== pB) {
                    return pA - pB; // Menor valor (1=Alta) primero
                }

                // Si misma prioridad, ordenar por contrato
                const cA = contractValue(a.contract);
                const cB = contractValue(b.contract);
                return cA - cB;
            });

            data.forEach(item => {
                const itemElement = createMaintenanceCard(item);
                listContainer.appendChild(itemElement);
            });
        }
    }

    /**
     * Crea la tarjeta HTML para un mantenimiento individual (DISEÑO ACTUALIZADO).
     */
    function createMaintenanceCard(item) {
        const card = document.createElement('div');
        card.className = 'repair-card p-4 rounded-xl shadow-sm border relative group cursor-pointer transition-all duration-200 hover:shadow-md';
        card.style.backgroundColor = 'var(--color-card-bg)';
        card.style.borderColor = 'var(--color-border)';

        // LÓGICA DE ESTADO FORZADO:
        // "En estado debe poner (En progreso) dado que si estan en esta lista es porque tiene misma fecha que la actual."
        const displayStatus = "En Progreso";
        const statusClass = 'text-blue-500 bg-blue-100 dark:bg-blue-900/30'; // Estilo para En Progreso

        const priorityColors = {
            'alta': 'text-red-500',
            'high': 'text-red-500',
            'media': 'text-yellow-500',
            'medium': 'text-yellow-500',
            'baja': 'text-green-500',
            'low': 'text-green-500'
        };
        const priorityKey = item.priority ? item.priority.toLowerCase() : 'low';
        const priorityColor = priorityColors[priorityKey] || 'text-gray-500';

        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const monthIndex = (item.maintenance_month >= 1 && item.maintenance_month <= 12) ? item.maintenance_month - 1 : 0;
        const maintenanceDate = `${monthNames[monthIndex]} de ${item.maintenance_year}`;

        const priorityTranslations = {
            'high': 'Alta',
            'medium': 'Media',
            'low': 'Baja'
        };
        const priorityLower = (item.priority || 'baja').toLowerCase();
        const displayPriority = priorityTranslations[priorityLower] || (item.priority ? item.priority.charAt(0).toUpperCase() + item.priority.slice(1) : 'Baja');

        card.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <h3 class="font-bold text-lg truncate pr-8" style="color: var(--color-text-primary);">${item.location || 'Sin Ubicación'}</h3>
                <span class="text-xs font-medium px-2 py-1 rounded-full ${statusClass}">
                    ${displayStatus}
                </span>
            </div>
            
            <div class="text-sm mb-3 space-y-1" style="color: var(--color-text-secondary);">
                <p class="flex items-center gap-2">
                    <i class="ph ph-calendar-blank"></i>
                    ${maintenanceDate}
                </p>
                <p class="flex items-center gap-2">
                    <i class="ph ph-file-text"></i>
                    ${item.contract || 'N/A'}
                </p>
            </div>

            <div class="flex justify-between items-center mt-3 pt-3 border-t" style="border-color: var(--color-border);">
                <span class="text-sm font-semibold ${priorityColor}">
                    <i class="ph ph-warning-circle mr-1"></i> ${displayPriority}
                </span>
                
                <div class="flex gap-2">
                    <button class="action-btn map-btn p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-blue-500" 
                            title="Ver ubicación" onclick="event.stopPropagation(); window.openMaintenanceMap('${item.location}')">
                        <i class="ph ph-map-pin text-lg"></i>
                    </button>
                    <button class="action-btn complete-btn p-2 rounded-full hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors text-green-500" 
                            title="Completar Mantenimiento" onclick="event.stopPropagation(); window.confirmCompleteMaintenance('${item.id}')">
                        <i class="ph ph-check-circle text-lg"></i>
                    </button>
                </div>
            </div>
        `;

        // Evento de clic en la tarjeta para abrir el modal
        card.addEventListener('click', () => {
            showMaintenanceDetailsModal(item);
        });

        return card;
    }

    // ====================================
    // 4. ACCIONES GLOBALES (MAPA Y COMPLETAR)
    // ====================================

    window.openMaintenanceMap = function (location) {
        if (location) {
            window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`, '_blank');
        }
    };

    window.confirmCompleteMaintenance = async function (id) {
        if (!confirm('¿Marcar como completado?')) return;

        // Lógica de actualización de fecha:
        // - Si contrato es Anual: +1 Año
        // - Si contrato es Mensual (u otro): +1 Mes

        const updateLogic = (repair) => {
            let nextMonth = repair.maintenance_month;
            let nextYear = repair.maintenance_year;

            const isAnnual = repair.contract && repair.contract.toLowerCase().includes('anual');

            if (isAnnual) {
                nextYear += 1;
            } else {
                nextMonth += 1;
                if (nextMonth > 12) {
                    nextMonth = 1;
                    nextYear += 1;
                }
            }

            return {
                maintenance_month: nextMonth,
                maintenance_year: nextYear,
                status: 'Pendiente' // Reseteamos estado a pendiente para el futuro
            };
        };

        if (window.IS_MOCK_MODE || !isFirebaseReady) {
            try {
                let allRepairs = loadMaintenanceFromStorage();
                const index = allRepairs.findIndex(r => r.id === id);
                if (index !== -1) {
                    const updates = updateLogic(allRepairs[index]);
                    allRepairs[index] = { ...allRepairs[index], ...updates };

                    localStorage.setItem(MOCK_REPAIRS_KEY, JSON.stringify(allRepairs));
                    showMessage('success', 'Mantenimiento completado y reprogramado.');
                    window.fetchMaintenanceData();
                }
            } catch (e) {
                console.error("Error updating mock maintenance:", e);
                showMessage('error', 'Error al actualizar.');
            }
        } else {
            try {
                const repairsRef = getRepairsCollectionRef();
                if (repairsRef) {
                    // Primero necesitamos obtener el documento para saber su contrato actual
                    const doc = await repairsRef.doc(id).get();
                    if (doc.exists) {
                        const repair = doc.data();
                        const updates = updateLogic(repair);

                        await repairsRef.doc(id).update(updates);
                        showMessage('success', 'Mantenimiento completado y reprogramado.');
                        window.fetchMaintenanceData();
                    }
                }
            } catch (e) {
                console.error("Error updating firestore maintenance:", e);
                showMessage('error', 'Error al actualizar en base de datos.');
            }
        }
    };

    // ====================================
    // 4. INICIALIZACIÓN
    // ====================================

    function initMaintenance() {
        if (typeof window.applyColorMode === 'function') {
            window.applyColorMode();
        }

        // 🔑 Llamamos a la función principal para cargar los datos
        window.fetchMaintenanceData();

        console.log('Maintenance View inicializada.');
    }

    // Exponer acciones de mantenimiento para Buttons.js
    window.MaintenanceActions = {
        prevMonth: () => {
            currentViewDate.setMonth(currentViewDate.getMonth() - 1);
            window.fetchMaintenanceData();
        },
        nextMonth: () => {
            currentViewDate.setMonth(currentViewDate.getMonth() + 1);
            window.fetchMaintenanceData();
        }
    };

    // Hacer la función de inicialización global
    window.initMaintenanceView = initMaintenance;

    // ===================================================================================
    // FUNCIONES DEL MODAL DE DETALLES
    // ===================================================================================

    let currentEditMaintenanceId = null;

    function hideMaintenanceModal() {
        const modal = document.getElementById('maintenance-detail-modal');
        if (modal) modal.classList.add('hidden');
        currentEditMaintenanceId = null;
    }

    function getFormattedDate(month, year) {
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const monthIndex = (month >= 1 && month <= 12) ? month - 1 : 0;
        return `${monthNames[monthIndex]} de ${year}`;
    }

    function generateMaintenanceModalContent(item, isEditMode) {
        const priority = item.priority || 'Media';
        // Forzamos visualización "En Progreso" en el modal también si estamos en modo vista y coincide con la lista actual
        // Pero para ser consistentes con la tarjeta, lo mostraremos como "En Progreso" si no estamos editando.
        // Sin embargo, el usuario pidió "En estado debe poner (En progreso)..." refiriéndose a la lista.
        // En el modal, si mostramos los detalles reales, quizás deberíamos mostrar lo que hay en DB?
        // El usuario dijo "El estado completar lo usaremos mas adelante", lo que sugiere que el estado en DB no es fiable ahora mismo.
        // Asumiremos que en el modal también queremos ver "En Progreso" si venimos de la lista.
        const status = isEditMode ? (item.status || 'Pendiente') : 'En Progreso';

        const maintenanceDate = getFormattedDate(item.maintenance_month, item.maintenance_year);
        const contact = item.contact || {};

        // Helper para inputs
        const baseInput = (id, label, value, readOnly = true, type = 'text', customClass = 'detail-input') => `
            <div class="space-y-1">
                <label for="${id}" class="detail-label">${label}</label>
                <input id="${id}" type="${type}" value="${value || ''}" ${readOnly ? 'readonly' : ''} 
                        class="${customClass} w-full ${!readOnly && isEditMode ? 'editing' : ''}">
            </div>
        `;

        const baseTextarea = (id, label, value, readOnly = true, rows = 2, customClass = 'detail-input') => `
            <div class="space-y-1">
                <label for="${id}" class="detail-label">${label}</label>
                <textarea id="${id}" rows="${rows}" ${readOnly ? 'readonly' : ''} 
                        class="${customClass} w-full resize-none ${!readOnly && isEditMode ? 'editing' : ''}">${value || ''}</textarea>
            </div>
        `;

        const prioritySelect = (priorityValue, readOnly = true) => {
            const options = ['Alta', 'Media', 'Baja'];
            const optionHtml = options.map(opt =>
                `<option value="${opt}" ${priorityValue === opt ? 'selected' : ''}>${opt}</option>`
            ).join('');
            return `
            <div class="space-y-1">
                <label for="edit-priority" class="detail-label">Prioridad</label>
                <select id="edit-priority" ${readOnly ? 'disabled' : ''} class="detail-input w-full ${!readOnly ? 'editing' : ''}">
                    ${optionHtml}
                </select>
            </div>
            `;
        };

        const statusSelect = (statusValue, readOnly = true) => {
            const options = ['Pendiente', 'En Progreso', 'Completado'];
            const optionHtml = options.map(opt =>
                `<option value="${opt}" ${statusValue === opt ? 'selected' : ''}>${opt}</option>`
            ).join('');
            return `
            <div class="space-y-1">
                <label for="edit-status" class="detail-label">Estado</label>
                <select id="edit-status" ${readOnly ? 'disabled' : ''} class="detail-input w-full ${!readOnly ? 'editing' : ''}">
                    ${optionHtml}
                </select>
            </div>
            `;
        };

        let bodyContent = '';
        if (!isEditMode) {
            // MODO VISTA
            bodyContent = `
            <div class="modal-body p-4">
                <h3 class="text-lg font-bold mb-3" style="color: var(--color-accent-blue);">${item.location}</h3>
                <div class="grid grid-cols-2 gap-4 mb-4 text-sm">
                    <div class="space-y-1">
                        <label class="detail-label">Fecha Prevista</label>
                        <p class="detail-value-compact">${maintenanceDate}</p>
                    </div>
                    <div class="space-y-1">
                        <label class="detail-label">Modelo</label>
                        <p class="detail-value-compact">${item.model || 'N/A'}</p>
                    </div>
                    <div class="space-y-1">
                        <label class="detail-label">Contrato</label>
                        <p class="detail-value-compact">${item.contract}</p>
                    </div>
                    <div class="space-y-1">
                        <label class="detail-label">ID Clave/TAG</label>
                        <p class="detail-value-compact">${item.key_id || 'N/A'}</p>
                    </div>
                    <div class="space-y-1">
                        <label class="detail-label">Prioridad</label>
                        <p class="detail-value-compact">${priority}</p>
                    </div>
                    <div class="space-y-1">
                        <label class="detail-label">Estado</label>
                        <p class="detail-value-compact" style="color: var(--color-accent-blue);">${status}</p>
                    </div>
                </div>
                <div class="space-y-1 mb-4">
                    <label class="detail-label">Descripción</label>
                    <p class="detail-value-compact text-sm italic">${item.description || 'Sin descripción.'}</p>
                </div>
                ${(contact.name || contact.phone || contact.notes) ? `
                    <h3 class="text-sm font-semibold mt-2 mb-2" style="color: var(--color-accent-red);">Contacto</h3>
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div class="space-y-1">
                            <label class="detail-label">Nombre</label>
                            <p class="detail-value-compact">${contact.name || 'N/P'}</p>
                        </div>
                        <div class="space-y-1">
                            <label class="detail-label">Teléfono</label>
                            <p class="detail-value-compact">${contact.phone || 'N/P'}</p>
                        </div>
                    </div>
                    <div class="space-y-1 mt-4 text-sm">
                        <label class="detail-label">Notas de Contacto</label>
                        <p class="detail-value-compact italic">${contact.notes || 'Sin notas.'}</p>
                    </div>
                ` : `<p class="text-xs text-center p-2" style="color: var(--color-text-secondary);">No se incluyeron datos de contacto.</p>`}
            </div>
            `;
        } else {
            // MODO EDICIÓN
            bodyContent = `
            <div class="modal-body p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="col-span-1 md:col-span-2 space-y-2">
                    ${baseInput('edit-location', 'Ubicación', item.location, false)}
                </div>
                ${baseInput('edit-contract', 'Contrato', item.contract, false)}
                ${baseInput('edit-date', 'Fecha Prevista', '', false, 'month')}
                ${baseInput('edit-model', 'Modelo', item.model, false)}
                ${baseInput('edit-key_id', 'ID Clave', item.key_id, false)}
                ${prioritySelect(priority, false)}
                ${statusSelect(item.status, false)} 
                <div class="col-span-1 md:col-span-2 space-y-2">
                    ${baseTextarea('edit-description', 'Descripción', item.description, false, 3)}
                </div>
                <h3 class="col-span-1 md:col-span-2 text-lg font-semibold mt-2" style="color: var(--color-text-light);">Datos de Contacto</h3>
                ${baseInput('edit-contact_name', 'Nombre', contact.name, false)}
                ${baseInput('edit-contact_phone', 'Teléfono', contact.phone, false, 'tel')}
                <div class="col-span-1 md:col-span-2 space-y-2">
                    ${baseTextarea('edit-contact_notes', 'Notas', contact.notes, false, 2)}
                </div>
            </div>
            `;
        }

        const header = `
            <div class="modal-header">
                <h2 id="modal-title" class="text-xl font-bold">${isEditMode ? 'Editar Mantenimiento' : 'Detalles de Mantenimiento'}</h2>
                <div class="flex items-center gap-3">
                    <button id="edit-toggle-btn" class="edit-toggle-btn text-xl ${isEditMode ? 'active' : ''}" title="Alternar Modo Edición">
                        <i class="ph ph-pencil-simple-line"></i>
                    </button>
                    <button id="close-maintenance-modal-btn" class="secondary-icon-btn p-1 rounded-full"><i class="ph ph-x text-2xl"></i></button>
                </div>
            </div>
        `;

        const footer = `
            <div class="modal-footer flex justify-center p-4 border-t" style="border-color: var(--color-border);">
                <button id="save-edit-btn" class="primary-btn bg-green-600 ${isEditMode ? '' : 'hidden'} flex items-center gap-2">
                    <i class="ph ph-floppy-disk"></i><span>Guardar Cambios</span>
                </button>
            </div>
        `;

        return header + bodyContent + (isEditMode ? footer : '');
    }

    function showMaintenanceDetailsModal(item, isEditMode = false) {
        currentEditMaintenanceId = item.id;
        const modal = document.getElementById('maintenance-detail-modal');

        if (!modal) {
            createMaintenanceModalElement();
            return showMaintenanceDetailsModal(item, isEditMode);
        }

        modal.querySelector('.modal-content').innerHTML = generateMaintenanceModalContent(item, isEditMode);

        // Asignar eventos
        document.getElementById('close-maintenance-modal-btn').onclick = hideMaintenanceModal;

        const editBtn = document.getElementById('edit-toggle-btn');
        if (editBtn) {
            editBtn.onclick = () => {
                showMaintenanceDetailsModal(item, !isEditMode);
            };
        }

        const saveBtn = document.getElementById('save-edit-btn');
        if (saveBtn) {
            saveBtn.onclick = saveEditedMaintenance;
        }

        if (isEditMode) {
            configureMaintenanceEditInputs(item);
        }

        modal.classList.remove('hidden');
    }

    function configureMaintenanceEditInputs(item) {
        const monthString = String(item.maintenance_month).padStart(2, '0');
        const dateInput = document.getElementById('edit-date');
        if (dateInput) {
            dateInput.value = `${item.maintenance_year}-${monthString}`;
        }
    }

    async function saveEditedMaintenance() {
        const id = currentEditMaintenanceId;
        if (!id) return;

        const dateInput = document.getElementById('edit-date').value.split('-');
        const contactName = document.getElementById('edit-contact_name').value.trim() || null;
        const contactPhone = document.getElementById('edit-contact_phone').value.trim() || null;
        const contactNotes = document.getElementById('edit-contact_notes').value.trim() || null;

        const newValues = {
            location: document.getElementById('edit-location').value.trim(),
            model: document.getElementById('edit-model').value.trim() || null,
            contract: document.getElementById('edit-contract').value.trim(),
            key_id: document.getElementById('edit-key_id').value.trim() || null,
            maintenance_year: parseInt(dateInput[0]),
            maintenance_month: parseInt(dateInput[1]),
            priority: document.getElementById('edit-priority').value,
            status: document.getElementById('edit-status').value,
            description: document.getElementById('edit-description').value.trim(),
            contact: (contactName || contactPhone || contactNotes) ? {
                name: contactName,
                phone: contactPhone,
                notes: contactNotes
            } : null
        };

        if (!newValues.location || !newValues.contract) {
            showMessage('error', 'Ubicación y Contrato son obligatorios.');
            return;
        }

        try {
            let allRepairs = loadMaintenanceFromStorage();
            const index = allRepairs.findIndex(r => r.id === id);
            if (index !== -1) {
                allRepairs[index] = { ...allRepairs[index], ...newValues };
                localStorage.setItem(MOCK_REPAIRS_KEY, JSON.stringify(allRepairs));
                showMessage('success', 'Mantenimiento actualizado correctamente.');
                hideMaintenanceModal();
                window.fetchMaintenanceData();
            }
        } catch (error) {
            console.error("Error al actualizar mantenimiento:", error);
            showMessage('error', 'Error al guardar los cambios.');
        }
    }

    function createMaintenanceModalElement() {
        if (document.getElementById('maintenance-detail-modal')) return;

        const modalHtml = `
            <div id="maintenance-detail-modal" class="fixed inset-0 z-50 hidden bg-black bg-opacity-70 flex justify-center items-center p-4 transition-opacity duration-300">
                <div class="modal-content w-full max-w-xl rounded-xl shadow-2xl relative transition-transform duration-300"
                    style="background-color: var(--color-bg-secondary); color: var(--color-text-primary); max-height: 90vh; overflow-y: auto;">
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

})();