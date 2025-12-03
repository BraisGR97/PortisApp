// ===================================================================================
// Maintenance.js - Lógica de la Vista de Mantenimientos (Pendientes)
// ===================================================================================

// Se asume que Firebase (compatibilidad) está disponible globalmente desde Main.js.
// Se asume que Main.js ha establecido window.db y window.auth tras el login.

(function () { // ⬅️ INICIO: IIFE para aislar el ámbito

    // ====================================
    // 1. CONFIGURACIÓN Y VARIABLES
    // ====================================

    let db = null; // Instancia de Firestore
    let userId = null; // ID del usuario autenticado
    let isFirebaseReady = false;

    let currentViewDate = new Date();
    let currentMaintenanceData = []; // Almacenar datos actuales para filtrado

    function showMessage(type, message) {
        if (typeof window.showAppMessage === 'function') {
            window.showAppMessage(type, message);
        } else {
            alert(`${type.toUpperCase()}: ${message}`);
        }
    }

    // ----------------------------------------------------------------------------------
    // 🚨 FUNCIÓN MEJORADA: Inicialización más robusta
    // ----------------------------------------------------------------------------------
    async function setupFirebase() {
        // 1. Esperar la señal de Firebase Ready (CRÍTICO)
        if (typeof window.firebaseReadyPromise !== 'undefined') {
            console.log("Maintenance.js: Esperando señal de Firebase Ready...");
            await window.firebaseReadyPromise;
        } else {
            console.error("Maintenance.js: Error. window.firebaseReadyPromise no encontrado.");
            return;
        }

        // 2. Verificar estado después de la espera
        if (typeof window.db !== 'undefined' && window.db !== null && sessionStorage.getItem('portis-user-identifier')) {
            db = window.db;
            userId = sessionStorage.getItem('portis-user-identifier');
            isFirebaseReady = true;
            console.log(`Maintenance.js: Conexión con Firestore establecida. User ID: ${userId}`);
        } else {
            console.error("Maintenance.js: Error. No hay ID de usuario o DB no está disponible.");
            showMessage('error', 'Error de sesión. Intente iniciar sesión nuevamente.');
        }
    }

    // Obtiene la referencia a la colección 'repairs' con la ruta users/{userId}/repairs
    function getRepairsCollectionRef() {
        if (!isFirebaseReady || !userId) return null;
        return db.collection(`users/${userId}/repairs`);
    }

    // ====================================
    // 2. LÓGICA DE CARGA DE DATOS
    // ====================================

    // Obtiene los mantenimientos para el mes y año actual desde Firestore.
    async function fetchMaintenanceFromFirestore(date) {
        if (!isFirebaseReady) return [];

        const targetMonth = date.getMonth() + 1;
        const targetYear = date.getFullYear();

        try {
            const repairsRef = getRepairsCollectionRef();
            if (!repairsRef) return [];

            // Consultar mantenimientos que coincidan con el mes y año, O que sean periódicos y toque este mes
            // Simplificación: Traemos todos los pendientes y filtramos en cliente por ahora para manejar la lógica de periodicidad compleja
            // En producción, esto debería ser una query compuesta optimizada.
            const snapshot = await repairsRef
                .where('status', '==', 'Pendiente')
                .get();

            const maintenanceList = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                // Filtrar localmente por mes/año si es necesario, o incluir lógica de periodicidad
                // Por ahora, asumimos que 'maintenance_month' y 'maintenance_year' indican la PRÓXIMA fecha
                if (data.maintenance_month === targetMonth && data.maintenance_year === targetYear) {
                    maintenanceList.push({ id: doc.id, ...data });
                }
            });

            return maintenanceList;

        } catch (error) {
            console.error("Error al obtener mantenimientos de Firestore:", error);
            showMessage('error', 'Error al cargar mantenimientos.');
            return [];
        }
    }

    // Función principal para obtener y renderizar mantenimientos.
    window.fetchMaintenanceData = async function () {
        const listContainer = document.getElementById('monthly-maintenance-list');
        const loadingSpinner = listContainer ? listContainer.querySelector('.loading-spinner') : null;
        const noDataMessage = document.getElementById('no-maintenance-message');
        const countDisplay = document.getElementById('monthly-count');
        const monthYearDisplay = document.getElementById('current-maintenance-month-year');

        if (monthYearDisplay) {
            const monthName = currentViewDate.toLocaleString('es-ES', { month: 'long' });
            monthYearDisplay.textContent = `${monthName} ${currentViewDate.getFullYear()}`;
        }

        if (loadingSpinner) loadingSpinner.style.display = 'block';
        if (noDataMessage) noDataMessage.classList.add('hidden');

        let maintenanceItems = [];

        if (isFirebaseReady) {
            // MODO FIREBASE
            maintenanceItems = await fetchMaintenanceFromFirestore(currentViewDate);
        } else {
            console.warn("Maintenance: Firebase no listo, no se pueden cargar datos.");
        }

        currentMaintenanceData = maintenanceItems; // Guardar para búsqueda

        if (loadingSpinner) loadingSpinner.style.display = 'none';

        if (maintenanceItems.length === 0) {
            if (listContainer) listContainer.innerHTML = '';
            if (noDataMessage) noDataMessage.classList.remove('hidden');
            if (countDisplay) countDisplay.textContent = '0';
        } else {
            renderMaintenanceList(maintenanceItems, currentViewDate);
            if (countDisplay) countDisplay.textContent = maintenanceItems.length;
        }
    }

    // ====================================
    // 3. LÓGICA DE RENDERIZADO Y NAVEGACIÓN
    // ====================================

    // Renderiza la lista de mantenimientos en la vista.
    function renderMaintenanceList(data, currentDate) {
        const listContainer = document.getElementById('monthly-maintenance-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        // Ordenar: Prioridad Alta primero, luego por ubicación
        data.sort((a, b) => {
            const priorityOrder = { 'Alta': 1, 'Media': 2, 'Baja': 3 };
            const pA = priorityOrder[a.priority] || 99;
            const pB = priorityOrder[b.priority] || 99;
            if (pA !== pB) return pA - pB;
            return a.location.localeCompare(b.location);
        });

        data.forEach(item => {
            const card = createMaintenanceCard(item);
            listContainer.appendChild(card);
        });
    }

    // Helpers para valores de prioridad y contrato (para ordenamiento si fuera necesario)
    renderMaintenanceList.priorityValue = function (p) {
        if (p === 'Alta') return 3;
        if (p === 'Media') return 2;
        return 1;
    };

    renderMaintenanceList.contractValue = function (c) {
        if (c === 'Mensual') return 1;
        if (c === 'Trimestral') return 3;
        if (c === 'Semestral') return 6;
        if (c === 'Anual') return 12;
        return 0;
    };

    // Crea la tarjeta HTML para un mantenimiento individual (DISEÑO ACTUALIZADO).
    function createMaintenanceCard(item) {
        const div = document.createElement('div');
        // Usamos la clase maintenance-item definida en Main.css
        div.className = 'maintenance-item group relative overflow-hidden';

        // Determinar color de borde según prioridad
        let priorityColorClass = 'border-l-4 border-l-gray-400';
        let priorityBadgeClass = 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';

        if (item.priority === 'Alta') {
            priorityColorClass = 'border-l-4 border-l-red-500';
            priorityBadgeClass = 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400';
        } else if (item.priority === 'Media') {
            priorityColorClass = 'border-l-4 border-l-orange-500';
            priorityBadgeClass = 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400';
        } else {
            priorityColorClass = 'border-l-4 border-l-green-500';
            priorityBadgeClass = 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400';
        }

        div.classList.add(priorityColorClass.split(' ')[0], priorityColorClass.split(' ')[1]);

        // Mostrar observaciones solo si existen
        const descriptionHtml = item.description ?
            `<div class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                <p class="text-xs text-gray-500 italic line-clamp-2">${item.description}</p>
             </div>` : '';

        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <h3 class="font-bold text-lg leading-tight pr-8">${item.location}</h3>
                <span class="text-xs font-bold px-2 py-1 rounded-full ${priorityBadgeClass}">${item.priority}</span>
            </div>
            
            <div class="grid grid-cols-2 gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
                <div class="flex items-center gap-1">
                    <i class="ph ph-file-text"></i>
                    <span>${item.contract}</span>
                </div>
                <div class="flex items-center gap-1">
                    <i class="ph ph-wrench"></i>
                    <span>${item.model || 'N/A'}</span>
                </div>
            </div>

            <div class="flex justify-between items-center mt-1">
                <span class="text-xs text-gray-400">ID: ${item.key_id || '---'}</span>
                <button class="text-accent-magenta hover:text-white hover:bg-accent-magenta p-1.5 rounded-full transition-colors" 
                        onclick="event.stopPropagation(); window.openMaintenanceMap('${item.location}')" title="Ver Mapa">
                    <i class="ph ph-map-pin text-lg"></i>
                </button>
            </div>

            ${descriptionHtml}
        `;

        // Evento de clic para abrir detalles
        div.onclick = () => showMaintenanceDetailsModal(item);

        return div;
    }

    // ====================================
    // 4. ACCIONES GLOBALES (MAPA Y COMPLETAR)
    // ====================================

    window.openMaintenanceMap = function (location) {
        const query = encodeURIComponent(location);
        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
    }

    window.confirmCompleteMaintenance = function (id) {
        // Crear modal de confirmación dinámicamente si no existe
        let confirmModal = document.getElementById('confirm-complete-modal');
        if (!confirmModal) {
            const modalHtml = `
                <div id="confirm-complete-modal" class="fixed inset-0 z-[60] hidden items-center justify-center p-4 modal-backdrop">
                    <div class="modal-content w-full max-w-sm rounded-xl p-6 text-center bg-white dark:bg-[#1f1f33]">
                        <div class="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600 dark:text-green-400">
                            <i class="ph ph-check text-3xl"></i>
                        </div>
                        <h3 class="text-xl font-bold mb-2">¿Completar Tarea?</h3>
                        <p class="mb-6 text-sm text-gray-500">Se registrará en el historial y se programará el próximo mantenimiento.</p>
                        <div class="flex justify-center space-x-3">
                            <button id="cancel-complete-btn" class="secondary-btn w-1/2 rounded-lg">Cancelar</button>
                            <button id="confirm-complete-action-btn" class="primary-btn w-1/2 bg-green-600 hover:bg-green-700 border-none rounded-lg">Confirmar</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            confirmModal = document.getElementById('confirm-complete-modal');
        }

        // Mostrar modal
        confirmModal.classList.remove('hidden');
        confirmModal.classList.add('flex');

        // Configurar botones
        const cancelBtn = document.getElementById('cancel-complete-btn');
        const confirmBtn = document.getElementById('confirm-complete-action-btn');

        // Función para cerrar modal
        const closeModal = () => {
            confirmModal.classList.add('hidden');
            confirmModal.classList.remove('flex');
        };

        cancelBtn.onclick = closeModal;

        confirmBtn.onclick = async () => {
            closeModal();

            // Lógica de completado
            try {
                // 1. Obtener el mantenimiento actual
                let repair = null;
                if (isFirebaseReady) {
                    const doc = await getRepairsCollectionRef().doc(id).get();
                    if (doc.exists) repair = { id: doc.id, ...doc.data() };
                }

                if (!repair) {
                    showMessage('error', 'No se encontró el mantenimiento.');
                    return;
                }

                // 2. Calcular próxima fecha según contrato
                let nextMonth = repair.maintenance_month;
                let nextYear = repair.maintenance_year;
                let increment = 1; // Default Mensual

                switch (repair.contract) {
                    case 'Mensual': increment = 1; break;
                    case 'Bimensual': increment = 2; break;
                    case 'Trimestral': increment = 3; break;
                    case 'Cuatrimestral': increment = 4; break;
                    case 'Semestral': increment = 6; break;
                    case 'Anual': increment = 12; break;
                }

                nextMonth += increment;
                while (nextMonth > 12) {
                    nextMonth -= 12;
                    nextYear++;
                }

                // 3. Crear registro de historial
                const historyRecord = {
                    ...repair,
                    completedDate: new Date().toISOString(),
                    completedBy: userId || 'unknown',
                    original_month: repair.maintenance_month,
                    original_year: repair.maintenance_year
                };
                delete historyRecord.id; // No guardar el ID original en el historial

                // 4. Actualizar DB
                if (isFirebaseReady) {
                    // FIREBASE
                    const batch = db.batch();
                    const repairRef = getRepairsCollectionRef().doc(id);
                    const historyRef = db.collection(`users/${userId}/history`).doc();

                    batch.update(repairRef, {
                        maintenance_month: nextMonth,
                        maintenance_year: nextYear,
                        description: '' // Limpiar observaciones
                    });
                    batch.set(historyRef, historyRecord);

                    await batch.commit();
                }

                showMessage('success', 'Mantenimiento completado y reprogramado.');
                hideMaintenanceModal(); // Cerrar modal de detalles si está abierto
                window.fetchMaintenanceData(); // Recargar lista

            } catch (error) {
                console.error("Error al completar mantenimiento:", error);
                showMessage('error', 'Error al completar la tarea.');
            }
        };
    }

    window.toggleMaintenanceSearch = function () {
        const container = document.getElementById('maintenance-search-container');
        const input = document.getElementById('maintenance-search-input');

        if (container.classList.contains('hidden')) {
            container.classList.remove('hidden');
            input.focus();
        } else {
            container.classList.add('hidden');
            input.value = '';
            // Restaurar lista completa
            renderMaintenanceList(currentMaintenanceData, currentViewDate);
        }
    }

    // Listener para búsqueda en tiempo real
    document.addEventListener('DOMContentLoaded', () => {
        const searchInput = document.getElementById('maintenance-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = currentMaintenanceData.filter(item =>
                    item.location.toLowerCase().includes(term) ||
                    (item.description && item.description.toLowerCase().includes(term))
                );
                renderMaintenanceList(filtered, currentViewDate);
            });
        }
    });

    // ====================================
    // 4. INICIALIZACIÓN
    // ====================================

    function initMaintenance() {
        // Aplicar tema
        if (typeof window.applyColorMode === 'function') {
            window.applyColorMode();
        }

        setupFirebase().then(() => {
            window.fetchMaintenanceData();
        });
    }

    // Exponer acciones de mantenimiento para Buttons.js
    window.MaintenanceActions = {
        prevMonth: () => {
            // Implementar si se añade navegación por meses en el futuro
        },
        nextMonth: () => {
            // Implementar si se añade navegación por meses en el futuro
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
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }

    function getFormattedDate(month, year) {
        const date = new Date(year, month - 1);
        return date.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
    }

    function generateMaintenanceModalContent(item, isEditMode) {
        const priority = item.priority || 'Media';
        const status = isEditMode ? (item.status || 'Pendiente') : 'En Progreso';
        const maintenanceDate = getFormattedDate(item.maintenance_month, item.maintenance_year);
        const contact = item.contact || {};

        // Helper para inputs
        const baseInput = (id, label, value, readOnly = true, type = 'text', customClass = 'minimal-input') => `
            <div class="space-y-1">
                <label for="${id}" class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">${label}</label>
                <input id="${id}" type="${type}" value="${value || ''}" ${readOnly ? 'readonly' : ''} 
                        class="${customClass} w-full ${!readOnly && isEditMode ? 'border-accent-magenta' : ''}">
            </div>
        `;

        const baseTextarea = (id, label, value, readOnly = true, rows = 2, customClass = 'minimal-input') => `
            <div class="space-y-1">
                <label for="${id}" class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">${label}</label>
                <textarea id="${id}" rows="${rows}" ${readOnly ? 'readonly' : ''} 
                        class="${customClass} w-full resize-none ${!readOnly && isEditMode ? 'border-accent-magenta' : ''}">${value || ''}</textarea>
            </div>
        `;

        const prioritySelect = (priorityValue, readOnly = true) => {
            const options = ['Alta', 'Media', 'Baja'];
            const optionHtml = options.map(opt =>
                `<option value="${opt}" ${priorityValue === opt ? 'selected' : ''}>${opt}</option>`
            ).join('');
            return `
            <div class="space-y-1">
                <label for="edit-priority" class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Prioridad</label>
                <select id="edit-priority" ${readOnly ? 'disabled' : ''} class="minimal-input w-full ${!readOnly ? 'border-accent-magenta' : ''}">
                    ${optionHtml}
                </select>
            </div>
            `;
        };

        const contractSelect = (contractValue, readOnly = true) => {
            const options = ['Mensual', 'Bimensual', 'Trimestral', 'Cuatrimestral', 'Semestral', 'Anual'];
            const optionHtml = options.map(opt =>
                `<option value="${opt}" ${contractValue === opt ? 'selected' : ''}>${opt}</option>`
            ).join('');

            return `
                <div class="space-y-1">
                    <label for="edit-contract" class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Contrato</label>
                    <select id="edit-contract" ${readOnly ? 'disabled' : ''} class="minimal-input w-full ${!readOnly ? 'border-accent-magenta' : ''}">
                        ${optionHtml}
                    </select>
                </div>
            `;
        };

        // HEADER: Botones de Cerrar y Editar arriba
        const headerContent = `
            <div class="flex justify-between items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
                <h3 class="text-xl font-bold text-accent-magenta">${isEditMode ? 'Editar Mantenimiento' : item.location}</h3>
                <div class="flex gap-2">
                    <button id="edit-toggle-btn" class="secondary-icon-btn p-2 rounded-lg" title="${isEditMode ? 'Cancelar Edición' : 'Editar'}">
                        <i class="ph ${isEditMode ? 'ph-x' : 'ph-pencil-simple'} text-xl"></i>
                    </button>
                    <button id="close-maintenance-modal-btn" class="secondary-icon-btn p-2 rounded-lg" title="Cerrar">
                        <i class="ph ph-x text-xl"></i>
                    </button>
                </div>
            </div>
        `;

        let bodyContent = '';
        if (!isEditMode) {
            // MODO VISTA
            bodyContent = `
            <div class="space-y-4">
                <div class="flex justify-between items-center">
                    <span class="px-2 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">${status}</span>
                </div>
                
                <div class="grid grid-cols-2 gap-4 text-sm">
                    ${baseInput('view-date', 'Fecha Prevista', maintenanceDate)}
                    ${baseInput('view-model', 'Modelo', item.model)}
                    ${baseInput('view-contract', 'Contrato', item.contract)}
                    ${baseInput('view-key', 'ID Clave/TAG', item.key_id)}
                    ${baseInput('view-priority', 'Prioridad', priority)}
                    ${baseInput('view-status', 'Estado', status)}
                </div>
    
                ${baseTextarea('view-desc', 'Observaciones', item.description)}
    
                ${(contact.name || contact.phone) ? `
                    <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
                        <h4 class="text-sm font-bold mb-2 text-gray-500 uppercase">Contacto</h4>
                        <div class="grid grid-cols-2 gap-4">
                            ${baseInput('view-contact-name', 'Nombre', contact.name)}
                            ${baseInput('view-contact-phone', 'Teléfono', contact.phone)}
                        </div>
                    </div>
                ` : ''}
            </div>
            `;
        } else {
            // MODO EDICION
            bodyContent = `
            <div class="space-y-4">
                ${baseInput('edit-location', 'Ubicación', item.location, false)}
                
                <div class="grid grid-cols-2 gap-4">
                    ${baseInput('edit-model', 'Modelo', item.model, false)}
                    ${baseInput('edit-key', 'ID Clave/TAG', item.key_id, false)}
                    ${prioritySelect(priority, false)}
                    ${contractSelect(item.contract, false)}
                </div>
    
                ${baseTextarea('edit-desc', 'Observaciones', item.description, false, 3)}
    
                <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <h4 class="text-sm font-bold mb-2 text-gray-500 uppercase">Contacto</h4>
                    <div class="grid grid-cols-2 gap-4">
                        ${baseInput('edit-contact-name', 'Nombre', contact.name, false)}
                        ${baseInput('edit-contact-phone', 'Teléfono', contact.phone, false)}
                    </div>
                </div>
            </div>
            `;
        }

        // Footer con botones (Solo Completar o Guardar)
        const footerContent = `
            <div class="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                ${!isEditMode ? `
                    <button onclick="window.confirmCompleteMaintenance('${item.id}')" class="primary-btn px-4 py-2 rounded-lg flex items-center gap-2 w-full justify-center">
                        <i class="ph ph-check-circle text-lg"></i> Completar Tarea
                    </button>
                ` : `
                    <button id="save-edit-btn" class="primary-btn px-6 py-2 rounded-lg w-full justify-center">Guardar Cambios</button>
                `}
            </div>
        `;

        return `<div class="p-6">${headerContent}${bodyContent}${footerContent}</div>`;
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
        const closeBtn = document.getElementById('close-maintenance-modal-btn');
        if (closeBtn) closeBtn.onclick = hideMaintenanceModal;

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
        modal.classList.add('flex');
    }

    function configureMaintenanceEditInputs(item) {
        // Lógica adicional para inputs complejos si fuera necesaria
    }

    async function saveEditedMaintenance() {
        const id = currentEditMaintenanceId;
        if (!id) return;

        const contactName = document.getElementById('edit-contact-name').value.trim() || null;
        const contactPhone = document.getElementById('edit-contact-phone').value.trim() || null;

        const newValues = {
            location: document.getElementById('edit-location').value.trim(),
            model: document.getElementById('edit-model').value.trim() || null,
            contract: document.getElementById('edit-contract').value.trim(),
            key_id: document.getElementById('edit-key').value.trim() || null,
            priority: document.getElementById('edit-priority').value,
            description: document.getElementById('edit-desc').value.trim(),
            contact: (contactName || contactPhone) ? {
                name: contactName,
                phone: contactPhone
            } : null
        };

        if (!newValues.location || !newValues.contract) {
            showMessage('error', 'Ubicación y Contrato son obligatorios.');
            return;
        }

        try {
            if (isFirebaseReady) {
                // MODO FIREBASE
                const repairsRef = getRepairsCollectionRef();
                if (!repairsRef) {
                    throw new Error("No se pudo obtener referencia a la colección de reparaciones.");
                }

                await repairsRef.doc(id).update(newValues);
                showMessage('success', 'Mantenimiento actualizado correctamente en la nube.');
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
            <div id="maintenance-detail-modal" class="fixed inset-0 z-50 hidden bg-black bg-opacity-70 flex justify-center items-center p-4 transition-opacity duration-300 modal-backdrop">
                <div class="modal-content w-full max-w-lg rounded-xl shadow-2xl relative transition-transform duration-300 overflow-hidden"
                    style="background-color: var(--color-bg-secondary); color: var(--color-text-primary); max-height: 90vh; overflow-y: auto;">
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

})();