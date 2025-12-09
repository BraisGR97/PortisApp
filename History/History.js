/**
 * ====================================================================
 * History.js - Historial de Mantenimientos Completados
 * ====================================================================
 */

// -----------------------------------------------------------------
// 1. CONFIGURACIÓN Y VARIABLES GLOBALES
// -----------------------------------------------------------------
const firebaseConfig = window.firebaseConfig;
const appId = firebaseConfig ? firebaseConfig.projectId : 'portis-app-id';

let app;
let db;
let auth;
let userId = sessionStorage.getItem('portis-user-identifier') || null;
let userDisplayName = sessionStorage.getItem('portis-user-display-name') || null;
let isAuthReady = false;

// Variables de estado
let currentView = 'maintenances'; // 'maintenances' o 'records'
let currentMaintenanceId = null;
let currentMaintenanceLocation = null;

// Cache de datos
let allMaintenancesData = [];
let allRecordsData = [];

// -----------------------------------------------------------------
// 2. AUTENTICACIÓN Y SETUP
// -----------------------------------------------------------------

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
}

async function initializeAppAndAuth() {
    try {
        if (!firebaseConfig || !firebaseConfig.apiKey) {
            throw new Error("La configuración de Firebase está incompleta.");
        }

        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();

        auth.onAuthStateChanged((user) => {
            if (user && user.uid === userId) {
                isAuthReady = true;
                loadMaintenances();
            } else {
                window.location.href = '../index.html';
            }
        });

    } catch (error) {
        console.error("Error al inicializar Firebase o al autenticar:", error);
        document.getElementById('maintenances-list').innerHTML = `
            <div class="error-message">
                Error de conexión. No se pudo cargar el historial.
            </div>
        `;
    }
}

// -----------------------------------------------------------------
// 3. FUNCIONES DE CARGA DE DATOS
// -----------------------------------------------------------------

function getRepairsCollectionRef() {
    if (!db || !userId) return null;
    return db.collection(`users/${userId}/repairs`);
}

function getHistoryCollectionRef() {
    if (!db || !userId) return null;
    // Colección 'history' específica del usuario
    return db.collection(`users/${userId}/history`);
}

async function loadMaintenances() {
    try {
        const repairsRef = getRepairsCollectionRef();
        if (!repairsRef) return;

        const snapshot = await repairsRef.get();
        const maintenances = [];
        const seen = new Set();

        snapshot.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            // Agrupar por ubicación y contrato para mostrar mantenimientos únicos
            const key = `${data.location}-${data.model || ''}-${data.contract}`;
            if (!seen.has(key)) {
                seen.add(key);
                maintenances.push(data);
            }
        });

        allMaintenancesData = maintenances;
        renderMaintenances(maintenances);
    } catch (error) {
        console.error("Error al cargar mantenimientos:", error);
    }
}

async function loadRecords(maintenanceId, location) {
    currentMaintenanceId = maintenanceId;
    currentMaintenanceLocation = location;

    const titleEl = document.getElementById('records-title');
    if (titleEl) {
        titleEl.innerHTML = `
            <i class="ph ph-clock-counter-clockwise card-icon"></i>
            Registros: ${location}
        `;
    }

    try {
        const historyRef = getHistoryCollectionRef();
        if (!historyRef) return;

        const snapshot = await historyRef
            .where('location', '==', location)
            .get();

        const records = [];
        snapshot.forEach(doc => {
            records.push({ id: doc.id, ...doc.data() });
        });

        // Ordenar en cliente para evitar necesidad de índice compuesto
        records.sort((a, b) => {
            const dateA = a.completedAt ? (a.completedAt.seconds || 0) : 0;
            const dateB = b.completedAt ? (b.completedAt.seconds || 0) : 0;
            return dateB - dateA;
        });

        allRecordsData = records;
        renderRecords(records);
    } catch (error) {
        console.error("Error al cargar registros:", error);
        document.getElementById('records-list').innerHTML = `
            <div class="error-message">
                Error al cargar los registros.
            </div>
        `;
    }
}

// -----------------------------------------------------------------
// 4. FUNCIONES DE RENDERIZADO
// -----------------------------------------------------------------

function renderMaintenances(maintenances) {
    const listContainer = document.getElementById('maintenances-list');
    listContainer.innerHTML = '';

    if (maintenances.length === 0) {
        listContainer.innerHTML = `
            <div class="p-4 text-center rounded-lg empty-state-container">
                <i class="ph ph-folder-open text-4xl mb-2"></i>
                <p>No hay mantenimientos registrados.</p>
            </div>
        `;
        return;
    }

    // Ordenar por timestamp descendente
    maintenances.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    maintenances.forEach(maintenance => {
        const card = createMaintenanceCard(maintenance);
        listContainer.appendChild(card);
    });

    setTimeout(updateCardBorderOpacity, 50);
}

function createMaintenanceCard(item) {
    const card = document.createElement('div');
    card.className = 'repair-card';

    // NOTA: Se eliminaron las clases de prioridad (priority-alta, etc.) para quitar el borde lateral.

    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const monthIndex = (item.maintenance_month >= 1 && item.maintenance_month <= 12) ? item.maintenance_month - 1 : 0;
    const maintenanceDate = `${monthNames[monthIndex]} de ${item.maintenance_year}`;

    const priorityKey = (item.priority || 'baja').toLowerCase();
    const priorityTranslations = { 'high': 'Alta', 'medium': 'Media', 'low': 'Baja' };
    const displayPriority = priorityTranslations[priorityKey] || (item.priority ? item.priority.charAt(0).toUpperCase() + item.priority.slice(1) : 'Baja');

    card.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <h3 class="font-bold text-lg truncate pr-8 maintenance-card-title">${item.location || 'Sin Ubicación'}</h3>
            <span class="text-xs font-medium px-2 py-1 rounded-full maintenance-card-tag">
                ${item.contract || 'N/A'}
            </span>
        </div>
        
        <div class="text-sm mb-3 space-y-1 maintenance-card-info">
            <p class="flex items-center gap-2">
                <i class="ph ph-calendar-blank"></i>
                ${maintenanceDate}
            </p>
            ${item.model ? `
            <p class="flex items-center gap-2">
                <i class="ph ph-wrench"></i>
                ${item.model}
            </p>
            ` : ''}
        </div>

        <div class="flex justify-between items-center mt-3 pt-3 border-t maintenance-card-footer">
            <span class="text-sm font-semibold flex items-center gap-1 priority-badge">
                <i class="ph ph-warning-circle"></i> ${displayPriority}
            </span>
            
            <button class="action-btn p-2 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-blue-500" 
                    title="Ver registros">
                <i class="ph ph-clock-counter-clockwise text-lg"></i>
            </button>
        </div>
    `;

    card.addEventListener('click', () => {
        showRecordsView(item.id, item.location);
    });

    return card;
}

function renderRecords(records) {
    const listContainer = document.getElementById('records-list');
    listContainer.innerHTML = '';

    if (records.length === 0) {
        listContainer.innerHTML = `
            <div class="p-4 text-center rounded-lg empty-state-container">
                <i class="ph ph-clock-counter-clockwise text-4xl mb-2"></i>
                <p>No hay registros de este mantenimiento.</p>
            </div>
        `;
        return;
    }

    records.forEach(record => {
        const card = createRecordCard(record);
        listContainer.appendChild(card);
    });

    setTimeout(updateCardBorderOpacity, 50);
}

function createRecordCard(record) {
    const card = document.createElement('div');
    card.className = 'repair-card';

    // Formatear fecha de completado
    let completedDate = 'Fecha no disponible';
    if (record.completedAt) {
        const date = record.completedAt.toDate ? record.completedAt.toDate() : new Date(record.completedAt);
        completedDate = date.toLocaleDateString('es-ES', {
            day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    card.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <div class="flex-1">
                <p class="text-sm font-light mb-1 record-card-date">
                    <i class="ph ph-calendar-check mr-1"></i> ${completedDate}
                </p>
                <p class="text-sm font-medium record-card-user">
                    <i class="ph ph-user mr-1"></i> Completado por: ${record.username || 'Usuario desconocido'}
                </p>
            </div>
            <span class="text-xs font-medium px-2 py-1 rounded-full record-card-status">
                Completado
            </span>
        </div>

        <div class="text-sm record-card-info">
            <p class="flex items-center gap-2">
                <i class="ph ph-map-pin"></i>
                ${record.location}
            </p>
            ${record.model ? `
            <p class="flex items-center gap-2 mt-1">
                <i class="ph ph-wrench"></i>
                ${record.model}
            </p>
            ` : ''}
        </div>

        <div class="mt-3 pt-3 border-t record-card-description-container">
            <p class="${record.description && record.description.trim() ? 'text-sm' : 'text-sm italic opacity-70'} record-card-description">
                <i class="ph ph-note mr-1"></i>
                ${record.description && record.description.trim() ? record.description : 'Mantenimiento sin contratiempos'}
            </p>
        </div>
    `;

    card.addEventListener('click', () => {
        showRecordDetailsModal(record);
    });

    return card;
}

/**
 * Actualiza la opacidad del borde superior de las tarjetas (Efecto Visual).
 */
function updateCardBorderOpacity() {
    // 1. Contenedores (Border TOP por scroll interno)
    const innerContents = document.querySelectorAll('.card-inner-content');
    innerContents.forEach(inner => {
        const container = inner.closest('.card-container');
        if (container) {
            const scrollTop = inner.scrollTop;
            const opacity = Math.min(scrollTop / 50, 1);
            container.style.borderTopColor = `rgba(255, 255, 255, ${0.1 + (opacity * 0.9)})`;
        }
    });

    // 2. Tarjetas (Border TOP por posición en pantalla)
    const elements = document.querySelectorAll('.repair-card');
    const viewportHeight = window.innerHeight;

    elements.forEach(element => {
        const rect = element.getBoundingClientRect();
        const elementTop = rect.top;
        const elementHeight = rect.height;

        let opacity = 0;
        if (elementTop < viewportHeight && elementTop > -elementHeight) {
            const normalizedPosition = Math.max(0, Math.min(1, elementTop / (viewportHeight * 0.7)));
            opacity = 1 - normalizedPosition;
            opacity = 0.2 + (opacity * 0.8);
        }
        element.style.borderTopColor = `rgba(255, 255, 255, ${opacity})`;
    });
}

// -----------------------------------------------------------------
// 5. FUNCIONES DE NAVEGACIÓN
// -----------------------------------------------------------------

window.showRecordsView = function (maintenanceId, location) {
    currentView = 'records';
    document.getElementById('maintenances-view').classList.add('hidden');
    document.getElementById('records-view').classList.remove('hidden');
    document.getElementById('page-title').textContent = 'Registros';
    loadRecords(maintenanceId, location);
};

window.showMaintenancesView = function () {
    currentView = 'maintenances';
    document.getElementById('maintenances-view').classList.remove('hidden');
    document.getElementById('records-view').classList.add('hidden');
    document.getElementById('page-title').textContent = 'Historial';
    currentMaintenanceId = null;
    currentMaintenanceLocation = null;
};

window.goBack = function () {
    if (currentView === 'records') {
        showMaintenancesView();
    } else {
        window.location.href = '../Main/Main.html';
    }
};

// -----------------------------------------------------------------
// 6. MODAL DE DETALLES DEL REGISTRO
// -----------------------------------------------------------------

function showRecordDetailsModal(record) {
    const modal = document.getElementById('record-detail-modal');

    // Formatear fecha
    let completedDate = 'Fecha no disponible';
    if (record.completedAt) {
        const date = record.completedAt.toDate ? record.completedAt.toDate() : new Date(record.completedAt);
        completedDate = date.toLocaleDateString('es-ES', {
            day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const monthIndex = (record.maintenance_month >= 1 && record.maintenance_month <= 12) ? record.maintenance_month - 1 : 0;
    const scheduledDate = `${monthNames[monthIndex]} de ${record.maintenance_year}`;

    const contact = record.contact || {};

    const modalContent = `
        <div class="modal-header p-4 border-b flex justify-between items-center">
            <h2 class="text-xl font-bold">Detalles del Registro</h2>
            <button onclick="closeRecordModal()" class="secondary-icon-btn p-1 rounded-full border-2">
                <i class="ph ph-x text-2xl"></i>
            </button>
        </div>

        <div class="modal-body p-4">
            <div class="mb-4 modal-highlight-box">
                <p class="text-lg font-semibold mb-2 modal-date-text">
                    <i class="ph ph-calendar-check mr-2"></i> ${completedDate}
                </p>
                <p class="text-sm modal-user-text">
                    <i class="ph ph-user mr-2"></i> Completado por: <span class="font-medium modal-user-name">${record.username || 'Usuario desconocido'}</span>
                </p>
            </div>

            <h3 class="text-lg font-bold mb-3 modal-section-title">Información del Mantenimiento</h3>
            
            <div class="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div class="space-y-1">
                    <label class="text-xs font-medium modal-label">Ubicación</label>
                    <p class="font-semibold modal-value">${record.location}</p>
                </div>
                <div class="space-y-1">
                    <label class="text-xs font-medium modal-label">Modelo</label>
                    <p class="font-semibold modal-value">${record.model || 'N/A'}</p>
                </div>
                <div class="space-y-1">
                    <label class="text-xs font-medium modal-label">Contrato</label>
                    <p class="font-semibold modal-value">${record.contract}</p>
                </div>
                <div class="space-y-1">
                    <label class="text-xs font-medium modal-label">Fecha Programada</label>
                    <p class="font-semibold modal-value">${scheduledDate}</p>
                </div>
                ${record.key_id ? `
                <div class="space-y-1">
                    <label class="text-xs font-medium modal-label">ID Clave/TAG</label>
                    <p class="font-semibold modal-value">${record.key_id}</p>
                </div>
                ` : ''}
                <div class="space-y-1">
                    <label class="text-xs font-medium modal-label">Prioridad</label>
                    <p class="font-semibold modal-value">${record.priority || 'Media'}</p>
                </div>
            </div>

            ${record.description ? `
            <div class="mb-4">
                <label class="text-xs font-medium block mb-1 modal-description-label">Descripción</label>
                <p class="text-sm italic modal-description-text">${record.description}</p>
            </div>
            ` : ''}

            ${(contact.name || contact.phone || contact.notes) ? `
            <h3 class="text-sm font-semibold mt-4 mb-2 modal-contact-header">Contacto</h3>
            <div class="grid grid-cols-2 gap-4 text-sm">
                ${contact.name ? `
                <div class="space-y-1">
                    <label class="text-xs font-medium modal-label">Nombre</label>
                    <p class="font-semibold modal-value">${contact.name}</p>
                </div>
                ` : ''}
                ${contact.phone ? `
                <div class="space-y-1">
                    <label class="text-xs font-medium modal-label">Teléfono</label>
                    <p class="font-semibold modal-value">${contact.phone}</p>
                </div>
                ` : ''}
            </div>
            ${contact.notes ? `
            <div class="space-y-1 mt-4 text-sm">
                <label class="text-xs font-medium modal-label">Notas de Contacto</label>
                <p class="italic modal-value">${contact.notes}</p>
            </div>
            ` : ''}
            ` : ''}
        </div>

        <div class="modal-footer p-4 border-t flex justify-center">
            <button onclick="deleteRecord('${record.id}')" class="primary-btn bg-red-600 hover:bg-red-700 px-6 py-2 rounded-lg flex items-center gap-2">
                <i class="ph ph-trash"></i>
                <span>Eliminar Registro</span>
            </button>
        </div>
    `;

    modal.querySelector('.modal-content').innerHTML = modalContent;
    modal.classList.remove('hidden');
}

window.closeRecordModal = function () {
    document.getElementById('record-detail-modal').classList.add('hidden');
};

window.deleteRecord = async function (recordId) {
    if (!confirm('¿Estás seguro de que deseas eliminar este registro del historial?')) {
        return;
    }

    closeRecordModal();

    try {
        const historyRef = getHistoryCollectionRef();
        if (!historyRef) return;

        await historyRef.doc(recordId).delete();

        // Recargar la vista actual
        if (currentMaintenanceLocation) {
            loadRecords(currentMaintenanceId, currentMaintenanceLocation);
        }
    } catch (error) {
        console.error("Error al eliminar el registro:", error);
        alert("Error al eliminar el registro. Por favor, inténtalo de nuevo.");
    }
};

// -----------------------------------------------------------------
// 7. BÚSQUEDA
// -----------------------------------------------------------------

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
};

function setupSearch() {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();

            if (currentView === 'maintenances') {
                if (!term) {
                    renderMaintenances(allMaintenancesData);
                } else {
                    const filtered = allMaintenancesData.filter(item =>
                        (item.location && item.location.toLowerCase().includes(term)) ||
                        (item.model && item.model.toLowerCase().includes(term)) ||
                        (item.contract && item.contract.toLowerCase().includes(term))
                    );
                    renderMaintenances(filtered);
                }
            } else if (currentView === 'records') {
                if (!term) {
                    renderRecords(allRecordsData);
                } else {
                    const filtered = allRecordsData.filter(record =>
                        (record.username && record.username.toLowerCase().includes(term)) ||
                        (record.location && record.location.toLowerCase().includes(term)) ||
                        (record.model && record.model.toLowerCase().includes(term))
                    );
                    renderRecords(filtered);
                }
            }
        });
    }
}

// -----------------------------------------------------------------
// 8. INICIALIZACIÓN
// -----------------------------------------------------------------

window.addEventListener('load', () => {
    if (typeof window.applyColorMode === 'function') {
        window.applyColorMode();
    }

    window.addEventListener('storage', (e) => {
        if (e.key === 'portis-theme') {
            if (typeof window.applyColorMode === 'function') {
                window.applyColorMode();
            }
        }
    });

    checkAuthenticationAndSetup();
    setupSearch();

    // Efectos visuales
    const scrollContainer = document.getElementById('app-content');
    if (scrollContainer) scrollContainer.addEventListener('scroll', updateCardBorderOpacity);
    window.addEventListener('scroll', updateCardBorderOpacity, { passive: true });
    window.addEventListener('resize', updateCardBorderOpacity);

    // Forzar actualización inicial
    setTimeout(updateCardBorderOpacity, 100);
    setTimeout(updateCardBorderOpacity, 500);
});

// Fin del archivo

