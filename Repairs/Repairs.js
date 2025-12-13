/**
 * ====================================================================
 * Repairs.js - Lógica para la Gestión de Mantenimientos
 * ====================================================================
 * 
 * Este módulo gestiona la creación, edición, eliminación y visualización
 * de mantenimientos reportados por el usuario.
 */

// ====================================================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// ====================================================================

const firebaseConfig = window.firebaseConfig;

let app;
let db;
let auth;
let userId = null;
let isAuthReady = false;

// Cache de datos para búsqueda
window.currentRepairsData = [];

// Nombres de meses para formateo de fechas
const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// ====================================================================
// AUTENTICACIÓN Y SETUP
// ====================================================================

/**
 * Valida la sesión del usuario y prepara la interfaz.
 */
function checkAuthenticationAndSetup() {
    userId = sessionStorage.getItem('portis-user-identifier');
    const userDisplayName = sessionStorage.getItem('portis-user-display-name');
    const displayElement = document.getElementById('current-user-display');

    if (!userId || !userDisplayName) {
        window.location.href = '../index.html';
        return;
    }

    if (displayElement) {
        displayElement.textContent = userDisplayName;
    }

    initializeAppAndAuth();
    const form = document.getElementById('new-repair-form');
    if (form) {
        form.removeEventListener('submit', saveRepair); // Evitar duplicados
        form.addEventListener('submit', saveRepair);
    }

    // Listener para checkbox de contacto
    const contactCheckbox = document.getElementById('contact_checkbox');
    if (contactCheckbox) {
        contactCheckbox.removeEventListener('change', toggleContactFields);
        contactCheckbox.addEventListener('change', toggleContactFields);
    }
}

/**
 * Inicializa Firebase y establece el listener de autenticación.
 */
async function initializeAppAndAuth() {
    try {
        if (!firebaseConfig || !firebaseConfig.apiKey) {
            throw new Error("La configuración de Firebase está incompleta.");
        }

        if (!firebase.apps.length) {
            app = firebase.initializeApp(firebaseConfig);
        } else {
            app = firebase.app();
        }

        auth = firebase.auth();
        db = firebase.firestore();

        auth.onAuthStateChanged((user) => {
            if (user && user.uid === userId) {
                isAuthReady = true;
                setupRepairsListener();
            } else {
                window.location.href = '../index.html';
            }
        });

    } catch (error) {
        console.error("Firebase init error:", error);
        const list = document.getElementById('repairs-list');
        if (list) {
            list.innerHTML = `
                <div class="message-error p-3 mt-4 text-red-400 bg-red-900/40 border border-red-900 rounded-lg">
                    Error de conexión. No se pudo cargar el módulo de datos.
                </div>
            `;
        }
    }
}

// ====================================================================
// FUNCIONES DE FIREBASE
// ====================================================================

/**
 * Obtiene la referencia a la colección de mantenimientos del usuario.
 * @returns {Object|null} Referencia a la colección o null
 */
function getRepairsCollectionRef() {
    if (!db || !userId) return null;
    return db.collection(`users/${userId}/repairs`);
}

/**
 * Configura el listener en tiempo real para los mantenimientos (Firebase).
 */
function setupRepairsListener() {
    if (!db || !isAuthReady || !userId) return;

    const repairsQuery = getRepairsCollectionRef().orderBy('timestamp', 'desc');

    repairsQuery.onSnapshot((snapshot) => {
        const repairs = [];
        snapshot.forEach((doc) => {
            repairs.push({ id: doc.id, ...doc.data() });
        });
        renderRepairs(repairs);
    }, (error) => {
        console.error("Error getting repairs:", error);
    });
}

// ====================================================================
// CRUD - CREAR Y ACTUALIZAR MANTENIMIENTOS
// ====================================================================

/**
 * Guarda un mantenimiento nuevo o actualiza uno existente.
 * @param {Event} e - Evento del formulario
 */
async function saveRepair(e) {
    e.preventDefault();
    if (!isAuthReady || !userId) return;

    const form = document.getElementById('new-repair-form');
    const submitButton = document.getElementById('save-repair-btn');
    const idInput = document.getElementById('repair-id');
    const editId = idInput.value;

    const location = document.getElementById('location').value.trim();
    const model = document.getElementById('model').value.trim();
    const key_id = document.getElementById('key_id').value.trim();
    const contract = document.getElementById('contract').value;
    const month = parseInt(document.getElementById('month').value);
    const year = parseInt(document.getElementById('year').value);
    let priority = document.getElementById('priority').value;
    const description = document.getElementById('description').value.trim();
    const breakdown = document.getElementById('breakdown').value.trim();

    // Lógica de seguridad: si hay avería, forzar prioridad Alta
    if (breakdown) {
        priority = 'Alta';
    }

    if (!location || !contract || !month || !year) return;

    // Datos de contacto (si están marcados)
    const contactCheckbox = document.getElementById('contact_checkbox');
    const contactData = contactCheckbox.checked ? {
        contact_name: document.getElementById('contact_name').value.trim(),
        contact_phone: document.getElementById('contact_phone').value.trim(),
        contact_notes: document.getElementById('contact_notes').value.trim()
    } : {};

    const originalBtnContent = submitButton.innerHTML;
    submitButton.innerHTML = '<i class="ph ph-circle-notch animate-spin mr-2"></i> Guardando...';
    submitButton.disabled = true;

    const repairData = {
        location,
        model,
        key_id,
        contract,
        maintenance_month: month,
        maintenance_year: year,
        priority,
        description,
        breakdown,
        status: 'Pendiente',
        ...contactData,
        userId: userId,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        const repairsRef = getRepairsCollectionRef();
        if (!repairsRef) return;

        if (editId) {
            await repairsRef.doc(editId).update({
                location,
                model,
                key_id,
                contract,
                maintenance_month: month,
                maintenance_year: year,
                priority,
                description,
                breakdown,
                ...contactData,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            await repairsRef.add(repairData);
        }

        resetForm();
        window.toggleNewRepairForm();

    } catch (error) {
        console.error("Error saving repair:", error);
        alert("Error al guardar el mantenimiento. Inténtalo de nuevo.");
    }

    submitButton.innerHTML = '<i class="ph ph-floppy-disk mr-2"></i> Guardar Mantenimiento';
    submitButton.disabled = false;
}

// ====================================================================
// CRUD - ELIMINAR MANTENIMIENTOS
// ====================================================================

// Variable para almacenar el ID del mantenimiento a eliminar
let repairToDeleteId = null;

/**
 * Muestra el modal de confirmación para eliminar un mantenimiento.
 * @param {string} id - ID del mantenimiento a eliminar
 */
window.deleteRepair = function (id) {
    repairToDeleteId = id;
    const modal = document.getElementById('delete-confirmation-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
};

/**
 * Ejecuta la eliminación del mantenimiento después de la confirmación.
 */
async function executeDeleteRepair() {
    if (!repairToDeleteId) return;

    const id = repairToDeleteId;
    const modal = document.getElementById('delete-confirmation-modal');

    // Cerrar modal
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    const repairElement = document.querySelector(`.repair-card[data-id="${id}"]`);
    if (repairElement) {
        repairElement.classList.add('opacity-0', 'transform', '-translate-x-full');
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    try {
        const repairsRef = getRepairsCollectionRef();
        if (repairsRef) {
            // 1. Obtener datos para buscar en historial
            const doc = await repairsRef.doc(id).get();

            if (doc.exists) {
                const repairData = doc.data();

                // 2. Buscar y borrar historial asociado
                // Usamos 'location' como clave principal, reforzada por 'key_id' si existe
                const historyRef = db.collection(`users/${userId}/history`);
                let historyQuery = historyRef.where('location', '==', repairData.location);

                if (repairData.key_id) {
                    historyQuery = historyQuery.where('key_id', '==', repairData.key_id);
                }

                const historySnapshot = await historyQuery.get();

                // Usar batch para borrar historial (más eficiente)
                if (!historySnapshot.empty) {
                    const batch = db.batch();
                    historySnapshot.forEach(hDoc => {
                        batch.delete(hDoc.ref);
                    });
                    await batch.commit();
                    console.log(`[Repairs] Eliminados ${historySnapshot.size} registros de historial.`);
                }
            }

            // 3. Borrar el mantenimiento
            await repairsRef.doc(id).delete();
        }
    } catch (error) {
        console.error("Error deleting repair:", error);
        if (repairElement) {
            repairElement.classList.remove('opacity-0', 'transform', '-translate-x-full');
        }
        alert("Error al eliminar. Inténtalo de nuevo.");
    }

    repairToDeleteId = null;
}

// ====================================================================
// CRUD - EDITAR MANTENIMIENTOS
// ====================================================================

/**
 * Prepara el formulario para editar un mantenimiento existente.
 * @param {string} id - ID del mantenimiento a editar
 */
window.editRepair = function (id) {
    const repairs = window.currentRepairsData;
    const repair = repairs.find(r => r.id === id);

    if (!repair) return;

    // Rellenar formulario
    document.getElementById('repair-id').value = repair.id;
    document.getElementById('location').value = repair.location;
    document.getElementById('model').value = repair.model || '';
    document.getElementById('key_id').value = repair.key_id || '';
    document.getElementById('contract').value = repair.contract;
    document.getElementById('month').value = repair.maintenance_month;
    document.getElementById('year').value = repair.maintenance_year;
    document.getElementById('priority').value = repair.priority || 'Media';
    document.getElementById('description').value = repair.description || '';
    document.getElementById('breakdown').value = repair.breakdown || '';

    // Rellenar datos de contacto si existen
    const contactCheckbox = document.getElementById('contact_checkbox');
    if (repair.contact_name || repair.contact_phone || repair.contact_notes) {
        contactCheckbox.checked = true;
        toggleContactFields();
        document.getElementById('contact_name').value = repair.contact_name || '';
        document.getElementById('contact_phone').value = repair.contact_phone || '';
        document.getElementById('contact_notes').value = repair.contact_notes || '';
    } else {
        contactCheckbox.checked = false;
        toggleContactFields();
    }

    // Cambiar UI del formulario
    document.getElementById('form-title').innerHTML = `
        <i class="ph ph-pencil-simple card-icon"></i>
        Editar Mantenimiento
    `;
    document.getElementById('save-repair-btn').innerHTML = '<i class="ph ph-floppy-disk mr-2"></i> Actualizar Mantenimiento';
    document.getElementById('cancel-edit-btn').classList.remove('hidden');

    // Mostrar formulario si está oculto
    const card = document.getElementById('new-repair-card');
    if (card.classList.contains('hidden')) {
        window.toggleNewRepairForm();
    } else {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/**
 * Cancela la edición y resetea el formulario.
 */
window.cancelEdit = function () {
    resetForm();
    window.toggleNewRepairForm();
}

/**
 * Resetea el formulario a su estado inicial.
 */
function resetForm() {
    const form = document.getElementById('new-repair-form');
    form.reset();
    document.getElementById('repair-id').value = '';
    document.getElementById('description').value = '';
    document.getElementById('breakdown').value = '';

    // Establecer prioridad por defecto en Baja
    document.getElementById('priority').value = 'Baja';

    // Establecer mes y año actuales
    setCurrentDate();

    // Ocultar campos de contacto
    const contactCheckbox = document.getElementById('contact_checkbox');
    contactCheckbox.checked = false;
    toggleContactFields();

    document.getElementById('form-title').innerHTML = `
        <i class="ph ph-wrench card-icon"></i>
        Nuevo Mantenimiento
    `;
    document.getElementById('save-repair-btn').innerHTML = '<i class="ph ph-floppy-disk mr-2"></i> Guardar Mantenimiento';
    document.getElementById('cancel-edit-btn').classList.add('hidden');
}

/**
 * Establece el mes y año actuales en los campos del formulario.
 */
function setCurrentDate() {
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // getMonth() devuelve 0-11
    const currentYear = now.getFullYear();

    document.getElementById('month').value = currentMonth;
    document.getElementById('year').value = currentYear;
}

// ====================================================================
// GESTIÓN DE CAMPOS DE CONTACTO
// ====================================================================

/**
 * Muestra u oculta los campos de contacto según el checkbox.
 */
function toggleContactFields() {
    const contactCheckbox = document.getElementById('contact_checkbox');
    const contactFields = document.getElementById('contact-fields');

    if (contactCheckbox && contactFields) {
        if (contactCheckbox.checked) {
            contactFields.classList.remove('hidden');
        } else {
            contactFields.classList.add('hidden');
            // Limpiar campos
            document.getElementById('contact_name').value = '';
            document.getElementById('contact_phone').value = '';
            document.getElementById('contact_notes').value = '';
        }
    }
}

// ====================================================================
// RENDERIZADO Y UI
// ====================================================================

/**
 * Formatea la fecha de mantenimiento.
 * @param {number} month - Mes (1-12)
 * @param {number} year - Año
 * @returns {string} Fecha formateada
 */
function getFormattedDate(month, year) {
    return `${monthNames[month - 1]} ${year}`;
}

/**
 * Renderiza los mantenimientos en la interfaz.
 * @param {Array} repairs - Array de mantenimientos a renderizar
 * @param {boolean} updateCache - Si se debe actualizar el cache
 */
function renderRepairs(repairs, updateCache = true) {
    if (updateCache) {
        window.currentRepairsData = repairs;
    }

    const listContainer = document.getElementById('repairs-list');
    listContainer.innerHTML = '';

    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

    let filteredRepairs = repairs;
    if (searchTerm) {
        filteredRepairs = repairs.filter(r =>
            (r.location && r.location.toLowerCase().includes(searchTerm)) ||
            (r.model && r.model.toLowerCase().includes(searchTerm)) ||
            (r.key_id && r.key_id.toLowerCase().includes(searchTerm))
        );
    }

    if (filteredRepairs.length === 0) {
        listContainer.innerHTML = `
            <div class="no-repairs-message">
                ${searchTerm ? 'No se encontraron mantenimientos.' : 'No hay mantenimientos reportados.'}
            </div>
        `;
        return;
    }

    // Ordenar por timestamp (más reciente primero)
    filteredRepairs.sort((a, b) => {
        const timeA = a.timestamp && a.timestamp.toMillis ? a.timestamp.toMillis() : (a.timestamp || 0);
        const timeB = b.timestamp && b.timestamp.toMillis ? b.timestamp.toMillis() : (b.timestamp || 0);
        return timeB - timeA;
    });

    filteredRepairs.forEach(repair => {
        const formattedDate = getFormattedDate(repair.maintenance_month, repair.maintenance_year);
        const priorityClass = `priority-${repair.priority.toLowerCase()}`;
        const statusClass = `status-${repair.status.toLowerCase().replace(' ', '-')}`;

        const card = document.createElement('div');
        card.className = `repair-card ${priorityClass}`;
        card.setAttribute('data-id', repair.id);

        const repairHtml = `
            <div class="repair-header">
                <div class="repair-title-container">
                    <h3 class="font-bold text-xl truncate repair-card-title" title="${repair.location}">${repair.location}</h3>
                </div>
            </div>
            
            <div class="repair-details-grid">
                <div class="repair-detail-item">
                    <span class="repair-detail-label">Contrato</span>
                    <span class="repair-detail-value">${repair.contract}</span>
                </div>
                <div class="repair-detail-item">
                     <span class="repair-detail-label">Prioridad</span>
                     <span class="repair-detail-value">${repair.priority}</span>
                </div>
                ${repair.model ? `
                <div class="repair-detail-item">
                    <span class="repair-detail-label">Modelo</span>
                    <span class="repair-detail-value">${repair.model}</span>
                </div>` : ''}
                ${repair.key_id ? `
                <div class="repair-detail-item">
                    <span class="repair-detail-label">Llave/TAG</span>
                    <span class="repair-detail-value">${repair.key_id}</span>
                </div>` : ''}
                 <div class="repair-detail-item">
                     <span class="repair-detail-label">Estado</span>
                     <span class="${statusClass}" style="font-size: 0.85rem;">${repair.status}</span>
                </div>
            </div>

            ${repair.description ? `
            <div class="repair-observation-box">
                <span class="repair-observation-box-title">Observaciones:</span>
                <p class="repair-observation-box-text">${repair.description}</p>
            </div>
            ` : ''}

            ${repair.breakdown ? `
            <div class="repair-observation-box" style="border-left: 3px solid var(--color-accent-red);">
                <span class="repair-observation-box-title text-red-400">Avería:</span>
                <p class="repair-observation-box-text">${repair.breakdown}</p>
            </div>
            ` : ''}

            <div class="repair-footer flex justify-between items-center mt-3 pt-3">
                <span class="text-xs font-medium px-2 py-1 rounded-full repair-date-badge">
                    ${formattedDate}
                </span>
                <div class="repair-actions flex gap-2">
                    <button data-action="edit" data-id="${repair.id}"
                        class="action-btn edit-btn p-2 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-blue-500" 
                        title="Editar mantenimiento">
                        <i class="ph ph-pencil-simple text-lg"></i>
                    </button>
                    <button data-action="delete" data-id="${repair.id}"
                        class="action-btn delete-btn p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-red-500" 
                        title="Eliminar mantenimiento">
                        <i class="ph ph-trash text-lg"></i>
                    </button>
                </div>
            </div>
        `;

        card.innerHTML = repairHtml;
        listContainer.appendChild(card);
    });

    setTimeout(updateCardBorderOpacity, 50);
}

/**
 * Maneja los clicks en los botones de acción de los mantenimientos.
 * @param {Event} e - Evento de click
 */
function handleRepairActions(e) {
    const button = e.target.closest('button[data-action][data-id]');
    const action = button.dataset.action;
    const id = button.dataset.id;

    if (action === 'delete') {

        window.deleteRepair(id);
    } else if (action === 'edit') {

        window.editRepair(id);
    }
}

// ====================================================================
// FUNCIONES DE BÚSQUEDA
// ====================================================================

/**
 * Alterna la visibilidad de la barra de búsqueda.
 */
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
            searchInput.dispatchEvent(new Event('input'));
        }
    }
}

// ====================================================================
// FUNCIONES DE FORMULARIO
// ====================================================================

/**
 * Alterna la visibilidad del formulario de nuevo mantenimiento.
 */
window.toggleNewRepairForm = function () {
    const card = document.getElementById('new-repair-card');
    const fab = document.getElementById('show-repair-form-fab');

    if (!card || !fab) return;

    const isHidden = card.classList.contains('hidden');

    const listContainer = document.getElementById('repairs-list-container');

    if (isHidden) {
        card.classList.remove('hidden');
        if (listContainer) listContainer.classList.add('hidden'); // Hide list
        fab.classList.add('rotate-45');
        fab.querySelector('i').classList.replace('ph-plus', 'ph-x');
        // No need to scroll if we are hiding the other container, it takes its place
    } else {
        card.classList.add('hidden');
        if (listContainer) listContainer.classList.remove('hidden'); // Show list
        fab.classList.remove('rotate-45');
        fab.querySelector('i').classList.replace('ph-x', 'ph-plus');

        // Si cerramos el formulario y estaba en modo edición, reseteamos
        if (document.getElementById('repair-id').value) {
            resetForm();
        }
    }
}

// ====================================================================
// INICIALIZACIÓN
// ====================================================================

window.addEventListener('load', () => {
    // Aplicar tema guardado
    if (typeof window.applyColorMode === 'function') {
        window.applyColorMode();
    }

    // Listener para cambios de tema
    window.addEventListener('storage', (e) => {
        if (e.key === 'portis-theme') {
            if (typeof window.applyColorMode === 'function') {
                window.applyColorMode();
            }
        }
    });

    // Establecer fecha actual en los campos del formulario
    setCurrentDate();

    // Inicializar autenticación y datos
    checkAuthenticationAndSetup();

    // Event listener para acciones de mantenimientos
    const listContainer = document.getElementById('repairs-list');
    if (listContainer) {
        listContainer.addEventListener('click', handleRepairActions);
    }

    // Event listener para búsqueda
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (window.currentRepairsData) {
                renderRepairs(window.currentRepairsData, false);
            }
        });
    }

    // Logic for auto-priority on breakdown input
    const breakdownInput = document.getElementById('breakdown');
    if (breakdownInput) {
        breakdownInput.addEventListener('input', (e) => {
            if (e.target.value.trim().length > 0) {
                document.getElementById('priority').value = 'Alta';
            }
        });
    }

    // Event listeners para el modal de confirmación de eliminación
    const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', () => {
            const modal = document.getElementById('delete-confirmation-modal');
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
            repairToDeleteId = null;
        });
    }

    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', () => {
            executeDeleteRepair();
        });
    }
});


// ================================================================
// BORDE ANIMADO EN SCROLL
// ================================================================

/**
 * Actualiza la posición del gradiente del borde superior de las tarjetas.
 */
function updateCardBorderOpacity() {
    const elements = document.querySelectorAll('.repair-card');
    const viewportHeight = window.innerHeight;
    const headerOffset = 60; // Offset approx for header

    elements.forEach(element => {
        const rect = element.getBoundingClientRect();
        const elementTop = rect.top - headerOffset;

        // Calculate percentage: Top of list (0) -> 100%, Bottom (~height) -> 0%
        // We use a safe range for the viewport calculation
        let percentage = 0;

        // Map viewport range to 0-100 percentage
        // If element is at top (approx 0), we want close to 100% (Black/Bottom of gradient)
        // If element is at bottom (approx viewportHeight), we want close to 0% (White/Top of gradient)

        const relativePos = Math.max(0, Math.min(1, elementTop / (viewportHeight * 0.8)));
        percentage = (1 - relativePos) * 100;

        // Calculate opacity for the white part: 1 at top, 0 at bottom
        const opacity = (1 - relativePos).toFixed(2);

        element.style.setProperty('--gradient-stop', `${percentage}%`);
        element.style.setProperty('--white-opacity', opacity);
    });
}

document.addEventListener('DOMContentLoaded', function () {
    const mainContainer = document.querySelector('#app-content'); // Main scroll container if applicable
    const innerContents = document.querySelectorAll('.card-inner-content');

    // Listen on multiple potential scroll sources
    window.addEventListener('scroll', updateCardBorderOpacity, { passive: true });

    if (mainContainer) {
        mainContainer.addEventListener('scroll', updateCardBorderOpacity, { passive: true });
    }

    innerContents.forEach(inner => {
        inner.addEventListener('scroll', updateCardBorderOpacity, { passive: true });
    });

    // Trigger inicial
    updateCardBorderOpacity();
});

window.addEventListener('resize', updateCardBorderOpacity);

