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
            <div class="error-state-container">
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
        // Escuchar elementos compartidos conmigo (usando collectionGroup en 'shared_outbox')
        // Esto evita tener que escribir en la inbox del destinatario (lo cual daba error de permisos)
        db.collectionGroup('shared_outbox')
            .where('recipientId', '==', userId)
            .onSnapshot((snapshot) => {
                const received = [];
                const now = Date.now();

                snapshot.forEach((doc) => {
                    const data = doc.data();
                    const expiresAt = data.expiresAt ? (data.expiresAt.toDate ? data.expiresAt.toDate().getTime() : new Date(data.expiresAt).getTime()) : 0;

                    if (expiresAt > now) {
                        received.push({ id: doc.id, ...data });
                    }
                });

                sharedReceived = received;
                renderReceivedList(received);
                updateCardBorderOpacity();
            }, (error) => {
                console.error("[SHARED] Error listener shared:", error);
            });

        // Limpieza de mi Outbox (elementos que yo envié y expiraron)
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
        updateCardBorderOpacity(); // Initial call after rendering send view
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


        const usersRef = db.collection('users');
        const snapshot = await usersRef.get();
        allUsers = [];
        snapshot.forEach(doc => {
            const userData = doc.data();

            if (doc.id !== userId) {
                allUsers.push({
                    id: doc.id,
                    name: userData.username || userData.displayName || userData.email || 'Usuario'
                });
            }
        });



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
            <div class="empty-state-container">
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
            <div class="empty-state-container">
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
            <p class="card-header-date">
                ${maintenanceDate} | Contrato: ${repair.contract}
            </p>
            <h3 class="card-header-title">
                ${repair.location || 'Sin Ubicación'}
            </h3>
            ${repair.model ? `
                <p class="card-header-subtitle">
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

        <div class="card-actions">
            <label class="cursor-pointer">
                <input type="checkbox" id="include-records-${repair.id}" 
                       class="custom-checkbox">
                <span class="card-actions-text">Incluir registros</span>
            </label>

            <button onclick="shareRepair('${repair.id}')" 
                    class="primary-btn px-4 py-2 rounded-lg flex items-center gap-2">
                <i class="ph ph-paper-plane-tilt"></i>
                <span>Enviar</span>
            </button>
        </div>

        <div id="share-message-${repair.id}" class="feedback-message"></div>
    `;

    // Listener para el checkbox
    const checkbox = card.querySelector(`#include-records-${repair.id}`);
    const messageDiv = card.querySelector(`#share-message-${repair.id}`);

    if (checkbox && messageDiv) {
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                messageDiv.textContent = '✓ Los registros históricos serán incluidos';
                messageDiv.className = 'feedback-message warning'; // Usando estilo warning o personalizado para info
            } else {
                messageDiv.className = 'feedback-message'; // Oculto por defecto
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
            <div class="received-header">
                <p class="received-sender">
                    <i class="ph ph-user mr-1"></i> Compartido por: <span>${shared.senderName || 'Usuario'}</span>
                </p>
                <span class="received-timer">
                    <i class="ph ph-clock mr-1"></i> ${hoursLeft}h restantes
                </span>
            </div>
            <p class="card-header-date">
                ${maintenanceDate} | Contrato: ${repair.contract}
            </p>
            <h3 class="card-header-title">
                ${repair.location || 'Sin Ubicación'}
            </h3>
            ${repair.model ? `
                <p class="card-header-subtitle">
                    <i class="ph ph-wrench mr-1"></i> ${repair.model}
                </p>
            ` : ''}
        </div>

        ${shared.includeRecords ? `
            <div class="received-includes-badge">
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
            messageDiv.className = 'feedback-message error';
            setTimeout(() => messageDiv.className = 'feedback-message', 3000);
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

        // Buscar si ya existe un compartido activo por MÍ para este destinatario
        // Buscamos en 'shared_outbox'
        const existingQuery = await db.collection(`users/${userId}/shared_outbox`)
            .where('recipientId', '==', recipientId)
            .where('repairData.id', '==', repair.id)
            .get();

        if (!existingQuery.empty) {
            // Actualizar existente (Outbox)
            const docId = existingQuery.docs[0].id;

            await db.collection(`users/${userId}/shared_outbox`).doc(docId).set({
                ...sharedData,
                type: 'sent',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

        } else {
            // Crear nuevo en Outbox
            const sharedDataPayload = {
                ...sharedData,
                type: 'sent',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await db.collection(`users/${userId}/shared_outbox`).add(sharedDataPayload);
        }


        if (messageDiv) {
            messageDiv.textContent = `✓ Compartido con ${recipientName}`;
            messageDiv.className = 'feedback-message success';
            setTimeout(() => {
                messageDiv.className = 'feedback-message';
                userSelect.value = '';
                if (includeRecordsCheckbox) includeRecordsCheckbox.checked = false;
            }, 2000);
        }
    } catch (error) {
        console.error("Error al compartir:", error);
        if (messageDiv) {
            messageDiv.textContent = '✗ Error al compartir';
            messageDiv.className = 'feedback-message error';
            setTimeout(() => messageDiv.className = 'feedback-message', 3000);
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
    modal.className = 'modal-overlay';
    modal.id = 'shared-detail-modal';

    const repair = shared.repairData || {};
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const monthIndex = (repair.maintenance_month >= 1 && repair.maintenance_month <= 12) ? repair.maintenance_month - 1 : 0;
    const scheduledDate = `${monthNames[monthIndex]} de ${repair.maintenance_year}`;

    const contact = repair.contact || {};

    modal.innerHTML = `
        <div class="modal-container">
            <div class="modal-header">
                <h2 class="modal-title">
                    <i class="ph ph-share-network text-accent-magenta"></i>
                    Detalles
                </h2>
                <button onclick="closeSharedModal()" class="secondary-icon-btn p-2 rounded-full border-none">
                    <i class="ph ph-x text-xl"></i>
                </button>
            </div>

            <div class="modal-body">
                <div class="modal-info-box">
                    <p class="text-sm mb-1 text-secondary-color">
                        <i class="ph ph-user mr-2"></i> Compartido por: <span class="font-semibold text-white">${shared.senderName || 'Usuario'}</span>
                    </p>
                    <p class="text-sm text-secondary-color">
                        <i class="ph ph-clock mr-2"></i> Expira: ${shared.expiresAt ? (shared.expiresAt.toDate ? shared.expiresAt.toDate().toLocaleString('es-ES') : new Date(shared.expiresAt).toLocaleString('es-ES')) : 'No disponible'}
                    </p>
                </div>

                <h3 class="modal-subtitle">Información del Mantenimiento</h3>
                
                <div class="modal-grid">
                    <div class="space-y-1">
                        <label class="text-xs font-medium text-secondary-color">Ubicación</label>
                        <p class="font-semibold text-primary-color">${repair.location}</p>
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium text-secondary-color">Modelo</label>
                        <p class="font-semibold text-primary-color">${repair.model || 'N/A'}</p>
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium text-secondary-color">Contrato</label>
                        <p class="font-semibold text-primary-color">${repair.contract}</p>
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium text-secondary-color">Fecha Programada</label>
                        <p class="font-semibold text-primary-color">${scheduledDate}</p>
                    </div>
                    ${repair.key_id ? `
                    <div class="space-y-1">
                        <label class="text-xs font-medium text-secondary-color">ID Clave/TAG</label>
                        <p class="font-semibold text-primary-color">${repair.key_id}</p>
                    </div>
                    ` : ''}
                    <div class="space-y-1">
                        <label class="text-xs font-medium text-secondary-color">Prioridad</label>
                        <p class="font-semibold text-primary-color">${repair.priority || 'Media'}</p>
                    </div>
                </div>

                <!-- Observaciones (si las tiene el mantenimiento original) -->
                ${repair.description ? `
                <div class="mb-4">
                    <label class="text-xs font-medium text-secondary-color">Observaciones</label>
                    <p class="text-sm p-2 rounded bg-opacity-20 bg-gray-600 border border-gray-700 mt-1 text-primary-color">
                        ${repair.description}
                    </p>
                </div>
                ` : ''}

                <!-- Averías (Breakdowns) handling singular or plural -->
                ${(repair.breakdowns && repair.breakdowns.length > 0) || repair.breakdown ? `
                <div class="mb-4">
                     <label class="text-xs font-medium text-secondary-color">Avería(s)</label>
                     ${repair.breakdown ?
                `<p class="text-sm mt-1 p-2 rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/30">${repair.breakdown}</p>` :
                `<ul class="list-disc list-inside text-sm mt-1 text-accent-red">
                            ${repair.breakdowns.map(b => `<li>${b}</li>`).join('')}
                         </ul>`
            }
                </div>
                ` : ''}

                ${(contact.name || contact.phone || contact.notes) ? `
                <h3 class="modal-subtitle text-accent-magenta mt-6">Contacto</h3>
                <div class="modal-grid">
                    ${contact.name ? `
                    <div class="space-y-1">
                        <label class="text-xs font-medium text-secondary-color">Nombre</label>
                        <p class="font-semibold text-primary-color">${contact.name}</p>
                    </div>
                    ` : ''}
                    ${contact.phone ? `
                    <div class="space-y-1">
                        <label class="text-xs font-medium text-secondary-color">Teléfono</label>
                        <p class="font-semibold text-primary-color">${contact.phone}</p>
                    </div>
                    ` : ''}
                </div>
                ${contact.notes ? `
                <div class="space-y-1 mt-4 text-sm">
                    <label class="text-xs font-medium text-secondary-color">Notas de Contacto</label>
                    <p class="italic text-primary-color">${contact.notes}</p>
                </div>
                ` : ''}
                ` : ''}

                ${shared.includeRecords && shared.records && shared.records.length > 0 ? `
                <h3 class="modal-subtitle mt-6">
                    <i class="ph ph-clock-counter-clockwise mr-2"></i>Registros Históricos (${shared.records.length})
                </h3>
                <div class="modal-history-list">
                    ${shared.records.map(record => {
                const completedDate = record.completedAt ?
                    (record.completedAt.toDate ?
                        record.completedAt.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) :
                        new Date(record.completedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })) :
                    'Fecha no disponible';
                return `
                            <div class="modal-history-item">
                                <p class="text-sm font-semibold text-primary-color">
                                    <i class="ph ph-calendar-check mr-1"></i> ${completedDate}
                                </p>
                                <p class="text-xs mt-1 text-secondary-color">
                                    Por: ${record.username || 'Usuario desconocido'}
                                </p>
                                ${record.description ? `
                                <div class="mt-1">
                                    <span class="text-xs font-medium text-secondary-color">Observaciones:</span>
                                    <p class="text-xs italic text-primary-color">
                                        ${record.description}
                                    </p>
                                </div>
                                ` : ''}
                                ${(record.breakdowns && record.breakdowns.length > 0) || record.breakdown ? `
                                <div class="mt-1">
                                    <span class="text-xs font-medium text-red-400">Avería:</span>
                                    ${record.breakdown ?
                            `<p class="text-xs text-red-300 pl-2 border-l-2 border-red-500/30">${record.breakdown}</p>` :
                            `<ul class="list-none text-xs text-red-300 pl-2 border-l-2 border-red-500/30">
                                            ${record.breakdowns.map(b => `<li>- ${b}</li>`).join('')}
                                        </ul>`
                        }
                                </div>
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

function updateCardBorderOpacity() {
    const elements = document.querySelectorAll('.repair-card');
    const viewportHeight = window.innerHeight;
    const headerOffset = 60;

    elements.forEach(element => {
        const rect = element.getBoundingClientRect();
        const elementTop = rect.top - headerOffset;

        let percentage = 0;
        const relativePos = Math.max(0, Math.min(1, elementTop / (viewportHeight * 0.8)));
        const progress = 1 - relativePos;

        const opacity = (0.2 + (0.6 * progress)).toFixed(2);
        const greyStart = (1 + (59 * progress));
        const greyEnd = (35 + (59 * progress));

        element.style.setProperty('--white-opacity', opacity);
        element.style.setProperty('--grey-start', `${greyStart}%`);
        element.style.setProperty('--grey-end', `${greyEnd}%`);
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

    // Listeners para el borde animado
    const appContent = document.getElementById('app-content');
    const innerContents = document.querySelectorAll('.card-inner-content');

    window.addEventListener('scroll', updateCardBorderOpacity, { passive: true });
    if (appContent) appContent.addEventListener('scroll', updateCardBorderOpacity, { passive: true });
    innerContents.forEach(inner => {
        inner.addEventListener('scroll', updateCardBorderOpacity, { passive: true });
    });

    window.addEventListener('resize', updateCardBorderOpacity);

    // Disparo inicial asegurando que las listas existan
    setTimeout(updateCardBorderOpacity, 500);
});


