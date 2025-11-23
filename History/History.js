// La lógica de Firebase ahora se accede globalmente desde los scripts en el HTML

// ----------------------------------------------------------------------------------
// 🛑 ELIMINADA: La función applyThemeOnLoad ahora está en config.js como applyColorMode.
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

/**
 * Inicializa Firebase y autentica al usuario, reutilizando la sesión del Main.
 */
async function initializeAppAndAuth() {
    const displayElement = document.getElementById('current-user-display');

    if (!userId || !userDisplayName) {
        console.warn("Sesión no válida o caducada. Redirigiendo a Index.");
        window.location.href = '../index.html'; 
        return;
    }
    
    // Rellenar la UI inmediatamente
    if (displayElement) {
        displayElement.textContent = userDisplayName;
    }

    if (IS_MOCK_MODE) {
        console.warn("Modo MOCK activado. Usando datos no persistentes.");
        isAuthReady = true;
        renderRepairs([]); // Mostrar vacío en modo mock, ya que no hay listener
        return;
    }

    try {
        if (!firebaseConfig || !firebaseConfig.apiKey) {
             throw new Error("La configuración de Firebase está incompleta.");
        }
        
        // Inicialización usando las API de compatibilidad globales
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();

        // **PASO CLAVE: Esperamos la sesión activa**
        // Si el usuario ya está logueado, 'onAuthStateChanged' lo capturará.
        
        auth.onAuthStateChanged((user) => {
            if (user) {
                userId = user.uid; // Actualizar con la UID real de Firebase
                isAuthReady = true;
                setupRepairsListener(); // Iniciar la escucha de datos
            } else {
                 // Si no hay sesión activa en Firebase, forzamos la salida si no estamos en modo mock
                 console.warn("Firebase no detecta sesión activa. Redirigiendo.");
                 window.location.href = '../index.html';
            }
        });

    } catch (error) {
        console.error("Error al inicializar Firebase o al autenticar:", error);
        document.getElementById('repairs-list').innerHTML = `
            <div class="message-error p-3 mt-4 text-red-400 bg-red-900/40 border border-red-900 rounded-lg">
                Error de conexión. No se pudo cargar el historial.
            </div>
        `;
    }
}

// --- Funciones de Firestore (Solo Lectura) ---

function getRepairsCollectionRef() {
    if (!db || !userId) return null;
    return db.collection(`artifacts/${appId}/users/${userId}/repairs`);
}

/**
 * Renderiza la lista de mantenimientos leídos de Firestore.
 * NO INCLUYE BOTONES DE ACCIÓN (ELIMINAR/ACTUALIZAR)
 */
function renderRepairs(repairs) {
    const listContainer = document.getElementById('repairs-list');
    listContainer.innerHTML = '';
    
    if (repairs.length === 0) {
        // Usamos var() para background-color y color para que se adapte al tema
        listContainer.innerHTML = `
            <div class="p-4 text-center rounded-lg" style="background-color: var(--color-bg-secondary); color: var(--color-text-secondary);">
                No hay mantenimientos registrados.
            </div>
        `;
        return;
    }

    // Ordenar por timestamp descendente (más reciente primero)
    const sortedRepairs = repairs.sort((a, b) => b.timestamp - a.timestamp);

    sortedRepairs.forEach(repair => {
        const priorityClass = `priority-${repair.priority.toLowerCase()}`;
        const statusClass = `status-${repair.status.toLowerCase().replace(/ /g, '-')}`;
        const icon = repair.status === 'Completado' ? 'ph-check-circle-fill' : 
                     repair.status === 'En Progreso' ? 'ph-gear-six-fill' : 'ph-clock-counter-clockwise-fill';
        
        const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        const monthIndex = (repair.maintenance_month >= 1 && repair.maintenance_month <= 12) 
            ? repair.maintenance_month - 1 : 0; 
        const maintenanceDate = `${monthNames[monthIndex]} ${repair.maintenance_year}`;

        const repairHtml = `
            <div class="repair-card ${priorityClass}" data-id="${repair.id}">
                <div class="flex justify-between items-start">
                    <div class="flex-1 min-w-0 pr-4">
                        <p class="text-sm font-light mb-1" style="color: var(--color-text-secondary);">${maintenanceDate} | Contrato: ${repair.contract}</p>
                        <p class="text-lg font-semibold truncate" style="color: var(--color-text-light);">${repair.location} ${repair.model ? `(${repair.model})` : ''}</p>
                        <p class="text-sm italic truncate" style="color: var(--color-text-secondary);">${repair.description}</p>
                        
                        <div class="mt-2 text-sm font-medium flex items-center gap-4">
                            <span class="px-2 py-0.5 rounded-full" style="background-color: var(--color-bg-primary); color: ${priorityClass.includes('high') ? 'var(--color-accent-red)' : priorityClass.includes('medium') ? '#FFC107' : '#4CAF50'};">
                                Prioridad: ${repair.priority}
                            </span>
                            <span class="${statusClass} flex items-center gap-1">
                                <i class="ph ${icon}"></i> ${repair.status}
                            </span>
                        </div>
                    </div>
                    </div>
            </div>
        `;
        listContainer.innerHTML += repairHtml;
    });
}

/**
 * Establece el listener en tiempo real para obtener todos los mantenimientos.
 */
function setupRepairsListener() {
    if (!db || !isAuthReady || !userId) return;

    const repairsQuery = getRepairsCollectionRef();
    if (!repairsQuery) return;
    
    // onSnapshot es la forma de Firestore de escuchar cambios en tiempo real
    repairsQuery.onSnapshot((snapshot) => {
        const repairs = [];
        snapshot.forEach((doc) => {
            repairs.push({ id: doc.id, ...doc.data() });
        });
        renderRepairs(repairs);
    }, (error) => {
        console.error("Error en la conexión en tiempo real:", error);
        document.getElementById('repairs-list').innerHTML = `
            <div class="message-error p-3 mt-4 text-red-400 bg-red-900/40 border border-red-900 rounded-lg">
                No se pudieron cargar los mantenimientos. Error de Firestore.
            </div>
        `;
    });
}


// --- Ejecución ---
window.addEventListener('load', () => {
    // 🔑 Aplicar el tema (por si acaso el script no se ejecutó antes del load)
    if (typeof window.applyColorMode === 'function') {
        window.applyColorMode();
    }
    initializeAppAndAuth();
});