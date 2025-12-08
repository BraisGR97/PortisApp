/**
 * ====================================================================
 * Shared.js - Módulo de Compartir Mantenimientos
 * ====================================================================
 * Permite compartir mantenimientos entre usuarios con opción de incluir
 * registros históricos. Los datos compartidos expiran en 48 horas.
 * 
 * Funcionalidades:
 * - Enviar mantenimientos a otros usuarios
 * - Recibir mantenimientos compartidos
 * - Incluir registros históricos opcionales
 * - Expiración automática de datos compartidos (48h)
 * - Soporte para Mock Mode y Firebase
 * - Navegación por swipe y efectos visuales
 */

// ====================================================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// ====================================================================

const firebaseConfig = window.firebaseConfig;
const appId = firebaseConfig ? firebaseConfig.projectId : 'mock-app-id';

let app;
let db;
let auth;
let userId = null;
let userDisplayName = null;
let isAuthReady = false;

// Cache de datos
let allRepairs = [];
let allUsers = [];
let sharedReceived = [];

// Variables de estado para animación (Swipe)
let currentIndex = 0;
const views = ['upload-view', 'download-view'];
let isDragging = false;
let startPos = 0;
let startPosY = 0;
let isScrolling = undefined;
let currentTranslate = 0;
let prevTranslate = 0;
let animationID;

// ====================================================================
// AUTENTICACIÓN Y SETUP
// ====================================================================

/**
 * Valida la sesión del usuario y prepara la interfaz.
 */
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

    initializeAppAndAuth();
}

/**
 * Inicializa Firebase y establece el listener de autenticación.
 */
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
                setupSharedListener();
            } else {
                console.warn("Firebase no detecta sesión activa. Redirigiendo.");
                window.location.href = '../index.html';
            }
        });

    } catch (error) {
        console.error("Error al inicializar Firebase:", error);
        document.getElementById('upload-list').innerHTML = `
            <div class="p-4 text-center rounded-lg bg-red-900/40 border border-red-900 text-red-400">
                <i class="ph ph-warning-circle text-2xl mb-2"></i>
                <p>Error de conexión. No se pudo cargar los datos.</p>
            </div>
        `;
    }
}

// ====================================================================
// FUNCIONES DE CARGA DE DATOS
// ====================================================================

/**
 * Carga todos los datos necesarios en paralelo.
 */
async function loadData() {
    await Promise.all([
        loadRepairs(),
        loadUsers()
    ]);
}

/**
 * Configura el listener en tiempo real para mantenimientos compartidos.
 */
function setupSharedListener() {


    if (!db || !userId) {
        console.error("[SHARED] No se puede configurar listener: db o userId faltantes");
        return;
    }



    try {
        // Escuchar Bandeja de Entrada (INBOX)
        db.collection(`users/${userId}/shared_inbox`)
            .onSnapshot((snapshot) => {
                const received = [];
                const now = Date.now();

                snapshot.forEach((doc) => {
                    const data = doc.data();
                    const expiresAt = data.expiresAt ? (data.expiresAt.toDate ? data.expiresAt.toDate().getTime() : new Date(data.expiresAt).getTime()) : 0;

                    if (expiresAt <= now) {
                        // Limpieza automática (Inbox)
                        db.collection(`users/${userId}/shared_inbox`).doc(doc.id).delete().catch(console.warn);
                    } else {
                        received.push({ id: doc.id, ...data });
                    }
                });

                sharedReceived = received;
                renderReceivedList(received);
            }, (error) => {
                console.error("[SHARED] Error listener inbox:", error);
            });

        // (Opcional) Listener para limpiar Outbox expirados
        // Lo ideal sería una Cloud Function, pero aquí hacemos limpieza "lazy" cuando el usuario abre la app
        db.collection(`users/${userId}/shared_outbox`).get().then(snapshot => {
            snapshot.forEach(doc => {
                const data = doc.data();
                const expiresAt = data.expiresAt ? (data.expiresAt.toDate ? data.expiresAt.toDate().getTime() : new Date(data.expiresAt).getTime()) : 0;
                if (expiresAt <= Date.now()) {
                    doc.ref.delete();
                }
            });
        });

    } catch (error) {
        console.error("[SHARED] Excepción setupSharedListener:", error);
    }
}



/**
 * Carga los mantenimientos del usuario actual.
 */
async function loadRepairs() {
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

/**
 * Carga la lista de usuarios disponibles para compartir.
 */
async function loadUsers() {
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
                    name: userData.username || userData.displayName || userData.email || 'Usuario'
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

/**
 * Carga los mantenimientos compartidos recibidos.
 * Filtra automáticamente los que han expirado (>48h).
 */
/**
 * Renderiza la lista de mantenimientos recibidos.
 */
function renderReceivedList(items) {
    const container = document.getElementById('download-list');
    container.innerHTML = '';

    if (!items || items.length === 0) {
        container.innerHTML = `
            <div class="p-6 text-center rounded-lg" style="background-color: var(--color-bg-tertiary); color: var(--color-text-secondary);">
                <i class="ph ph-inbox text-4xl mb-2"></i>
                <p>No has recibido mantenimientos compartidos.</p>
            </div>
        `;
        return;
    }

    items.forEach(shared => {
        const card = createReceivedCard(shared);
        container.appendChild(card);
    });
}

// ====================================================================
// RENDERIZADO - VISTA ENVIAR
// ====================================================================

/**
 * Renderiza la lista de mantenimientos disponibles para enviar.
 */
function renderSendView() {
    const container = document.getElementById('upload-list');
    container.innerHTML = '';

    if (allRepairs.length === 0) {
        container.innerHTML = `
            <div class="p-6 text-center rounded-lg" style="background-color: var(--color-bg-tertiary); color: var(--color-text-secondary);">
                <i class="ph ph-folder-open text-4xl mb-2"></i>
                <p>No hay mantenimientos para compartir.</p>
            </div>
        `;
        return;
    }

    allRepairs.forEach(repair => {
        const card = createSendCard(repair);
        container.appendChild(card);
    });
}

/**
 * Crea una tarjeta de mantenimiento para enviar.
 */
function createSendCard(repair) {
    const card = document.createElement('div');
    card.className = `repair-card priority-${repair.priority?.toLowerCase() || 'media'}`;

    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const monthIndex = (repair.maintenance_month >= 1 && repair.maintenance_month <= 12) ? repair.maintenance_month - 1 : 0;
    const maintenanceDate = `${monthNames[monthIndex]} de ${repair.maintenance_year}`;

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
            <select id="user-select-${repair.id}" class="custom-select flex-1">
                <option value="">Seleccionar usuario...</option>
                ${allUsers.map(user => `<option value="${user.id}">${user.name}</option>`).join('')}
            </select>
        </div>

        <div class="flex items-center justify-between pt-3 border-t" style="border-color: var(--color-border);">
            <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="include-records-${repair.id}" 
                       class="custom-checkbox">
                <span class="text-sm" style="color: var(--color-text-secondary);">Incluir registros</span>
            </label>

            <button onclick="shareRepair('${repair.id}')" 
                    class="primary-btn px-4 py-2 rounded-lg flex items-center gap-2">
                <i class="ph ph-paper-plane-tilt"></i>
                <span>Enviar</span>
            </button>
        </div>

        <div id="share-message-${repair.id}" class="hidden mt-2 p-2 rounded text-sm text-center" 
             style="background-color: var(--color-accent-magenta); color: white;">
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

// ====================================================================
// RENDERIZADO - VISTA RECIBIDOS
// ====================================================================
/**
 * Crea una tarjeta de mantenimiento recibido.
 */
function createReceivedCard(shared) {
    const card = document.createElement('div');
    const repair = shared.repairData || {};
    card.className = `repair-card priority-${repair.priority?.toLowerCase() || 'media'}`;

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
                <p class="text-xs font-medium" style="color: var(--color-accent-magenta);">
                    <i class="ph ph-user mr-1"></i> Compartido por: <span class="font-semibold">${shared.senderName || 'Usuario'}</span>
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

// ====================================================================
// FUNCIONES DE COMPARTIR
// ====================================================================

/**
 * Comparte un mantenimiento con otro usuario.
 * @param {string} repairId - ID del mantenimiento a compartir
 */
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
        recipientId: recipientId, // Corregido: receiverId -> recipientId
        recipientName: recipientName,
        repairData: repair,
        includeRecords: includeRecords,
        sharedAt: Date.now(),
        expiresAt: Date.now() + (48 * 60 * 60 * 1000) // 48 horas
    };

    // Incluir registros si está marcado
    if (includeRecords) {
        try {
            const historyRef = db.collection(`users/${userId}/history`)
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

    // Guardar en base de datos (Evitar duplicados)
    try {
        if (!db) return;

        // Buscar si ya existe un compartido activo para este usuario y reparación en la INBOX del destinatario
        // Ahora buscamos en 'shared_inbox'
        const existingQuery = await db.collection(`users/${recipientId}/shared_inbox`)
            .where('senderId', '==', userId)
            .where('repairData.id', '==', repair.id)
            .get();

        if (!existingQuery.empty) {
            // Actualizar existente en Shared Inbox
            const docId = existingQuery.docs[0].id;

            // Actualizar Inbox
            await db.collection(`users/${recipientId}/shared_inbox`).doc(docId).update({
                expiresAt: new Date(sharedData.expiresAt),
                sharedAt: sharedData.sharedAt,
                includeRecords: includeRecords,
                records: sharedData.records || []
            });

            // Actualizar Outbox (mismo ID)
            await db.collection(`users/${userId}/shared_outbox`).doc(docId).set({
                ...sharedData,
                recipientId: recipientId,
                type: 'sent',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

        } else {
            // NO EXISTE: Crear nuevo con la lógica atómica de batch (Inbox + Outbox + Stats)
            const batch = db.batch();
            const sharedDataPayload = {
                ...sharedData,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            // 1. Inbox Destinatario
            const recipientRef = db.collection(`users/${recipientId}/shared_inbox`).doc();
            batch.set(recipientRef, {
                ...sharedDataPayload,
                type: 'received'
            });

            // 2. Outbox Remitente
            const senderRef = db.collection(`users/${userId}/shared_outbox`).doc(recipientRef.id);
            batch.set(senderRef, {
                ...sharedDataPayload,
                recipientId: recipientId,
                type: 'sent'
            });

            // 3. Stats Destinatario
            const recipientStatsRef = db.collection(`users/${recipientId}/shared_stats`).doc('general');
            batch.set(recipientStatsRef, {
                receivedCount: firebase.firestore.FieldValue.increment(1),
                lastReceivedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            // 4. Stats Remitente
            const senderStatsRef = db.collection(`users/${userId}/shared_stats`).doc('general');
            batch.set(senderStatsRef, {
                sentCount: firebase.firestore.FieldValue.increment(1),
                lastSentAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            await batch.commit();
        }

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
};

// ====================================================================
// MODAL DE DETALLES
// ====================================================================

/**
 * Muestra un modal con los detalles completos del mantenimiento compartido.
 * @param {Object} shared - Datos del mantenimiento compartido
 */
function showSharedDetailModal(shared) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    modal.style.backdropFilter = 'blur(4px)';
    modal.id = 'shared-detail-modal';

    const repair = shared.repairData || {};
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const monthIndex = (repair.maintenance_month >= 1 && repair.maintenance_month <= 12) ? repair.maintenance_month - 1 : 0;
    const scheduledDate = `${monthNames[monthIndex]} de ${repair.maintenance_year}`;

    const contact = repair.contact || {};

    modal.innerHTML = `
        <div class="max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl" 
             style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border);">
            <div class="p-4 border-b flex justify-between items-center" style="border-color: var(--color-border);">
                <h2 class="text-xl font-bold" style="color: var(--color-text-light);">
                    <i class="ph ph-share-network mr-2" style="color: var(--color-accent-magenta);"></i>
                    Detalles del Mantenimiento Compartido
                </h2>
                <button onclick="closeSharedModal()" class="secondary-icon-btn p-2 rounded-full">
                    <i class="ph ph-x text-xl"></i>
                </button>
            </div>

            <div class="p-4">
                <div class="mb-4 p-3 rounded-lg" style="background-color: var(--color-bg-tertiary);">
                    <p class="text-sm mb-1" style="color: var(--color-text-secondary);">
                        <i class="ph ph-user mr-2"></i> Compartido por: <span class="font-semibold">${shared.senderName || 'Usuario'}</span>
                    </p>
                    <p class="text-sm" style="color: var(--color-text-secondary);">
                        <i class="ph ph-clock mr-2"></i> Expira: ${shared.expiresAt ? (shared.expiresAt.toDate ? shared.expiresAt.toDate().toLocaleString('es-ES') : new Date(shared.expiresAt).toLocaleString('es-ES')) : 'No disponible'}
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
                <h3 class="text-sm font-semibold mt-4 mb-2" style="color: var(--color-accent-magenta);">Contacto</h3>
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
            (record.completedAt.toDate ?
                record.completedAt.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) :
                new Date(record.completedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })) :
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

/**
 * Cierra el modal de detalles.
 */
window.closeSharedModal = function () {
    const modal = document.getElementById('shared-detail-modal');
    if (modal) {
        modal.remove();
    }
};

// ====================================================================
// NAVEGACIÓN ENTRE VISTAS
// ====================================================================

/**
 * Cambia entre las vistas de Enviar y Recibidos usando animación de slider.
 * @param {string} targetViewId - ID de la vista a mostrar ('upload-view' o 'download-view')
 */
function switchView(targetViewId) {
    const slider = document.getElementById('views-slider');
    const buttons = document.querySelectorAll('#bottom-navbar .nav-button');

    // Actualizar botones de navegación
    buttons.forEach(button => {
        button.classList.remove('active');
    });
    const activeButton = document.querySelector(`[data-target="${targetViewId}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }

    // Mover el slider
    if (slider) {
        if (targetViewId === 'upload-view') {
            slider.classList.remove('slider-show-download');
            slider.classList.add('slider-show-upload');
        } else if (targetViewId === 'download-view') {
            slider.classList.remove('slider-show-upload');
            slider.classList.add('slider-show-download');
        }
    }

    currentView = targetViewId;
}

// ====================================================================
// EFECTOS VISUALES
// ====================================================================

/**
 * Actualiza la opacidad del borde superior de las tarjetas según el scroll.
 */
function updateCardBorderOpacity() {
    const contentScrollables = document.querySelectorAll('.card-inner-content');

    contentScrollables.forEach(inner => {
        const container = inner.closest('.card-container');
        if (container) {
            const scrollTop = inner.scrollTop;
            const opacity = Math.min(scrollTop / 50, 1);
            container.style.borderTopColor = `rgba(255, 255, 255, ${0.1 + (opacity * 0.9)})`;
        }
    });

    // También actualizar items internos si los hay (repair-card)
    const items = document.querySelectorAll('.repair-card');
    const viewportHeight = window.innerHeight;

    items.forEach(element => {
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

// ====================================================================
// FUNCIONALIDAD DE SWIPE
// ====================================================================

// ====================================================================
// FUNCIONALIDAD DE SWIPE Y ANIMACIÓN
// ====================================================================

function getPositionX(event) {
    return event.type.includes('mouse') ? event.pageX : event.touches[0].clientX;
}

function setSliderPosition() {
    const slider = document.getElementById('views-slider');
    if (slider) slider.style.transform = `translateX(${currentTranslate}%)`;
}

function animation() {
    setSliderPosition();
    if (isDragging) requestAnimationFrame(animation);
}

function touchStart(event) {
    isDragging = true;
    isScrolling = undefined;
    startPos = getPositionX(event);
    startPosY = event.touches[0].clientY;
    animationID = requestAnimationFrame(animation);

    const slider = document.getElementById('views-slider');
    if (slider) slider.style.transition = 'none';
}

function touchMove(event) {
    if (isDragging) {
        const currentPosition = getPositionX(event);
        const currentPositionY = event.touches[0].clientY;

        const diffX = Math.abs(currentPosition - startPos);
        const diffY = Math.abs(currentPositionY - startPosY);

        if (typeof isScrolling === 'undefined') {
            if (diffX > 5 || diffY > 5) {
                isScrolling = diffY > diffX;
            }
        }

        if (isScrolling) return;

        const currentMove = currentPosition - startPos;
        // Slider ancho 200%. 1 vista = 50% de desplazamiento.
        const movePercent = (currentMove / window.innerWidth) * 50;
        currentTranslate = prevTranslate + movePercent;

        // Limites
        if (currentTranslate > 5) currentTranslate = 5;
        if (currentTranslate < -55) currentTranslate = -55;
    }
}

function touchEnd() {
    isDragging = false;
    cancelAnimationFrame(animationID);
    const movedBy = currentTranslate - prevTranslate;

    if (movedBy < -10 && currentIndex < views.length - 1) currentIndex += 1;
    else if (movedBy > 10 && currentIndex > 0) currentIndex -= 1;

    setPositionByIndex();

    const slider = document.getElementById('views-slider');
    if (slider) slider.style.transition = 'transform 0.3s ease-out';
}

function setPositionByIndex() {
    currentTranslate = currentIndex * -50;
    prevTranslate = currentTranslate;
    setSliderPosition();

    updateNavButtons(views[currentIndex]);
    if (typeof window !== 'undefined') window.currentView = views[currentIndex];
}

function updateNavButtons(targetViewId) {
    const buttons = document.querySelectorAll('#bottom-navbar .nav-button');
    buttons.forEach(button => button.classList.remove('active'));

    const activeButton = document.querySelector(`[data-target="${targetViewId}"]`);
    if (activeButton) activeButton.classList.add('active');
}

/**
 * Cambia la vista activa de forma programática (Override).
 */
window.switchView = function (targetViewId) {
    const index = views.indexOf(targetViewId);
    if (index !== -1) {
        currentIndex = index;
        const slider = document.getElementById('views-slider');
        if (slider) slider.style.transition = 'transform 0.3s ease-out';
        setPositionByIndex();
    }
}

/**
 * Inicializa los listeners para swipe.
 */
function initializeSwipe() {
    const appContent = document.getElementById('app-content');
    if (!appContent) return;

    appContent.addEventListener('touchstart', touchStart, { passive: true });
    appContent.addEventListener('touchmove', touchMove, { passive: true });
    appContent.addEventListener('touchend', touchEnd);
}

// ====================================================================
// INICIALIZACIÓN
// ====================================================================

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

    // Inicializar swipe
    initializeSwipe();

    // Efectos visuales de borde animado
    const appContent = document.getElementById('app-content');
    if (appContent) appContent.addEventListener('scroll', updateCardBorderOpacity);
    window.addEventListener('scroll', updateCardBorderOpacity);
    window.addEventListener('resize', updateCardBorderOpacity);
    setTimeout(updateCardBorderOpacity, 100);
});

// ================================================================
// BORDE ANIMADO EN SCROLL (para sistema de slider)
// ================================================================
document.addEventListener('DOMContentLoaded', function () {
    const cardInnerContents = document.querySelectorAll('.card-inner-content');

    cardInnerContents.forEach(innerContent => {
        const container = innerContent.closest('.card-container');

        if (container && innerContent) {
            innerContent.addEventListener('scroll', function () {
                const scrollTop = innerContent.scrollTop;

                if (scrollTop > 10) {
                    container.style.borderTopColor = 'rgba(255, 255, 255, 0.2)';
                } else {
                    container.style.borderTopColor = 'transparent';
                }
            });
        }
    });
});
