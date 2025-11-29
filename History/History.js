/**
 * ====================================================================
 * History.js - Historial de Mantenimientos Completados
 * ====================================================================
 */

// -----------------------------------------------------------------
// 1. CONFIGURACIÓN Y VARIABLES GLOBALES
// -----------------------------------------------------------------
const firebaseConfig = window.firebaseConfig;
const IS_MOCK_MODE = window.IS_MOCK_MODE;

if (IS_MOCK_MODE) {
    console.warn("History: Modo MOCK activado.");
}

const appId = firebaseConfig ? firebaseConfig.projectId : 'mock-app-id';

let app;
let db;
let auth;
let userId = null;
let isAuthReady = false;

// Variables de estado
let currentView = 'maintenances'; // 'maintenances' o 'records'
let currentMaintenanceId = null;
let currentMaintenanceLocation = null;

// Claves de localStorage
const MOCK_HISTORY_STORAGE_KEY = 'mock_history_data';
const MOCK_REPAIRS_KEY = 'portis-repairs-mock';

// Cache de datos
let allMaintenancesData = [];
let allRecordsData = [];

/**
 * Función auxiliar para obtener

 el historial mock guardado.
 */
function getLocalMockHistory() {
    try {
        const storedHistory = localStorage.getItem(MOCK_HISTORY_STORAGE_KEY);
        return storedHistory ? JSON.parse(storedHistory) : [];
    } catch (e) {
        console.error("Error al leer historial mock de localStorage:", e);
        return [];
    }
}

/**
 * Función auxiliar para guardar el historial mock en localStorage.
 */
function saveLocalMockHistory(history) {
    if (!IS_MOCK_MODE) return;
    try {
        localStorage.setItem(MOCK_HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
        console.error("Error al guardar historial mock en localStorage:", e);
    }
}

/**
 * Función auxiliar para obtener mantenimientos mock.
 */
function getLocalMockRepairs() {
    try {
        const storedRepairs = localStorage.getItem(MOCK_REPAIRS_KEY);
        return storedRepairs ? JSON.parse(storedRepairs) : [];
    } catch (e) {
        console.error("Error al leer mantenimientos mock de localStorage:", e);
        return [];
    }
}

// -----------------------------------------------------------------
// 2. AUTENTICACIÓN Y SETUP
// -----------------------------------------------------------------

function checkAuthenticationAndSetup() {
    userId = sessionStorage.getItem('portis-user-identifier');
    const userDisplayName = sessionStorage.getItem('portis-user-display-name');
    const displayElement = document.getElementById('current-user-display');

    if (!userId || !userDisplayName) {
        console.warn("Sesión no válida o caducada. Redirigiendo a Index.");
        window.location.href = '../index.html';
        return;
    }

    if (displayElement) {
        displayElement.textContent = userDisplayName;
    }

    if (IS_MOCK_MODE) {
        console.warn("Modo MOCK activado. Usando datos no persistentes.");
        isAuthReady = true;
        loadMaintenances();
    } else {
        initializeAppAndAuth();
    }
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
                console.warn("Firebase no detecta sesión activa. Redirigiendo.");
                window.location.href = '../index.html';
            }
        });

    } catch (error) {
        console.error("Error al inicializar Firebase o al autenticar:", error);
        document.getElementById('maintenances-list').innerHTML = `
            <div class="message-error p-3 mt-4 text-red-400 bg-red-900/40 border border-red-900 rounded-lg">
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
    // Colección raíz 'history' según las reglas de Firestore
    // Filtraremos por userId en las queries
    return db.collection('history');
}

async function loadMaintenances() {
    if (IS_MOCK_MODE) {
        // En mock mode, obtenemos todos los mantenimientos únicos
        const mockRepairs = getLocalMockRepairs();
        // Agrupamos por location para simular "mantenimientos únicos"
        const uniqueMaintenances = [];
        const seen = new Set();

        mockRepairs.forEach(repair => {
            const key = `${repair.location}-${repair.model || ''}-${repair.contract}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueMaintenances.push(repair);
            }
        });

        allMaintenancesData = uniqueMaintenances;
        renderMaintenances(uniqueMaintenances);
    } else {
        try {
            const repairsRef = getRepairsCollectionRef();
            if (!repairsRef) return;

            const snapshot = await repairsRef.get();
            const maintenances = [];
            const seen = new Set();

            snapshot.forEach(doc => {
                const data = { id: doc.id, ...doc.data() };
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
}

async function loadRecords(maintenanceId, location) {
    currentMaintenanceId = maintenanceId;
    currentMaintenanceLocation = location;

    document.getElementById('records-title').innerHTML = `
        <i class="ph ph-clock-counter-clockwise" style="color: var(--color-accent-red);"></i>
        Registros: ${location}
    `;

    if (IS_MOCK_MODE) {
        const mockHistory = getLocalMockHistory();
        const records = mockHistory.filter(record =>
            record.location === location
        );
        allRecordsData = records;
        renderRecords(records);
    } else {
        try {
            const historyRef = getHistoryCollectionRef();
            if (!historyRef) return;

            // Filtrar por userId y location según las reglas de Firestore
            const snapshot = await historyRef
                .where('userId', '==', userId)
                .where('location', '==', location)
                .orderBy('completedAt', 'desc')
                .get();

            const records = [];
            snapshot.forEach(doc => {
                records.push({ id: doc.id, ...doc.data() });
            });

            allRecordsData = records;
            renderRecords(records);
        } catch (error) {
            console.error("Error al cargar registros:", error);
            document.getElementById('records-list').innerHTML = `
                <div class="message-error p-3 text-red-400 bg-red-900/40 border border-red-900 rounded-lg">
                    Error al cargar los registros.
                </div>
            `;
        }
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
            <div class="p-4 text-center rounded-lg" style="background-color: var(--color-bg-secondary); color: var(--color-text-secondary);">
                No hay mantenimientos registrados.
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
}

function createMaintenanceCard(item) {
    const card = document.createElement('div');
    card.className = 'repair-card p-4 rounded-xl shadow-sm border relative group cursor-pointer transition-all duration-200 hover:shadow-md';
    card.style.backgroundColor = 'var(--color-bg-secondary)';
    card.style.borderColor = 'var(--color-border)';

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
            <span class="text-xs font-medium px-2 py-1 rounded-full text-gray-500 bg-gray-100 dark:bg-gray-800">
                ${item.contract || 'N/A'}
            </span>
        </div>
        
        <div class="text-sm mb-3 space-y-1" style="color: var(--color-text-secondary);">
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

        <div class="flex justify-between items-center mt-3 pt-3 border-t" style="border-color: var(--color-border);">
            <span class="text-sm font-semibold ${priorityColor}">
                <i class="ph ph-warning-circle mr-1"></i> ${displayPriority}
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
            <div class="p-4 text-center rounded-lg" style="background-color: var(--color-bg-secondary); color: var(--color-text-secondary);">
                No hay registros de este mantenimiento.
            </div>
        `;
        return;
    }

    records.forEach(record => {
        const card = createRecordCard(record);
        listContainer.appendChild(card);
    });
}

function createRecordCard(record) {
    const card = document.createElement('div');
    card.className = 'repair-card p-4 rounded-xl shadow-sm border relative group cursor-pointer transition-all duration-200 hover:shadow-md';
    card.style.backgroundColor = 'var(--color-bg-secondary)';
    card.style.borderColor = 'var(--color-border)';

    // Formatear fecha de completado
    let completedDate = 'Fecha no disponible';
    if (record.completedAt) {
        const date = record.completedAt.toDate ? record.completedAt.toDate() : new Date(record.completedAt);
        completedDate = date.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    card.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <div class="flex-1">
                <p class="text-sm font-light mb-1" style="color: var(--color-text-secondary);">
                    <i class="ph ph-calendar-check mr-1"></i> ${completedDate}
                </p>
                <p class="text-sm font-medium" style="color: var(--color-text-primary);">
                    <i class="ph ph-user mr-1"></i> Completado por: ${record.username || 'Usuario desconocido'}
                </p>
            </div>
            <span class="text-xs font-medium px-2 py-1 rounded-full text-green-500 bg-green-100 dark:bg-green-900/30">
                Completado
            </span>
        </div>

        <div class="text-sm" style="color: var(--color-text-secondary);">
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

        <div class="flex justify-end items-center mt-3 pt-3 border-t" style="border-color: var(--color-border);">
            <button class="action-btn p-2 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-blue-500" 
                    title="Ver detalles">
                <i class="ph ph-info text-lg"></i>
            </button>
        </div>
    `;

    card.addEventListener('click', () => {
        showRecordDetailsModal(record);
    });

    return card;
}

// -----------------------------------------------------------------
// 5. FUNCIONES DE NAVEGACIÓN
// -----------------------------------------------------------------

function showRecordsView(maintenanceId, location) {
    currentView = 'records';
    document.getElementById('maintenances-view').classList.add('hidden');
    document.getElementById('records-view').classList.remove('hidden');
    document.getElementById('page-title').textContent = 'Registros';
    loadRecords(maintenanceId, location);
}

function showMaintenancesView() {
    currentView = 'maintenances';
    document.getElementById('maintenances-view').classList.remove('hidden');
    document.getElementById('records-view').classList.add('hidden');
    document.getElementById('page-title').textContent = 'Historial de Mantenimientos';
    currentMaintenanceId = null;
    currentMaintenanceLocation = null;
}

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
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const monthIndex = (record.maintenance_month >= 1 && record.maintenance_month <= 12) ? record.maintenance_month - 1 : 0;
    const scheduledDate = `${monthNames[monthIndex]} de ${record.maintenance_year}`;

    const contact = record.contact || {};

    const modalContent = `
        <div class="modal-header p-4 border-b flex justify-between items-center" style="border-color: var(--color-border);">
            <h2 class="text-xl font-bold">Detalles del Registro</h2>
            <button onclick="closeRecordModal()" class="secondary-icon-btn p-1 rounded-full">
                <i class="ph ph-x text-2xl"></i>
            </button>
        </div>

        <div class="modal-body p-4">
            <div class="mb-4 p-3 rounded-lg" style="background-color: var(--color-bg-tertiary);">
                <p class="text-lg font-semibold mb-2" style="color: var(--color-accent-blue);">
                    <i class="ph ph-calendar-check mr-2"></i> ${completedDate}
                </p>
                <p class="text-sm" style="color: var(--color-text-secondary);">
                    <i class="ph ph-user mr-2"></i> Completado por: <span class="font-medium" style="color: var(--color-text-primary);">${record.username || 'Usuario desconocido'}</span>
                </p>
            </div>

            <h3 class="text-lg font-bold mb-3" style="color: var(--color-text-light);">Información del Mantenimiento</h3>
            
            <div class="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div class="space-y-1">
                    <label class="text-xs font-medium" style="color: var(--color-text-secondary);">Ubicación</label>
                    <p class="font-semibold" style="color: var(--color-text-primary);">${record.location}</p>
                </div>
                <div class="space-y-1">
                    <label class="text-xs font-medium" style="color: var(--color-text-secondary);">Modelo</label>
                    <p class="font-semibold" style="color: var(--color-text-primary);">${record.model || 'N/A'}</p>
                </div>
                <div class="space-y-1">
                    <label class="text-xs font-medium" style="color: var(--color-text-secondary);">Contrato</label>
                    <p class="font-semibold" style="color: var(--color-text-primary);">${record.contract}</p>
                </div>
                <div class="space-y-1">
                    <label class="text-xs font-medium" style="color: var(--color-text-secondary);">Fecha Programada</label>
                    <p class="font-semibold" style="color: var(--color-text-primary);">${scheduledDate}</p>
                </div>
                ${record.key_id ? `
                <div class="space-y-1">
                    <label class="text-xs font-medium" style="color: var(--color-text-secondary);">ID Clave/TAG</label>
                    <p class="font-semibold" style="color: var(--color-text-primary);">${record.key_id}</p>
                </div>
                ` : ''}
                <div class="space-y-1">
                    <label class="text-xs font-medium" style="color: var(--color-text-secondary);">Prioridad</label>
                    <p class="font-semibold" style="color: var(--color-text-primary);">${record.priority || 'Media'}</p>
                </div>
            </div>

            ${record.description ? `
            <div class="mb-4">
                <label class="text-xs font-medium block mb-1" style="color: var(--color-text-secondary);">Descripción</label>
                <p class="text-sm italic" style="color: var(--color-text-primary);">${record.description}</p>
            </div>
            ` : ''}

            ${(contact.name || contact.phone || contact.notes) ? `
            <h3 class="text-sm font-semibold mt-4 mb-2" style="color: var(--color-accent-red);">Contacto</h3>
            <div class="grid grid-cols-2 gap-4 text-sm">
                ${contact.name ? `
                <div class="space-y-1">
                    <label class="text-xs font-medium" style="color: var(--color-text-secondary);">Nombre</label>
                    <p class="font-semibold" style="color: var(--color-text-primary);">${contact.name}</p>
                </div>
                ` : ''}
                ${contact.phone ? `
                <div class="space-y-1">
                    <label class="text-xs font-medium" style="color: var(--color-text-secondary);">Teléfono</label>
                    <p class="font-semibold" style="color: var(--color-text-primary);">${contact.phone}</p>
                </div>
                ` : ''}
            </div>
            ${contact.notes ? `
            <div class="space-y-1 mt-4 text-sm">
                <label class="text-xs font-medium" style="color: var(--color-text-secondary);">Notas de Contacto</label>
                <p class="italic" style="color: var(--color-text-primary);">${contact.notes}</p>
            </div>
            ` : ''}
            ` : ''}
        </div>

        <div class="modal-footer p-4 border-t flex justify-center" style="border-color: var(--color-border);">
            <button onclick="closeRecordModal()" class="secondary-btn px-6 py-2 rounded-lg">
                Cerrar
            </button>
        </div>
    `;

    modal.querySelector('.modal-content').innerHTML = modalContent;
    modal.classList.remove('hidden');
}

window.closeRecordModal = function () {
    document.getElementById('record-detail-modal').classList.add('hidden');
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
});