/**
 * ====================================================================
 * Repairs.js - Lógica de Mantenimientos (CRUD y UI)
 * ====================================================================
 */

// Se asume que window.firebaseConfig, window.IS_MOCK_MODE, window.db, window.auth, 
// y window.firebaseReadyPromise están definidos en Config.js y Main.js.

let userId = sessionStorage.getItem('portis-user-identifier') || null;
let currentEditRepairId = null;
let isModuleSetupComplete = false;
let IS_MOCK_MODE = window.IS_MOCK_MODE;

if (IS_MOCK_MODE) {
    console.warn("Modo MOCK: Las operaciones de Firestore serán simuladas.");
}

// Variables de UI
const DOM = {
    form: document.getElementById('new-repair-form'),
    card: document.getElementById('new-repair-card'),
    listContainer: document.getElementById('repairs-list'),
    fabButton: document.getElementById('show-repair-form-fab'),
    monthInput: document.getElementById('month'),
    yearInput: document.getElementById('year'),
};


// ===================================================================================
// 1. LÓGICA ESPECÍFICA PARA EL MODO MOCK (ALMACENAMIENTO LOCAL)
// ===================================================================================

const MOCK_STORAGE_KEY = 'portis-repairs-mock'; // 🔑 CLAVE UNIFORME para el CRUD

function loadMockRepairs() {
    try {
        const repairsJson = localStorage.getItem(MOCK_STORAGE_KEY);
        let repairs = repairsJson ? JSON.parse(repairsJson) : [];

        if (repairs.length === 0) {
            console.log("Creando datos mock iniciales de Mantenimiento.");
            repairs = [
                {
                    id: 'MOCK-R1',
                    location: 'Oficina Central - Piso 3',
                    model: 'HVAC-2000',
                    key_id: null,
                    contract: 'Anual',
                    maintenance_month: 11,
                    maintenance_year: 2025,
                    description: 'Revisión y cambio de filtros anual.',
                    priority: 'Alta',
                    status: 'Pendiente',
                    timestamp: Date.now() + 500000
                },
                {
                    id: 'MOCK-R2',
                    location: 'Almacén 5',
                    model: 'Elevador Carga',
                    key_id: 'TAG-1234',
                    contract: 'Mensual',
                    maintenance_month: 10,
                    maintenance_year: 2025,
                    description: 'Lubricación preventiva.',
                    priority: 'Media',
                    status: 'Completado',
                    timestamp: Date.now() - 50000
                },
            ];
            saveMockRepairs(repairs);
        }
        return repairs;
    } catch (e) {
        console.error("Error al cargar mantenimientos mock:", e);
        return [];
    }
}

function saveMockRepairs(repairs) {
    try {
        localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(repairs));
    } catch (e) {
        console.error("Error al guardar mantenimientos mock:", e);
    }
}

function addMockRepairAndRefresh(newRepair) {
    const repairs = loadMockRepairs();
    // 🔑 Generar un ID único para el mock
    newRepair.id = `MOCK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    repairs.unshift(newRepair);
    saveMockRepairs(repairs);
    renderRepairs(repairs);
    console.log("Mantenimiento mock guardado y lista actualizada.");
}

function editMockRepairAndRefresh(id, newValues) {
    let repairs = loadMockRepairs();
    const index = repairs.findIndex(repair => repair.id === id);
    if (index !== -1) {
        // Preservar el timestamp original (si es relevante) y el ID.
        repairs[index] = { ...repairs[index], ...newValues };
        saveMockRepairs(repairs);
        renderRepairs(repairs);
        console.log(`Mantenimiento mock ID: ${id} editado.`);
    } else {
        console.error("No se encontró el mantenimiento mock para editar:", id);
    }
}

function deleteMockRepairAndRefresh(id) {
    let repairs = loadMockRepairs();
    repairs = repairs.filter(repair => repair.id !== id);
    saveMockRepairs(repairs);
    renderRepairs(repairs);
    console.log(`Mantenimiento mock ID: ${id} eliminado.`);
}

// ===================================================================================
// 2. FUNCIONES DE UI Y MODAL
// ===================================================================================

const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function getFormattedDate(month, year) {
    const monthIndex = (month >= 1 && month <= 12) ? month - 1 : 0;
    return `${monthNames[monthIndex]} de ${year}`;
}

/**
 * Muestra u oculta el formulario de creación/edición (tarjeta superior)
 */
window.toggleNewRepairForm = function () {
    if (!DOM.card || !DOM.fabButton || !DOM.form) return;

    const isFormHidden = DOM.card.classList.contains('hidden');

    DOM.card.classList.toggle('hidden', !isFormHidden);
    DOM.fabButton.classList.toggle('rotate-45', isFormHidden);

    const icon = DOM.fabButton.querySelector('i');
    icon.className = isFormHidden ? 'ph ph-x text-2xl' : 'ph ph-plus text-2xl';

    if (isFormHidden) {
        // Abriendo el formulario de creación
        DOM.form.reset();
        window.toggleContactFields(false);
        const today = new Date();
        DOM.monthInput.value = today.getMonth() + 1;
        DOM.yearInput.value = today.getFullYear();
        DOM.card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        // Cerrando, volver a cargar la lista para reflejar cualquier cambio
        if (IS_MOCK_MODE) {
            renderRepairs(loadMockRepairs());
        } else if (window.db) {
            // Firestore Listener ya se encarga de recargar si hubo cambios
        }
    }
}

window.toggleContactFields = function (isInit = true) {
    const contactFields = document.getElementById('contact-fields');
    const contactCheckbox = document.getElementById('contact_checkbox');
    if (contactFields && contactCheckbox) {
        // Si isInit es false, se está reseteando el formulario, ocultar por defecto
        if (typeof isInit === 'boolean' && !isInit) {
            contactFields.classList.add('hidden');
        } else {
            contactFields.classList.toggle('hidden', !contactCheckbox.checked);
        }
    }
}

// Nota: Las funciones showRepairDetailsModal, hideModal, saveEditedRepair, toggleModalEditMode y generateModalContent
// requieren el elemento MODAL. Asumiremos que el HTML lo tiene o lo creamos dinámicamente.

function hideModal() {
    const modal = document.getElementById('repair-detail-modal');
    if (modal) modal.classList.add('hidden');
    currentEditRepairId = null;
}

function showRepairDetailsModal(repair, isEditMode = false) {
    currentEditRepairId = repair.id;
    const modal = document.getElementById('repair-detail-modal');
    if (!modal) {
        console.error("Modal element not found.");
        return;
    }

    // 🔑 USAMOS LA FUNCIÓN EXISTENTE PARA GENERAR EL CONTENIDO
    modal.querySelector('.modal-content').innerHTML = generateModalContent(repair, isEditMode);

    document.getElementById('close-modal-btn').onclick = hideModal;
    document.getElementById('edit-toggle-btn').onclick = () => toggleModalEditMode(repair);

    const saveButton = document.getElementById('save-edit-btn');
    if (saveButton) {
        saveButton.onclick = saveEditedRepair;
    }

    if (isEditMode) {
        configureEditInputs(repair);
    }

    modal.classList.remove('hidden');
}

function toggleModalEditMode(repair) {
    const actualRepair = window.repairsDataMap ? window.repairsDataMap.get(repair.id) || repair : repair;
    const isCurrentlyEditing = document.getElementById('save-edit-btn')?.classList.contains('hidden') === false;
    showRepairDetailsModal(actualRepair, !isCurrentlyEditing);
}

// La función 'generateModalContent' se mantiene como está en tu código base.

function configureEditInputs(repair) {
    // 🔑 Asegura que la fecha se cargue correctamente en el input type="month"
    const originalRepair = window.repairsDataMap ? window.repairsDataMap.get(currentEditRepairId) || repair : repair;

    const monthString = String(originalRepair.maintenance_month).padStart(2, '0');

    const dateInput = document.getElementById('edit-date');
    if (dateInput) {
        dateInput.value = `${originalRepair.maintenance_year}-${monthString}`;
    }
}

// ===================================================================================
// 3. FUNCIÓN DE INICIALIZACIÓN Y CONFIGURACIÓN
// ===================================================================================

async function startRepairsModule() {
    if (isModuleSetupComplete) return;

    // Esperar a que Firebase/Mock Mode se configure
    // FIX: Si ya estamos en modo MOCK, no esperamos innecesariamente
    if (!window.IS_MOCK_MODE && typeof window.firebaseReadyPromise !== 'undefined') {
        await window.firebaseReadyPromise;
    }

    // 🔑 Releer la variable global después de la espera
    IS_MOCK_MODE = window.IS_MOCK_MODE;

    console.warn(`🛠️ Repairs.js: Modo de Operación Final: ${IS_MOCK_MODE ? 'MOCK' : 'NORMAL (Firebase)'}`);

    userId = sessionStorage.getItem('portis-user-identifier');

    // 🔑 FIX: Si estamos en MOCK y no hay userId, inicializarlo
    if (IS_MOCK_MODE && !userId) {
        userId = window.MOCK_USER_ID || 'mock-admin-id';
        sessionStorage.setItem('portis-user-identifier', userId);
        sessionStorage.setItem('portis-user-display-name', window.MOCK_USER_DISPLAY_NAME || 'Admin');
        console.log("Repairs.js: Mock User ID inicializado en sessionStorage.");
    }

    // 2. Configurar el display name (Aplica la regla de Admin para MOCK)
    const userDisplayName = sessionStorage.getItem('portis-user-display-name');
    const displayElement = document.getElementById('current-user-display');

    if (displayElement) {
        if (IS_MOCK_MODE) {
            // **FUERZA LA VISUALIZACIÓN DE ADMIN EN MOCK MODE** (Según tu regla)
            displayElement.textContent = "Admin";
        } else {
            displayElement.textContent = userDisplayName || (userId ? userId.substring(0, 10) + '...' : 'Usuario');
        }
    }


    // 3. Configurar UI/Listeners
    const today = new Date();
    if (DOM.monthInput) DOM.monthInput.value = today.getMonth() + 1;
    if (DOM.yearInput) DOM.yearInput.value = today.getFullYear();
    if (DOM.form) DOM.form.addEventListener('submit', addRepair);
    document.getElementById('contact_checkbox').addEventListener('change', window.toggleContactFields);
    createModalElement();

    // 4. Cargar datos (Mock o Firebase)
    if (!IS_MOCK_MODE) {
        console.log("Repairs.js: Configurando listener de Firestore.");
        setupRepairsListener();
    } else {
        // **FLUJO MOCK (Local Storage)**
        console.warn("Repairs.js: Modo MOCK activado. Cargando datos.");
        const repairs = loadMockRepairs();
        renderRepairs(repairs);
    }

    isModuleSetupComplete = true;
}

function createModalElement() {
    if (document.getElementById('repair-detail-modal')) return;

    const modalHtml = `
        <div id="repair-detail-modal" class="fixed inset-0 z-50 hidden bg-black bg-opacity-70 flex justify-center items-center p-4 transition-opacity duration-300">
            <div class="modal-content w-full max-w-xl rounded-xl shadow-2xl relative transition-transform duration-300" 
                 style="background-color: var(--color-bg-secondary); color: var(--color-text-primary); max-height: 90vh; overflow-y: auto;">
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// 🔑 Punto de enganche global
window.startRepairsModule = startRepairsModule;


// ===================================================================================
// 4. FUNCIONES DE FIREBASE (CRUD)
// ===================================================================================

function getRepairsCollectionRef() {
    const currentUserId = sessionStorage.getItem('portis-user-identifier');

    if (!currentUserId || !window.db || !window.db.collection) {
        // Si estamos en modo MOCK, esto no debería importar
        if (!IS_MOCK_MODE) {
            console.error("Intentando acceder a Firestore sin un userId válido o db no inicializada.");
        }
        return null;
    }
    return window.db.collection(`users/${currentUserId}/repairs`);
}

function setupRepairsListener() {
    const repairsRef = getRepairsCollectionRef();
    if (!repairsRef) return;

    repairsRef.orderBy('maintenance_year', 'asc').orderBy('maintenance_month', 'asc')
        .onSnapshot(snapshot => {
            const repairs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            console.log(`Repairs.js: ${repairs.length} mantenimientos recibidos de Firestore.`);
            renderRepairs(repairs);
        }, error => {
            console.error("Error en el listener de Firestore:", error);
        });
}

/**
 * Maneja la creación de un nuevo mantenimiento (Mock o Firebase).
 */
async function addRepair(e) {
    e.preventDefault();

    // 🔑 Sincronizar estado global por seguridad
    if (window.IS_MOCK_MODE) IS_MOCK_MODE = true;

    // 🔑 Fallback: Si no hay DB, forzar modo Mock
    if (!IS_MOCK_MODE && (!window.db || !window.db.collection)) {
        console.warn("Firestore no detectado. Forzando modo MOCK para esta operación.");
        IS_MOCK_MODE = true;
    }

    const currentUserId = sessionStorage.getItem('portis-user-identifier');

    if (!currentUserId && !IS_MOCK_MODE) return console.warn("Falta ID de usuario para Firestore.");

    // 🔑 Recolección de datos
    const form = document.getElementById('new-repair-form');
    const location = form.location.value.trim();
    const model = form.model.value.trim();
    const key_id = form.key_id.value.trim();
    const contract = form.contract.value;
    const monthInput = form.month.value;
    const yearInput = form.year.value;

    const description = form.description.value.trim() || 'Mantenimiento preventivo programado.';
    const priority = form.priority.value || 'Media';

    const contactChecked = form.contact_checkbox.checked;
    let contactData = {};
    if (contactChecked) {
        contactData.name = form.contact_name.value.trim() || null;
        contactData.phone = form.contact_phone.value.trim() || null;
        contactData.notes = form.contact_notes.value.trim() || null;
        contactData = Object.fromEntries(
            Object.entries(contactData).filter(([_, v]) => v !== null && v !== '')
        );
    }

    const month = parseInt(monthInput);
    const year = parseInt(yearInput);

    if (!location || !contract || isNaN(month) || isNaN(year) || month < 1 || month > 12 || year < 2000) {
        console.error('Validación fallida: Rellena los campos obligatorios.');
        return;
    }

    // Calcular estado dinámico inicial
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    let initialStatus = 'Pendiente';

    if (contract === 'Anual') {
        if (year === currentYear) initialStatus = 'En Progreso';
    } else {
        if (year === currentYear && month === currentMonth) initialStatus = 'En Progreso';
    }

    const repairData = {
        location,
        model: model || null,
        key_id: key_id || null,
        contract,
        maintenance_month: month,
        maintenance_year: year,
        description: description,
        priority: priority,
        status: initialStatus,
        userId: currentUserId || 'mock-user-id',
        timestamp: Date.now(),
        contact: contactData,
    };

    if (IS_MOCK_MODE) {
        addMockRepairAndRefresh(repairData);
        form.reset();
        window.toggleNewRepairForm();
        return;
    }

    try {
        const repairsRef = getRepairsCollectionRef();
        if (!repairsRef) return;

        await repairsRef.add(repairData);
        form.reset();

        const resetToday = new Date();
        if (DOM.monthInput) DOM.monthInput.value = resetToday.getMonth() + 1;
        if (DOM.yearInput) DOM.yearInput.value = resetToday.getFullYear();

        window.toggleNewRepairForm();
        console.log("Mantenimiento guardado con éxito en Firebase.");
    } catch (error) {
        console.error("Error al guardar el mantenimiento:", error);
    }
}

/**
 * Maneja el guardado de un mantenimiento editado (Mock o Firebase).
 */
async function saveEditedRepair() {
    const id = currentEditRepairId;
    if (!id) return;

    // 🔑 Recolección de datos del Modal de Edición
    const dateInput = document.getElementById('edit-date').value.split('-');

    const contactName = document.getElementById('edit-contact_name').value.trim() || null;
    const contactPhone = document.getElementById('edit-contact_phone').value.trim() || null;
    const contactNotes = document.getElementById('edit-contact_notes').value.trim() || null;

    let contactData = { name: contactName, phone: contactPhone, notes: contactNotes };

    const hasContactData = Object.values(contactData).some(v => v !== null && v !== '');
    if (!hasContactData) {
        contactData = {};
    }

    const newValues = {
        location: document.getElementById('edit-location').value.trim(),
        contract: document.getElementById('edit-contract').value.trim(),
        maintenance_year: parseInt(dateInput[0]),
        maintenance_month: parseInt(dateInput[1]),
        model: document.getElementById('edit-model').value.trim() || null,
        key_id: document.getElementById('edit-key_id').value.trim() || null,
        priority: document.getElementById('edit-priority').value,
        status: document.getElementById('edit-status').value,
        description: document.getElementById('edit-description').value.trim(),
        contact: contactData,
    };

    if (!newValues.location || !newValues.contract || isNaN(newValues.maintenance_month) || isNaN(newValues.maintenance_year)) {
        console.error("Validación de edición fallida.");
        return;
    }

    if (IS_MOCK_MODE) {
        editMockRepairAndRefresh(id, newValues);
        hideModal();
        return;
    }

    try {
        const repairsRef = getRepairsCollectionRef();
        if (!repairsRef) return;

        await repairsRef.doc(id).update(newValues);
        console.log(`Mantenimiento ${id} actualizado con éxito.`);
        hideModal();
    } catch (error) {
        console.error("Error al actualizar el mantenimiento:", error);
    }
}

/**
 * Maneja la eliminación de un mantenimiento (Mock o Firebase).
 */
window.deleteRepair = async function (id) {
    const currentUserId = sessionStorage.getItem('portis-user-identifier');

    const repair = window.repairsDataMap ? window.repairsDataMap.get(id) || { id: id, location: 'este registro' } : { id: id, location: 'este registro' };

    if (!repair) {
        console.error("No se encontró el registro para eliminar.");
        return;
    }

    // 🔑 Generar la confirmación en el modal
    const modal = document.getElementById('repair-detail-modal');
    if (!modal) return;

    const modalContent = `
        <div class="modal-header">
            <h2 class="text-xl font-bold text-red-500">Confirmar Eliminación</h2>
            <button id="close-modal-btn" class="secondary-icon-btn p-1 rounded-full"><i class="ph ph-x text-2xl"></i></button>
        </div>
        
        <div class="modal-body p-4 text-center">
            <i class="ph ph-warning-circle text-6xl text-red-500 mb-3"></i>
            <p class="text-lg mb-4" style="color: var(--color-text-light);">¿Estás seguro de que deseas eliminar permanentemente el mantenimiento en **${repair.location || id}**?</p>
            <p class="text-sm" style="color: var(--color-text-secondary);">Esta acción no se puede deshacer.</p>
        </div>

        <div class="modal-footer flex justify-center p-4 border-t" style="border-color: var(--color-border);">
            <button id="confirm-delete-btn" class="primary-btn bg-red-600 hover:bg-red-700 flex items-center gap-2 mr-4">
                <i class="ph ph-trash"></i><span>Sí, Eliminar</span>
            </button>
            <button id="cancel-delete-btn" class="primary-btn bg-gray-500 hover:bg-gray-600">
                <span>Cancelar</span>
            </button>
        </div>
    `;

    modal.querySelector('.modal-content').innerHTML = modalContent;
    modal.classList.remove('hidden');

    document.getElementById('close-modal-btn').onclick = hideModal;
    document.getElementById('cancel-delete-btn').onclick = hideModal;

    document.getElementById('confirm-delete-btn').onclick = async () => {
        hideModal();

        if (IS_MOCK_MODE) {
            deleteMockRepairAndRefresh(id);
            return;
        }

        try {
            const repairRef = getRepairsCollectionRef();
            if (!repairRef) return;

            await repairRef.doc(id).delete();
            console.log(`Mantenimiento ${id} eliminado con éxito de Firebase.`);
        } catch (error) {
            console.error("Error al eliminar el mantenimiento:", error);
        }
    };
}

function generateModalContent(repair, isEditMode) {
    const priority = repair.priority || 'No especificada';
    const status = repair.status || 'Pendiente';
    const maintenanceDate = getFormattedDate(repair.maintenance_month, repair.maintenance_year);
    const contact = repair.contact || {};

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
    }

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
        bodyContent = `
            <div class="modal-body p-4">
                <h3 class="text-lg font-bold mb-3" style="color: var(--color-accent-blue);">${repair.location}</h3>
                <div class="grid grid-cols-2 gap-4 mb-4 text-sm">
                    <div class="space-y-1">
                        <label class="detail-label">Fecha Prevista</label>
                        <p class="detail-value-compact">${maintenanceDate}</p>
                    </div>
                    <div class="space-y-1">
                        <label class="detail-label">Modelo</label>
                        <p class="detail-value-compact">${repair.model || 'N/A'}</p>
                    </div>
                    <div class="space-y-1">
                        <label class="detail-label">Contrato</label>
                        <p class="detail-value-compact">${repair.contract}</p>
                    </div>
                    <div class="space-y-1">
                        <label class="detail-label">ID Clave/TAG</label>
                        <p class="detail-value-compact">${repair.key_id || 'N/A'}</p>
                    </div>
                    <div class="space-y-1">
                        <label class="detail-label">Prioridad</label>
                        <p class="detail-value-compact">${priority}</p>
                    </div>
                    <div class="space-y-1">
                        <label class="detail-label">Estado</label>
                        <p class="detail-value-compact ${status.toLowerCase().replace(/ /g, '-')}" style="color: ${status === 'Completado' ? '#10b981' : status === 'En Progreso' ? 'var(--color-accent-blue)' : '#f97316'};">${status}</p>
                    </div>
                </div>

                <div class="space-y-1 mb-4">
                    <label class="detail-label">Descripción</label>
                    <p class="detail-value-compact text-sm italic">${repair.description || 'Sin descripción.'}</p>
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
        bodyContent = `
            <div class="modal-body p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="col-span-1 md:col-span-2 space-y-2">
                    ${baseInput('edit-location', 'Ubicación', repair.location, false)}
                </div>
                ${baseInput('edit-contract', 'Contrato', repair.contract, false)}
                ${baseInput('edit-date', 'Fecha Prevista', '', false, 'month')}
                ${baseInput('edit-model', 'Modelo', repair.model, false)}
                ${baseInput('edit-key_id', 'ID Clave', repair.key_id, false)}
                ${prioritySelect(priority, false)}
                ${statusSelect(status, false)}
                <div class="col-span-1 md:col-span-2 space-y-2">
                    ${baseTextarea('edit-description', 'Descripción', repair.description, false, 3)}
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
                <button id="close-modal-btn" class="secondary-icon-btn p-1 rounded-full"><i class="ph ph-x text-2xl"></i></button>
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

// ===================================================================================
// 5. FUNCIONES DE RENDERIZADO Y UTILIDADES GLOBALES
// ===================================================================================

window.openMap = function (location) {
    if (!location) return;
    const query = encodeURIComponent(location);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
}

window.toggleSearch = function () {
    const searchContainer = document.getElementById('search-container');
    const searchInput = document.getElementById('search-input');

    if (searchContainer && searchInput) {
        const isHidden = searchContainer.classList.contains('hidden');
        if (isHidden) {
            searchContainer.classList.remove('hidden');
            searchInput.focus();
        } else {
            searchContainer.classList.add('hidden');
            searchInput.value = '';
            // Disparar evento de input para limpiar el filtro
            searchInput.dispatchEvent(new Event('input'));
        }
    }
}

// Variable global para almacenar los datos actuales y evitar lecturas innecesarias
window.currentRepairsData = [];
window.repairsDataMap = new Map();

function renderRepairs(repairs, updateMap = true) {
    if (updateMap) {
        window.currentRepairsData = repairs;
        window.repairsDataMap = new Map(repairs.map(r => [r.id, r]));
    }

    const listContainer = DOM.listContainer;
    if (!listContainer) return;

    listContainer.innerHTML = '';

    // 1. Filtrado
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

    let filteredRepairs = repairs;
    if (searchTerm) {
        filteredRepairs = repairs.filter(r =>
            (r.location && r.location.toLowerCase().includes(searchTerm)) ||
            (r.description && r.description.toLowerCase().includes(searchTerm)) ||
            (r.model && r.model.toLowerCase().includes(searchTerm))
        );
    }

    if (filteredRepairs.length === 0) {
        listContainer.innerHTML = `
            <div class="text-center p-8 text-gray-500">
                <i class="ph ph-clipboard-text text-4xl mb-2"></i>
                <p>No hay mantenimientos para mostrar.</p>
            </div>
        `;
        return;
    }

    // 2. Ordenamiento: Prioridad (Alta > Media > Baja) -> Fecha (Ascendente)
    filteredRepairs.sort((a, b) => {
        const priorityOrder = { 'Alta': 1, 'Media': 2, 'Baja': 3 };
        const pA = priorityOrder[a.priority] || 4;
        const pB = priorityOrder[b.priority] || 4;

        if (pA !== pB) return pA - pB;

        // Si la prioridad es igual, ordenar por fecha (año, luego mes)
        if (a.maintenance_year !== b.maintenance_year) {
            return a.maintenance_year - b.maintenance_year;
        }
        return a.maintenance_month - b.maintenance_month;
    });

    // 3. Generación de Tarjetas
    filteredRepairs.forEach(repair => {
        const card = document.createElement('div');
        card.className = 'repair-card p-4 rounded-xl shadow-sm border relative group cursor-pointer transition-all duration-200 hover:shadow-md';
        // Estilos inline para asegurar consistencia con el tema
        card.style.backgroundColor = 'var(--color-card-bg)';
        card.style.borderColor = 'var(--color-border)';

        // Determinar clases de estado y prioridad
        const statusColors = {
            'Pendiente': 'text-orange-500 bg-orange-100 dark:bg-orange-900/30',
            'En Progreso': 'text-blue-500 bg-blue-100 dark:bg-blue-900/30',
            'Completado': 'text-green-500 bg-green-100 dark:bg-green-900/30'
        };
        const statusClass = statusColors[repair.status] || 'text-gray-500 bg-gray-100';

        const priorityColors = {
            'Alta': 'text-red-500',
            'Media': 'text-yellow-500',
            'Baja': 'text-green-500'
        };
        const priorityColor = priorityColors[repair.priority] || 'text-gray-500';

        card.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <h3 class="font-bold text-lg truncate pr-8" style="color: var(--color-text-primary);">${repair.location}</h3>
                <span class="text-xs font-medium px-2 py-1 rounded-full ${statusClass}">
                    ${repair.status}
                </span>
            </div>
            
            <div class="text-sm mb-3 space-y-1" style="color: var(--color-text-secondary);">
                <p class="flex items-center gap-2">
                    <i class="ph ph-calendar-blank"></i>
                    ${getFormattedDate(repair.maintenance_month, repair.maintenance_year)}
                </p>
                <p class="flex items-center gap-2">
                    <i class="ph ph-file-text"></i>
                    ${repair.contract}
                </p>
            </div>

            <div class="flex justify-between items-center mt-3 pt-3 border-t" style="border-color: var(--color-border);">
                <span class="text-sm font-semibold ${priorityColor}">
                    <i class="ph ph-warning-circle mr-1"></i> ${repair.priority}
                </span>
                
                <div class="flex gap-2">
                    <button class="action-btn map-btn p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-blue-500" 
                            title="Ver ubicación" onclick="event.stopPropagation(); window.openMap('${repair.location}')">
                        <i class="ph ph-map-pin text-lg"></i>
                    </button>
                    <button class="action-btn delete-btn p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-red-500" 
                            title="Eliminar" onclick="event.stopPropagation(); window.deleteRepair('${repair.id}')">
                        <i class="ph ph-trash text-lg"></i>
                    </button>
                </div>
            </div>
        `;

        // Evento de clic en toda la tarjeta para abrir detalles
        card.addEventListener('click', () => showRepairDetailsModal(repair));

        listContainer.appendChild(card);
    });
}

// Listener para el input de búsqueda
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            // Re-renderizar usando los datos cacheados, sin actualizar el mapa
            renderRepairs(window.currentRepairsData, false);
        });
    }
});

// --- Ejecución al cargar la página (Igual que en Bills.js) ---
window.addEventListener('load', () => {
    if (typeof window.applyColorMode === 'function') {
        window.applyColorMode();
    }
    startRepairsModule();
});
