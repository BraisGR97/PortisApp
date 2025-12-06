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
            // alert(`${type.toUpperCase()}: ${message}`);
        }
    }

    // ----------------------------------------------------------------------------------
    // 🚨 FUNCIÓN MEJORADA: Inicialización más robusta
    // ----------------------------------------------------------------------------------
    async function setupFirebase() {
        // 2. Esperar la señal de Firebase Ready (CRÍTICO)
        if (typeof window.firebaseReadyPromise !== 'undefined') {
            await window.firebaseReadyPromise;
        } else {
            return;
        }

        // 3. Verificar estado después de la espera
        if (typeof window.db !== 'undefined' && window.db !== null && sessionStorage.getItem('portis-user-identifier')) {
            db = window.db;
            userId = sessionStorage.getItem('portis-user-identifier');
            isFirebaseReady = true;
        } else {
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

        if (!isFirebaseReady) {
            // Wait or handle not ready
        } else {
            // MODO FIREBASE
            maintenanceItems = await fetchMaintenanceFromFirestore(currentViewDate);
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

        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <h3 class="font-bold text-lg leading-tight pr-8">${item.location}</h3>
                <span class="text-xs font-bold px-2 py-1 rounded-full ${priorityBadgeClass}">${item.priority}</span>
            </div>
            
            <div class="grid grid-cols-2 gap-2 text-sm text-gray-500 dark:text-gray-400 mb-3">
                <div class="flex items-center gap-1">
                    <i class="ph ph-file-text"></i>
                    <span>${item.contract}</span>
                </div>
                <div class="flex items-center gap-1">
                    <i class="ph ph-wrench"></i>
                    <span>${item.model || 'N/A'}</span>
                </div>
            </div>

            ${item.description ? `
            <div class="mb-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <p class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Observaciones:</p>
                <p class="text-sm text-gray-700 dark:text-gray-300 italic">${item.description}</p>
            </div>
            ` : ''}

            <div class="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                <span class="text-xs text-gray-400">ID: ${item.key_id || '---'}</span>
                <button class="text-accent-magenta hover:text-white hover:bg-accent-magenta p-1.5 rounded-full transition-colors" 
                        onclick="event.stopPropagation(); window.openMaintenanceMap('${item.location}')" title="Ver Mapa">
                    <i class="ph ph-map-pin text-lg"></i>
                </button>
            </div>
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

    async function executeCompleteMaintenance(id, keepObservations) {
        try {
            let repair = null;
            if (isFirebaseReady) {
                const doc = await getRepairsCollectionRef().doc(id).get();
                if (doc.exists) repair = { id: doc.id, ...doc.data() };
            }

            if (!repair) {
                showMessage('error', 'No se encontró el mantenimiento.');
                return;
            }

            // Calcular próxima fecha
            let nextMonth = repair.maintenance_month;
            let nextYear = repair.maintenance_year;
            let increment = 1;

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

            // Historial
            const historyRecord = {
                ...repair,
                completedDate: new Date().toISOString(),
                completedBy: userId,
                original_month: repair.maintenance_month,
                original_year: repair.maintenance_year
            };
            delete historyRecord.id;

            // Update en Firebase
            if (isFirebaseReady) {
                const batch = db.batch();
                const repairRef = getRepairsCollectionRef().doc(id);
                // NOTA: El historial se guarda en la raiz 'users/{userId}/history' según diseño previo
                const historyRef = db.collection(`users/${userId}/history`).doc();

                batch.update(repairRef, {
                    maintenance_month: nextMonth,
                    maintenance_year: nextYear,
                    status: 'Pendiente', // Asegurar reset de estado
                    description: keepObservations ? (repair.description || '') : '' // Lógica de observaciones
                });
                batch.set(historyRef, historyRecord);

                await batch.commit();
            }

            showMessage('success', 'Mantenimiento completado.');
            hideMaintenanceModal();
            if (window.fetchMaintenanceData) window.fetchMaintenanceData();

        } catch (error) {
            console.error("Error completing maintenance:", error);
            showMessage('error', 'Error al completar la tarea.');
        }
    }

    window.confirmCompleteMaintenance = function (id) {
        const obsModal = document.getElementById('observation-retention-modal');
        if (obsModal) {
            obsModal.classList.remove('hidden');
            obsModal.classList.add('flex');

            const btnKeep = document.getElementById('btn-keep-obs');
            const btnDelete = document.getElementById('btn-delete-obs');

            // Reemplazar botones para eliminar listeners viejos
            if (btnKeep) {
                const newBtn = btnKeep.cloneNode(true);
                btnKeep.parentNode.replaceChild(newBtn, btnKeep);
                newBtn.onclick = () => {
                    obsModal.classList.add('hidden');
                    obsModal.classList.remove('flex');
                    executeCompleteMaintenance(id, true);
                };
            }

            if (btnDelete) {
                const newBtn = btnDelete.cloneNode(true);
                btnDelete.parentNode.replaceChild(newBtn, btnDelete);
                newBtn.onclick = () => {
                    obsModal.classList.add('hidden');
                    obsModal.classList.remove('flex');
                    executeCompleteMaintenance(id, false);
                };
            }
        } else {
            // Fallback
            if (confirm("¿Completar tarea?")) {
                executeCompleteMaintenance(id, false);
            }
        }
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

        // Helper para inputs (MODIFICADO: Texto estático si es readOnly)
        const baseInput = (id, label, value, readOnly = true, type = 'text', customClass = 'minimal-input') => {
            if (readOnly) {
                return `
                <div class="space-y-1">
                    <span class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">${label}</span>
                    <p class="text-sm font-medium text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-1">${value || '---'}</p>
                </div>
                `;
            }
            return `
            <div class="space-y-1">
                <label for="${id}" class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">${label}</label>
                <input id="${id}" type="${type}" value="${value || ''}" 
                        class="${customClass} w-full border-accent-magenta">
            </div>
            `;
        };

        const baseTextarea = (id, label, value, readOnly = true, rows = 2, customClass = 'minimal-input') => {
            if (readOnly) {
                return `
                <div class="space-y-1">
                    <span class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">${label}</span>
                    <p class="text-sm text-gray-700 dark:text-gray-300 italic whitespace-pre-wrap border-b border-gray-200 dark:border-gray-700 pb-1">${value || '---'}</p>
                </div>
                `;
            }
            return `
            <div class="space-y-1">
                <label for="${id}" class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">${label}</label>
                <textarea id="${id}" rows="${rows}" 
                        class="${customClass} w-full resize-none border-accent-magenta">${value || ''}</textarea>
            </div>
            `;
        };

        const prioritySelect = (priorityValue, readOnly = true) => {
            if (readOnly) {
                return `
                <div class="space-y-1">
                    <span class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Prioridad</span>
                    <p class="text-sm font-medium text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-1">${priorityValue}</p>
                </div>
                `;
            }
            const options = ['Alta', 'Media', 'Baja'];
            const optionHtml = options.map(opt =>
                `<option value="${opt}" ${priorityValue === opt ? 'selected' : ''}>${opt}</option>`
            ).join('');
            return `
            <div class="space-y-1">
                <label for="edit-priority" class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Prioridad</label>
                <select id="edit-priority" class="minimal-input w-full border-accent-magenta">
                    ${optionHtml}
                </select>
            </div>
            `;
        };

        const contractSelect = (contractValue, readOnly = true) => {
            if (readOnly) {
                return `
                <div class="space-y-1">
                    <span class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Contrato</span>
                    <p class="text-sm font-medium text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-1">${contractValue}</p>
                </div>
                `;
            }
            const options = ['Mensual', 'Bimensual', 'Trimestral', 'Cuatrimestral', 'Semestral', 'Anual'];
            const optionHtml = options.map(opt =>
                `<option value="${opt}" ${contractValue === opt ? 'selected' : ''}>${opt}</option>`
            ).join('');

            return `
                <div class="space-y-1">
                    <label for="edit-contract" class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Contrato</label>
                    <select id="edit-contract" class="minimal-input w-full border-accent-magenta">
                        ${optionHtml}
                    </select>
                </div>
            `;
        };

        let bodyContent = '';
        if (!isEditMode) {
            // MODO VISTA
            bodyContent = `
            <div class="p-6 space-y-4 relative">
                <!-- Botones Superiores -->
                <div class="flex justify-between items-center mb-2">
                    <button id="close-maintenance-modal-btn" class="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors border border-gray-300 dark:border-gray-600 rounded-full p-1 hover:border-gray-400 dark:hover:border-gray-500">
                        <i class="ph ph-x text-2xl"></i>
                    </button>
                    <button id="edit-toggle-btn" class="text-accent-magenta hover:text-accent-magenta/80 transition-colors p-2 rounded-full hover:bg-accent-magenta/10 border border-accent-magenta/30 hover:border-accent-magenta">
                        <i class="ph ph-pencil-simple text-2xl"></i>
                    </button>
                </div>

                <div class="flex justify-between items-start">
                    <h3 class="text-xl font-bold text-accent-magenta">${item.location}</h3>
                    <span class="px-2 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">${status}</span>
                </div>
                
                <div class="grid grid-cols-2 gap-4 text-sm mt-4">
                    ${baseInput('view-date', 'Fecha Prevista', maintenanceDate)}
                    ${baseInput('view-model', 'Modelo', item.model)}
                    ${contractSelect(item.contract)}
                    ${baseInput('view-key', 'ID Clave/TAG', item.key_id)}
                    ${prioritySelect(priority)}
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
            <div class="p-6 space-y-4">
                <h3 class="text-xl font-bold mb-4">Editar Mantenimiento</h3>
                
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

        // Footer con botones
        const footerContent = `
            <div class="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl">
                ${!isEditMode ? `
                    <button onclick="window.confirmCompleteMaintenance('${item.id}')" class="primary-btn w-full py-3 rounded-xl flex justify-center items-center gap-2 shadow-lg shadow-accent-magenta/20">
                        <i class="ph ph-check-circle text-xl"></i> 
                        <span class="text-lg">Completar Tarea</span>
                    </button>
                ` : `
                    <button id="edit-toggle-btn" class="secondary-btn rounded-lg">Cancelar</button>
                    <button id="save-edit-btn" class="primary-btn px-6 py-2 rounded-lg">Guardar</button>
                `}
            </div>
        `;

        return bodyContent + footerContent;
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
            if (!isFirebaseReady) {
                // Handle not ready
            } else {
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