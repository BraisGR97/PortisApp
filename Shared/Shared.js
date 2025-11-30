/**
 * ====================================================================
 * Shared.js - Módulo de Compartir Mantenimientos
 * ====================================================================
 * Permite compartir mantenimientos entre usuarios con opción de incluir
 * registros históricos. Los datos compartidos expiran en 48 horas.
 */

// -----------------------------------------------------------------
// 1. CONFIGURACIÓN Y VARIABLES GLOBALES
// -----------------------------------------------------------------

const firebaseConfig = window.firebaseConfig;
const IS_MOCK_MODE = window.IS_MOCK_MODE;

if (IS_MOCK_MODE) {
    console.warn("Shared: Modo MOCK activado.");
}

const appId = firebaseConfig ? firebaseConfig.projectId : 'mock-app-id';

let app;
let db;
let auth;
let userId = null;
let userDisplayName = null;
let isAuthReady = false;

// Claves de localStorage para modo mock
const MOCK_SHARED_SENT_KEY = 'portis-shared-sent-mock';
const MOCK_SHARED_RECEIVED_KEY = 'portis-shared-received-mock';
const MOCK_REPAIRS_KEY = 'portis-repairs-mock';
const MOCK_HISTORY_KEY = 'mock_history_data';
const MOCK_USERS_KEY = 'portis-mock-users';

// Cache de datos
let allRepairs = [];
let allUsers = [];
let sharedReceived = [];

// -----------------------------------------------------------------
// 2. FUNCIONES AUXILIARES DE MOCK MODE
// -----------------------------------------------------------------

function getLocalMockRepairs() {
    try {
        const stored = localStorage.getItem(MOCK_REPAIRS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error("Error al leer repairs mock:", e);
        return [];
    }
}

function getLocalMockHistory() {
    try {
        const stored = localStorage.getItem(MOCK_HISTORY_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error("Error al leer history mock:", e);
        return [];
    }
}

function getLocalMockSharedSent() {
    try {
        const stored = localStorage.getItem(MOCK_SHARED_SENT_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
}

function saveLocalMockSharedSent(data) {
    try {
        localStorage.setItem(MOCK_SHARED_SENT_KEY, JSON.stringify(data));
    } catch (e) {
        console.error("Error al guardar shared sent mock:", e);
    }
}

function getLocalMockSharedReceived() {
    try {
        const stored = localStorage.getItem(MOCK_SHARED_RECEIVED_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
}

function saveLocalMockSharedReceived(data) {
    try {
        localStorage.setItem(MOCK_SHARED_RECEIVED_KEY, JSON.stringify(data));
    } catch (e) {
        console.error("Error al guardar shared received mock:", e);
    }
}

function getMockUsers() {
    return [
        { id: 'Alfonso_Perez_UID', name: 'Alfonso Pérez' },
        { id: 'Beatriz_Lopez_UID', name: 'Beatriz López' },
        { id: 'Carlos_Martin_UID', name: 'Carlos Martín' }
    ];
}

// -----------------------------------------------------------------
// 3. AUTENTICACIÓN Y SETUP
// -----------------------------------------------------------------

function checkAuthenticationAndSetup() {
    userId = sessionStorage.getItem('portis-user-identifier');
    userDisplayName = sessionStorage.getItem('portis-user-display-name');
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
        loadData();
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
                loadData();
            } else {
                console.warn("Firebase no detecta sesión activa. Redirigiendo.");
                window.location.href = '../index.html';
            }
        });

    } catch (error) {
        console.error("Error al inicializar Firebase:", error);
        document.getElementById('upload-list').innerHTML = `
            <div class="message-error p-3 text-red-400 bg-red-900/40 border border-red-900 rounded-lg">
                Error de conexión. No se pudo cargar los datos.
            </div>
        `;
    }
}

// -----------------------------------------------------------------
// 4. FUNCIONES DE CARGA DE DATOS
// -----------------------------------------------------------------

async function loadData() {
    await Promise.all([
        loadRepairs(),
        loadUsers(),
        loadSharedReceived()
    ]);
}

async function loadRepairs() {
    if (IS_MOCK_MODE) {
        allRepairs = getLocalMockRepairs();
        renderSendView();
    } else {
        try {
            if (!db || !userId) return;
            const repairsRef = db.collection(`users/${userId}/repairs`);
            const snapshot = await repairsRef.get();

            allRepairs = [];
            snapshot.forEach(doc => {
                allRepairs.push({ id: doc.id, ...doc.data() });
            });

            renderSendView();
        } catch (error) {
            console.error("Error al cargar mantenimientos:", error);
        }
    }
}

async function loadUsers() {
    if (IS_MOCK_MODE) {
        allUsers = getMockUsers().filter(u => u.id !== userId);
        console.log('[SHARED] MOCK: Usuarios cargados:', allUsers);
    } else {
        try {
            if (!db) {
                console.error('[SHARED] loadUsers: db no inicializada');
                return;
            }
            console.log('[SHARED] Cargando usuarios desde Firestore...');
            const usersRef = db.collection('users');
            const snapshot = await usersRef.get();
            console.log('[SHARED] Snapshot usuarios, tamaño:', snapshot.size);

            allUsers = [];
            snapshot.forEach(doc => {
                const userData = doc.data();
                console.log('[SHARED] Usuario encontrado:', doc.id, userData);
                if (doc.id !== userId) {
                    allUsers.push({
                        id: doc.id,
                        name: userData.displayName || userData.email || 'Usuario'
                    });
                }
            });
            console.log('[SHARED] Total usuarios (sin actual):', allUsers.length);
            console.log('[SHARED] Lista usuarios:', allUsers);

            // Re-renderizar las tarjetas para actualizar los selectores con los usuarios cargados
            renderSendView();
        } catch (error) {
            console.error("Error al cargar usuarios:", error);
            allUsers = [];
        }
    }
}

async function loadSharedReceived() {
    if (IS_MOCK_MODE) {
        let received = getLocalMockSharedReceived();
        // Filtrar los que han expirado (48h)
        const now = Date.now();
        received = received.filter(item => {
            const sharedTime = item.sharedAt || 0;
            const hoursPassed = (now - sharedTime) / (1000 * 60 * 60);
            return hoursPassed < 48;
        });
        saveLocalMockSharedReceived(received);
        sharedReceived = received;
        renderReceiveView();
    } else {
        try {
            if (!db || !userId) return;
            const sharedRef = db.collection('shared')
                .where('recipientId', '==', userId)
                .where('expiresAt', '>', new Date());

            const snapshot = await sharedRef.get();
            sharedReceived = [];
            snapshot.forEach(doc => {
                sharedReceived.push({ id: doc.id, ...doc.data() });
            });

            renderReceiveView();
        } catch (error) {
            console.error("Error al cargar compartidos recibidos:", error);
        }
    }
}

// -----------------------------------------------------------------
// 5. RENDERIZADO - VISTA ENVIAR
// -----------------------------------------------------------------

function renderSendView() {
    const container = document.getElementById('upload-list');
    container.innerHTML = '';

    if (allRepairs.length === 0) {
        container.innerHTML = `
            <div class="p-4 text-center rounded-lg" style="background-color: var(--color-bg-secondary); color: var(--color-text-secondary);">
                No hay mantenimientos para compartir.
            </div>
        `;
        return;
    }

    allRepairs.forEach(repair => {
        const card = createSendCard(repair);
        container.appendChild(card);
    });
}

function createSendCard(repair) {
    const card = document.createElement('div');
    card.className = 'repair-card p-4 rounded-xl shadow-sm border relative group';
    card.style.backgroundColor = 'var(--color-bg-secondary)';
    card.style.borderColor = 'var(--color-border)';

    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const monthIndex = (repair.maintenance_month >= 1 && repair.maintenance_month <= 12) ? repair.maintenance_month - 1 : 0;
    const maintenanceDate = `${monthNames[monthIndex]} de ${repair.maintenance_year}`;

    console.log('[SHARED] createSendCard - allUsers:', allUsers);

    card.innerHTML = `
        <div class="mb-3">
            <p class="text-sm font-light mb-1" style="color: var(--color-text-secondary);">
                ${maintenanceDate} | Contrato: ${repair.contract}
            </p>
            <h3 class="font-bold text-lg" style="color: var(--color-text-primary);">
                ${repair.location || 'Sin Ubicación'}
            </h3>
            ${repair.model ? `
                <p class="text-sm mt-1" style="color: var(--color-text-secondary);">
                    <i class="ph ph-wrench mr-1"></i> ${repair.model}
                </p>
            ` : ''}
        </div>

        <div class="flex items-center gap-2 mb-3">
            <select id="user-select-${repair.id}" class="flex-1 px-3 py-2 rounded-lg text-sm" 
                    style="background-color: var(--color-bg-tertiary); color: var(--color-text-primary); border: 1px solid var(--color-border);">
                <option value="">Seleccionar usuario...</option>
                ${allUsers.map(user => `<option value="${user.id}">${user.name}</option>`).join('')}
            </select>
        </div>

        <div class="flex items-center justify-between pt-3 border-t" style="border-color: var(--color-border);">
            <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="include-records-${repair.id}" 
                       class="w-4 h-4 rounded cursor-pointer" 
                       style="accent-color: var(--color-accent-red);">
                <span class="text-sm" style="color: var(--color-text-secondary);">Incluir registros</span>
            </label>

            <button onclick="shareRepair('${repair.id}')" 
                    class="primary-btn px-4 py-2 rounded-lg flex items-center gap-2">
                <i class="ph ph-paper-plane-tilt"></i>
                <span>Enviar</span>
            </button>
        </div>

        <div id="share-message-${repair.id}" class="hidden mt-2 p-2 rounded text-sm text-center" 
             style="background-color: var(--color-accent-blue); color: white;">
        </div>
    `;

    // Listener para el checkbox
    const checkbox = card.querySelector(`#include-records-${repair.id}`);
    const messageDiv = card.querySelector(`#share-message-${repair.id}`);

    if (checkbox && messageDiv) {
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                messageDiv.textContent = '✓ Los registros históricos serán incluidos';
                messageDiv.classList.remove('hidden');
            } else {
                messageDiv.classList.add('hidden');
            }
        });
    }

    return card;
}

// -----------------------------------------------------------------
// 6. RENDERIZADO - VISTA RECIBIDOS
// -----------------------------------------------------------------

function renderReceiveView() {
    const container = document.getElementById('download-list');
    container.innerHTML = '';

    if (sharedReceived.length === 0) {
        container.innerHTML = `
            <div class="p-4 text-center rounded-lg" style="background-color: var(--color-bg-secondary); color: var(--color-text-secondary);">
                No has recibido mantenimientos compartidos.
            </div>
        `;
        return;
    }

    sharedReceived.forEach(shared => {
        const card = createReceivedCard(shared);
        container.appendChild(card);
    });
}

function createReceivedCard(shared) {
    const card = document.createElement('div');
    card.className = 'repair-card p-4 rounded-xl shadow-sm border relative group cursor-pointer transition-all duration-200 hover:shadow-md';
    card.style.backgroundColor = 'var(--color-bg-secondary)';
    card.style.borderColor = 'var(--color-border)';

    const repair = shared.repairData || {};
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const monthIndex = (repair.maintenance_month >= 1 && repair.maintenance_month <= 12) ? repair.maintenance_month - 1 : 0;
    const maintenanceDate = `${monthNames[monthIndex]} de ${repair.maintenance_year}`;

    // Calcular tiempo restante
    const expiresAt = shared.expiresAt ? (shared.expiresAt.toDate ? shared.expiresAt.toDate() : new Date(shared.expiresAt)) : new Date();
    const now = new Date();
    const hoursLeft = Math.max(0, Math.floor((expiresAt - now) / (1000 * 60 * 60)));

    card.innerHTML = `
        <div class="mb-2">
            <div class="flex items-center justify-between mb-2">
                <p class="text-xs font-medium" style="color: var(--color-accent-blue);">
                    <i class="ph ph-user mr-1"></i> Compartido por: ${shared.senderName || 'Usuario'}
                </p>
                <span class="text-xs px-2 py-1 rounded-full" style="background-color: var(--color-accent-red); color: white;">
                    <i class="ph ph-clock mr-1"></i> ${hoursLeft}h restantes
                </span>
            </div>
            <p class="text-sm font-light mb-1" style="color: var(--color-text-secondary);">
                ${maintenanceDate} | Contrato: ${repair.contract}
            </p>
            <h3 class="font-bold text-lg" style="color: var(--color-text-primary);">
                ${repair.location || 'Sin Ubicación'}
            </h3>
            ${repair.model ? `
                <p class="text-sm mt-1" style="color: var(--color-text-secondary);">
                    <i class="ph ph-wrench mr-1"></i> ${repair.model}
                </p>
            ` : ''}
        </div>

        ${shared.includeRecords ? `
            <div class="mt-2 p-2 rounded text-xs" style="background-color: var(--color-bg-tertiary); color: var(--color-text-secondary);">
                <i class="ph ph-clock-counter-clockwise mr-1"></i> Incluye registros históricos
            </div>
        ` : ''}
    `;

    card.addEventListener('click', () => {
        showSharedDetailModal(shared);
    });

    return card;
}

// -----------------------------------------------------------------
// 7. FUNCIONES DE COMPARTIR
// -----------------------------------------------------------------

window.shareRepair = async function (repairId) {
    const repair = allRepairs.find(r => r.id === repairId);
    if (!repair) return;

    const userSelect = document.getElementById(`user-select-${repairId}`);
    const includeRecordsCheckbox = document.getElementById(`include-records-${repairId}`);
    const messageDiv = document.getElementById(`share-message-${repairId}`);

    if (!userSelect || !userSelect.value) {
        if (messageDiv) {
            messageDiv.textContent = '⚠️ Por favor selecciona un usuario';
            messageDiv.style.backgroundColor = 'var(--color-accent-red)';
            messageDiv.classList.remove('hidden');
            setTimeout(() => messageDiv.classList.add('hidden'), 3000);
        }
        return;
    }

    const recipientId = userSelect.value;
    const recipientName = allUsers.find(u => u.id === recipientId)?.name || 'Usuario';
    const includeRecords = includeRecordsCheckbox ? includeRecordsCheckbox.checked : false;

    // Preparar datos para compartir
    const sharedData = {
        senderId: userId,
        senderName: userDisplayName,
        recipientId: recipientId,
        recipientName: recipientName,
        repairData: repair,
        includeRecords: includeRecords,
        sharedAt: Date.now(),
        expiresAt: Date.now() + (48 * 60 * 60 * 1000) // 48 horas
    };

    // Incluir registros si está marcado
    if (includeRecords) {
        if (IS_MOCK_MODE) {
            const allHistory = getLocalMockHistory();
            sharedData.records = allHistory.filter(r => r.location === repair.location);
        } else {
            try {
                const historyRef = db.collection('history')
                    .where('userId', '==', userId)
                    .where('location', '==', repair.location);
                const snapshot = await historyRef.get();
                sharedData.records = [];
                snapshot.forEach(doc => {
                    sharedData.records.push(doc.data());
                });
            } catch (error) {
                console.error("Error al obtener registros:", error);
            }
        }
    }

    // Guardar en base de datos o mock
    if (IS_MOCK_MODE) {
        const received = getLocalMockSharedReceived();
        sharedData.id = `shared_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        received.push(sharedData);
        saveLocalMockSharedReceived(received);

        if (messageDiv) {
            messageDiv.textContent = `✓ Compartido con ${recipientName}`;
            messageDiv.style.backgroundColor = '#4CAF50';
            messageDiv.classList.remove('hidden');
            setTimeout(() => {
                messageDiv.classList.add('hidden');
                userSelect.value = '';
                if (includeRecordsCheckbox) includeRecordsCheckbox.checked = false;
            }, 2000);
        }
    } else {
        try {
            if (!db) return;
            await db.collection('shared').add({
                ...sharedData,
                expiresAt: new Date(sharedData.expiresAt)
            });

            if (messageDiv) {
                messageDiv.textContent = `✓ Compartido con ${recipientName}`;
                messageDiv.style.backgroundColor = '#4CAF50';
                messageDiv.classList.remove('hidden');
                setTimeout(() => {
                    messageDiv.classList.add('hidden');
                    userSelect.value = '';
                    if (includeRecordsCheckbox) includeRecordsCheckbox.checked = false;
                }, 2000);
            }
        } catch (error) {
            console.error("Error al compartir:", error);
            if (messageDiv) {
                messageDiv.textContent = '✗ Error al compartir';
                messageDiv.style.backgroundColor = 'var(--color-accent-red)';
                messageDiv.classList.remove('hidden');
                setTimeout(() => messageDiv.classList.add('hidden'), 3000);
            }
        }
    }
};

// -----------------------------------------------------------------
// 8. MODAL DE DETALLES
// -----------------------------------------------------------------

function showSharedDetailModal(shared) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modal.id = 'shared-detail-modal';

    const repair = shared.repairData || {};
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const monthIndex = (repair.maintenance_month >= 1 && repair.maintenance_month <= 12) ? repair.maintenance_month - 1 : 0;
    const scheduledDate = `${monthNames[monthIndex]} de ${repair.maintenance_year}`;

    const contact = repair.contact || {};

    modal.innerHTML = `
        <div class="modal-content max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl" 
             style="background-color: var(--color-bg-primary);">
            <div class="modal-header p-4 border-b flex justify-between items-center" style="border-color: var(--color-border);">
                <h2 class="text-xl font-bold">Detalles del Mantenimiento Compartido</h2>
                <button onclick="closeSharedModal()" class="secondary-icon-btn p-1 rounded-full border-2" style="border-color: var(--color-border);">
                    <i class="ph ph-x text-2xl"></i>
                </button>
            </div>

            <div class="modal-body p-4">
                <div class="mb-4 p-3 rounded-lg" style="background-color: var(--color-bg-tertiary);">
                    <p class="text-sm mb-1" style="color: var(--color-text-secondary);">
                        <i class="ph ph-user mr-2"></i> Compartido por: <span class="font-semibold">${shared.senderName || 'Usuario'}</span>
                    </p>
                    <p class="text-sm" style="color: var(--color-text-secondary);">
                        <i class="ph ph-clock mr-2"></i> Expira: ${new Date(shared.expiresAt).toLocaleString('es-ES')}
                    </p>
                </div>

                <h3 class="text-lg font-bold mb-3" style="color: var(--color-text-light);">Información del Mantenimiento</h3>
                
                <div class="grid grid-cols-2 gap-4 mb-4 text-sm">
                    <div class="space-y-1">
                        <label class="text-xs font-medium" style="color: var(--color-text-secondary);">Ubicación</label>
                        <p class="font-semibold" style="color: var(--color-text-primary);">${repair.location}</p>
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium" style="color: var(--color-text-secondary);">Modelo</label>
                        <p class="font-semibold" style="color: var(--color-text-primary);">${repair.model || 'N/A'}</p>
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium" style="color: var(--color-text-secondary);">Contrato</label>
                        <p class="font-semibold" style="color: var(--color-text-primary);">${repair.contract}</p>
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium" style="color: var(--color-text-secondary);">Fecha Programada</label>
                        <p class="font-semibold" style="color: var(--color-text-primary);">${scheduledDate}</p>
                    </div>
                    ${repair.key_id ? `
                    <div class="space-y-1">
                        <label class="text-xs font-medium" style="color: var(--color-text-secondary);">ID Clave/TAG</label>
                        <p class="font-semibold" style="color: var(--color-text-primary);">${repair.key_id}</p>
                    </div>
                    ` : ''}
                    <div class="space-y-1">
                        <label class="text-xs font-medium" style="color: var(--color-text-secondary);">Prioridad</label>
                        <p class="font-semibold" style="color: var(--color-text-primary);">${repair.priority || 'Media'}</p>
                    </div>
                </div>

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

                ${shared.includeRecords && shared.records && shared.records.length > 0 ? `
                <h3 class="text-lg font-bold mt-6 mb-3" style="color: var(--color-text-light);">
                    <i class="ph ph-clock-counter-clockwise mr-2"></i>Registros Históricos (${shared.records.length})
                </h3>
                <div class="space-y-2 max-h-64 overflow-y-auto">
                    ${shared.records.map(record => {
        const completedDate = record.completedAt ?
            new Date(record.completedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) :
            'Fecha no disponible';
        return `
                            <div class="p-3 rounded-lg" style="background-color: var(--color-bg-tertiary);">
                                <p class="text-sm font-semibold" style="color: var(--color-text-primary);">
                                    <i class="ph ph-calendar-check mr-1"></i> ${completedDate}
                                </p>
                                <p class="text-xs mt-1" style="color: var(--color-text-secondary);">
                                    Por: ${record.username || 'Usuario desconocido'}
                                </p>
                                ${record.description ? `
                                <p class="text-xs mt-1 italic" style="color: var(--color-text-secondary);">
                                    ${record.description}
                                </p>
                                ` : ''}
                            </div>
                        `;
    }).join('')}
                </div>
                ` : ''}
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

window.closeSharedModal = function () {
    const modal = document.getElementById('shared-detail-modal');
    if (modal) {
        modal.remove();
    }
};

// -----------------------------------------------------------------
// 9. NAVEGACIÓN ENTRE VISTAS
// -----------------------------------------------------------------

function switchView(targetViewId) {
    const views = ['upload-view', 'download-view'];
    const buttons = document.querySelectorAll('#bottom-navbar .nav-button');

    views.forEach(id => {
        const view = document.getElementById(id);
        if (view) {
            view.classList.remove('active-view');
            view.classList.add('hidden-view');
        }
    });

    buttons.forEach(button => {
        button.classList.remove('active');
    });

    const targetView = document.getElementById(targetViewId);
    if (targetView) {
        targetView.classList.remove('hidden-view');
        targetView.classList.add('active-view');

        const activeButton = document.querySelector(`[data-target="${targetViewId}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
        }
    }
}

// -----------------------------------------------------------------
// 10. INICIALIZACIÓN
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
    switchView('upload-view');

    // Listeners para navegación
    document.querySelectorAll('#bottom-navbar .nav-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const target = e.currentTarget.getAttribute('data-target');
            if (target) {
                switchView(target);
            }
        });
    });
});