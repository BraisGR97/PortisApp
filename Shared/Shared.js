// La configuración de Firebase y las API se acceden globalmente.

const firebaseConfig = window.firebaseConfig;
const IS_MOCK_MODE = !firebaseConfig || !firebaseConfig.apiKey;

if (!firebaseConfig) {
    console.error("Firebase config is missing in the global scope.");
}

const appId = firebaseConfig.projectId; 
const initialAuthToken = null; 

let app;
let db;
let auth;
let userId = null;
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
 * Inicializa Firebase y autentica al usuario.
 */
async function initializeAppAndAuth() {
    try {
        if (!firebaseConfig || !firebaseConfig.apiKey) {
             throw new Error("La configuración de Firebase está incompleta.");
        }
        
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();

        if (initialAuthToken) {
            await auth.signInWithCustomToken(initialAuthToken);
        } else {
            await auth.signInAnonymously();
        }

        auth.onAuthStateChanged((user) => {
            const displayElement = document.getElementById('current-user-display');
            const userDisplayName = sessionStorage.getItem('portis-user-display-name');

            if (user) {
                userId = user.uid;
                
                // Muestra 'Admin' o el ID de usuario
                displayElement.textContent = userDisplayName || `ID: ${userId.substring(0, 8)}...`;
                
                isAuthReady = true;
                setupRepairsListener(); // Iniciar la escucha de datos
            } else {
                userId = crypto.randomUUID(); 
                displayElement.textContent = `ID Anónimo`;
                isAuthReady = true;
                setupRepairsListener(); 
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
        const message = `<div class="p-4 text-center rounded-lg" style="background-color: #2a2a40; color: var(--color-text-secondary);">No hay mantenimientos.</div>`;
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
        downloadListContainer.innerHTML += `
            <div class="flex items-center justify-between space-x-2">
                ${repairHtml}
                <button class="secondary-btn px-4 py-2 rounded-lg text-sm shrink-0" style="background-color: #3f1e29; color: #FF5722;" onclick="console.log('Borrar: ${repair.id}')">
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
    if (!db || !isAuthReady) return;

    const repairsQuery = getRepairsCollectionRef();
    
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