// La lógica de Firebase ahora se accede globalmente desde los scripts en el HTML

// La configuración se lee desde window.firebaseConfig
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

/**
 * Inicializa Firebase y autentica al usuario.
 */
async function initializeAppAndAuth() {
    try {
        if (!firebaseConfig || !firebaseConfig.apiKey) {
             throw new Error("La configuración de Firebase está incompleta.");
        }
        
        // Inicialización usando las API de compatibilidad globales
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();

        // Autenticación con mock (anónimo)
        if (initialAuthToken) {
            await auth.signInWithCustomToken(initialAuthToken);
        } else {
            await auth.signInAnonymously();
        }

        // Observador de estado de autenticación
        auth.onAuthStateChanged((user) => {
            const displayElement = document.getElementById('current-user-display');
            // Comprobación de 'Admin'
            const userDisplayName = sessionStorage.getItem('portis-user-display-name');

            if (user) {
                userId = user.uid;
                
                if (userDisplayName) {
                    displayElement.textContent = userDisplayName; 
                } else {
                    displayElement.textContent = `ID: ${userId.substring(0, 8)}...`;
                }

                isAuthReady = true;
                setupRepairsListener(); // Iniciar la escucha de datos una vez autenticado
            } else {
                userId = crypto.randomUUID(); 
                displayElement.textContent = `ID Anónimo`;
                isAuthReady = true;
                setupRepairsListener(); 
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
        listContainer.innerHTML = `
            <div class="p-4 text-center rounded-lg" style="background-color: #2a2a40; color: var(--color-text-secondary);">
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
    if (!db || !isAuthReady) return;

    const repairsQuery = getRepairsCollectionRef();
    
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
    initializeAppAndAuth();
});