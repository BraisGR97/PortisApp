// La configuración de Firebase y las API se acceden globalmente.

// ----------------------------------------------------------------------------------
// 🛑 ELIMINADA: La función applyThemeOnLoad ahora está en config.js como applyColorMode.
// Se llama al final en window.addEventListener('load').
// ----------------------------------------------------------------------------------

// 🛑 CAMBIO CLAVE: La configuración se lee desde window
const firebaseConfig = window.firebaseConfig;
const IS_MOCK_MODE = window.IS_MOCK_MODE;

if (!firebaseConfig && !IS_MOCK_MODE) {
    console.error("Firebase config is missing, but IS_MOCK_MODE is false.");
}

const appId = firebaseConfig ? firebaseConfig.projectId : 'mock-app-id'; 
const initialAuthToken = null; 

let app;
let db;
let auth;

// 🔑 CAMBIO CLAVE: Obtener el UID y el nombre de la sesión
let userId = sessionStorage.getItem('portis-user-identifier') || null; 
let userDisplayName = sessionStorage.getItem('portis-user-display-name') || null;
let isAuthReady = false;


// --- GESTIÓN DE VISTAS (Pestañas Inferiores) ---

/**
 * Cambia la vista activa (Upload/Download) al hacer clic en un botón del nav.
 * @param {string} targetViewId - El ID de la sección a mostrar (ej. 'upload-view').
 */
function switchView(targetViewId) {
    const views = ['upload-view', 'download-view'];
    const buttons = document.querySelectorAll('#bottom-navbar .nav-button');
    
    // 1. Ocultar todas las vistas y desactivar todos los botones
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

    // 2. Mostrar la vista objetivo y activar el botón correspondiente
    const targetView = document.getElementById(targetViewId);
    if (targetView) {
        targetView.classList.remove('hidden-view');
        targetView.classList.add('active-view');
        
        // Activar el botón que tiene el data-target correcto
        const activeButton = document.querySelector(`[data-target="${targetViewId}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
        }
    }
}

// --- FUNCIONES DE FIREBASE ---

/**
 * Inicializa Firebase y autentica al usuario, reutilizando la sesión del Main.
 */
async function initializeAppAndAuth() {
    const displayElement = document.getElementById('current-user-display');
    
    // 1. Verificar sesión local
    if (!userId || !userDisplayName) {
        console.warn("Sesión no válida o caducada. Redirigiendo a Index.");
        window.location.href = '../index.html'; 
        return;
    }

    // Muestra el nombre de usuario o el ID inmediatamente
    if (displayElement) {
        displayElement.textContent = userDisplayName;
    }
    
    if (IS_MOCK_MODE) {
        console.warn("Modo MOCK activado. Sin conexión a Firestore.");
        isAuthReady = true;
        renderRepairs([]);
        return;
    }

    try {
        if (!firebaseConfig || !firebaseConfig.apiKey) {
             throw new Error("La configuración de Firebase está incompleta.");
        }
        
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();

        // **PASO CLAVE: Esperamos a que la sesión existente se resuelva**
        auth.onAuthStateChanged((user) => {
            if (user && user.uid === userId) {
                // Usuario autenticado y coincide con el que esperábamos de sessionStorage
                isAuthReady = true;
                setupRepairsListener(); 
            } else {
                 // Si Firebase no detecta la sesión esperada
                 console.warn("Firebase no detecta sesión activa. Redirigiendo.");
                 window.location.href = '../index.html';
            }
        });
        
    } catch (error) {
        console.error("Error al inicializar Firebase o al autenticar:", error);
        // Manejo de errores en la UI
    }
}

/**
 * Obtiene la referencia a la colección de mantenimientos del usuario.
 */
function getRepairsCollectionRef() {
    if (!db || !userId) return null;
    // Usamos 'repairs' como fuente de datos para ambas vistas por simplicidad.
    return db.collection(`artifacts/${appId}/users/${userId}/repairs`);
}

// --- RENDERIZADO ---

/**
 * Renderiza la lista de mantenimientos en ambas vistas.
 */
function renderRepairs(repairs) {
    const uploadListContainer = document.getElementById('upload-list');
    const downloadListContainer = document.getElementById('download-list');
    
    // Limpiar listas y asegurar que los botones están ocultos por defecto
    uploadListContainer.innerHTML = '';
    downloadListContainer.innerHTML = '';
    document.getElementById('send-all-btn').classList.add('hidden');
    document.getElementById('delete-all-btn').classList.add('hidden');
    
    if (repairs.length === 0) {
        // Usamos var() para background-color y color para que se adapte al tema
        const message = `<div class="p-4 text-center rounded-lg" style="background-color: var(--color-bg-secondary); color: var(--color-text-secondary);">No hay mantenimientos.</div>`;
        uploadListContainer.innerHTML = message;
        downloadListContainer.innerHTML = message;
        return;
    }

    // Mostrar botones de acción si hay datos
    document.getElementById('send-all-btn').classList.remove('hidden');
    document.getElementById('delete-all-btn').classList.remove('hidden');

    // Mismo contenido para ambas listas (por ahora)
    repairs.forEach(repair => {
        const repairHtml = createRepairCardHtml(repair);
        
        // Vista de CARGA (Botón Enviar)
        uploadListContainer.innerHTML += `
            <div class="flex items-center justify-between space-x-2">
                ${repairHtml}
                <button class="primary-btn px-4 py-2 rounded-lg text-sm shrink-0" onclick="console.log('Enviar: ${repair.id}')">
                    <i class="ph ph-paper-plane-tilt"></i> Enviar
                </button>
            </div>
        `;
        
        // Vista de DESCARGA (Botón Borrar)
        // Se asegura que el estilo inline del botón de borrar use var() para el fondo
        downloadListContainer.innerHTML += `
            <div class="flex items-center justify-between space-x-2">
                ${repairHtml}
                <button class="secondary-btn px-4 py-2 rounded-lg text-sm shrink-0" style="background-color: var(--color-bg-secondary); color: var(--color-accent-red);" onclick="console.log('Borrar: ${repair.id}')">
                    <i class="ph ph-trash-simple"></i> Borrar
                </button>
            </div>
        `;
    });
}

/**
 * Genera el HTML para una tarjeta de mantenimiento.
 */
function createRepairCardHtml(repair) {
    const priorityClass = `priority-${repair.priority.toLowerCase()}`;
    const statusClass = `status-${repair.status.toLowerCase().replace(/ /g, '-')}`;
    const icon = repair.status === 'Completado' ? 'ph-check-circle-fill' : 
                     repair.status === 'En Progreso' ? 'ph-gear-six-fill' : 'ph-clock-counter-clockwise-fill';
    
    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const monthIndex = (repair.maintenance_month >= 1 && repair.maintenance_month <= 12) ? repair.maintenance_month - 1 : 0; 
    const maintenanceDate = `${monthNames[monthIndex]} ${repair.maintenance_year}`;

    return `
        <div class="repair-card ${priorityClass} flex-1 min-w-0">
            <p class="text-sm font-light mb-1" style="color: var(--color-text-secondary);">${maintenanceDate} | Contrato: ${repair.contract}</p>
            <p class="text-lg font-semibold truncate" style="color: var(--color-text-light);">${repair.location} ${repair.model ? `(${repair.model})` : ''}</p>
            <div class="mt-2 text-sm font-medium flex items-center gap-4">
                <span class="${statusClass} flex items-center gap-1">
                    <i class="ph ${icon}"></i> ${repair.status}
                </span>
            </div>
        </div>
    `;
}

/**
 * Establece el listener en tiempo real.
 */
function setupRepairsListener() {
    if (!db || !isAuthReady || !userId) return;

    const repairsQuery = getRepairsCollectionRef();
    if (!repairsQuery) return;
    
    repairsQuery.onSnapshot((snapshot) => {
        const repairs = [];
        snapshot.forEach((doc) => {
            repairs.push({ id: doc.id, ...doc.data() });
        });
        renderRepairs(repairs);
    }, (error) => {
        console.error("Error en la conexión en tiempo real:", error);
    });
}

// --- EJECUCIÓN E INICIALIZACIÓN ---

window.addEventListener('load', () => {
    // 🔑 Aplicar el tema
    if (typeof window.applyColorMode === 'function') {
        window.applyColorMode();
    }
    
    initializeAppAndAuth();
    
    // Inicializar la vista en 'Carga' por defecto
    switchView('upload-view'); 
    
    // Asignar listeners a los botones del navbar inferior
    document.querySelectorAll('#bottom-navbar .nav-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const target = e.currentTarget.getAttribute('data-target');
            if (target) {
                switchView(target);
            }
        });
    });
    
    // Placeholder para la funcionalidad de los botones grandes
    document.getElementById('send-all-btn').addEventListener('click', () => {
        console.log('FUNCIONALIDAD PENDIENTE: ENVIAR TODOS');
        alert('Botón Enviar presionado. (Funcionalidad pendiente)');
    });

    document.getElementById('delete-all-btn').addEventListener('click', () => {
        console.log('FUNCIONALIDAD PENDIENTE: BORRAR TODOS');
        alert('Botón Borrar presionado. (Funcionalidad pendiente)');
    });
});