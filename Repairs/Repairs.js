// ELIMINAMOS TODOS LOS 'import'
// Ahora usamos las variables globales de firebase (firebase, firebase.auth, firebase.firestore)

// Habilitar logs para depuraci贸n
// firebase.firestore.setLogLevel('Debug'); // No es necesario si no se usa la API de logging

// 馃毃 CONFIGURACI脫N DE FIREBASE ESTATICA AHORA SE OBTIENE DE window.firebaseConfig
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
 * Muestra u oculta el formulario de nueva reparaci贸n.
 * (Se mantiene window. para asegurar accesibilidad desde el onclick del HTML)
 */
window.toggleNewRepairForm = function() {
    const formCard = document.getElementById('new-repair-card');
    const fab = document.getElementById('show-repair-form-fab');
    
    formCard.classList.toggle('hidden');

    const icon = fab.querySelector('i');
    if (formCard.classList.contains('hidden')) {
        icon.className = 'ph ph-plus text-2xl';
        document.getElementById('app-content').scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        icon.className = 'ph ph-x text-2xl';
        formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/**
 * Inicializa Firebase, autentica al usuario y establece el listener de estado.
 */
async function initializeAppAndAuth() {
    try {
        if (!firebaseConfig || !firebaseConfig.apiKey) {
             throw new Error("La configuraci贸n de Firebase est谩 incompleta.");
        }
        
        // --- Cambios clave para usar las librer铆as globales ---
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        // ---------------------------------------------------

        // Autenticaci贸n con mock (an贸nimo) o token si est谩 disponible
        if (initialAuthToken) {
            await auth.signInWithCustomToken(initialAuthToken);
        } else {
            // Usando signInAnonymously del objeto auth global
            await auth.signInAnonymously();
        }

        // Usando onAuthStateChanged del objeto auth global
        auth.onAuthStateChanged((user) => {
            const displayElement = document.getElementById('current-user-display');
            const userDisplayName = sessionStorage.getItem('portis-user-display-name');

            if (user) {
                userId = user.uid;
                
                if (userDisplayName) {
                    displayElement.textContent = userDisplayName; // Muestra 'Admin' si existe
                } else {
                    displayElement.textContent = `ID: ${userId.substring(0, 8)}...`;
                }

                isAuthReady = true;
                setupRepairsListener(); 
            } else {
                userId = crypto.randomUUID(); 
                displayElement.textContent = `ID An贸nimo`;
                isAuthReady = true;
                setupRepairsListener(); 
            }
        });
        
        // Valores predeterminados para mes y a帽o
        const today = new Date();
        document.getElementById('month').value = today.getMonth() + 1; 
        document.getElementById('year').value = today.getFullYear();
        
    } catch (error) {
        console.error("Error al inicializar Firebase o al autenticar:", error);
        document.getElementById('repairs-list').innerHTML = `
            <div class="message-error p-3 mt-4 text-red-400 bg-red-900/40 border border-red-900 rounded-lg">
                Error de conexi贸n. No se pudo cargar el m贸dulo de datos. (Verifique la consola del navegador)
            </div>
        `;
    }
}

// --- Funciones de Firestore (CRUD) ---

function getRepairsCollectionRef() {
    // Usando .collection() del objeto db global
    return db.collection(`artifacts/${appId}/users/${userId}/repairs`);
}

/**
 * A帽ade un nuevo mantenimiento a Firestore.
 */
async function addRepair(e) {
    e.preventDefault();
    if (!isAuthReady || !userId) return console.warn("Autenticaci贸n no lista.");

    if (IS_MOCK_MODE) {
        console.log('Modo Mock: Mantenimiento/Presupuesto simulado y guardado localmente (no persistido).');
        // Opcional: Podrías limpiar el formulario aquí
        document.getElementById('new-repair-form').reset();
        window.toggleNewRepairForm();
        return; 
    }
    // Recoger y validar campos (el c贸digo es el mismo)
    const location = document.getElementById('location').value.trim();
    const model = document.getElementById('model').value.trim();
    const key_id = document.getElementById('key_id').value.trim();
    const contract = document.getElementById('contract').value; 
    const monthInput = document.getElementById('month').value;
    const yearInput = document.getElementById('year').value;
    const description = document.getElementById('description').value.trim(); 
    const priority = document.getElementById('priority').value; 

    const month = parseInt(monthInput);
    const year = parseInt(yearInput);

    if (!location || !contract || isNaN(month) || isNaN(year) || month < 1 || month > 12 || year < 2000) {
         console.error('Validaci贸n fallida: Rellena los campos obligatorios (Ubicaci贸n, Contrato, Mes, A帽o).');
         return;
    }

    const repairData = {
        location,
        model: model || null, 
        key_id: key_id || null,
        contract,
        maintenance_month: month,
        maintenance_year: year,
        description: description || 'Sin descripci贸n de aver铆a.',
        priority,
        status: 'Pendiente', 
        userId: userId,
        timestamp: Date.now()
    };

    try {
        // Usando .add() de la referencia de colecci贸n
        await getRepairsCollectionRef().add(repairData);
        document.getElementById('new-repair-form').reset();
        
        const today = new Date();
        document.getElementById('month').value = today.getMonth() + 1;
        document.getElementById('year').value = today.getFullYear();
        
        toggleNewRepairForm();
        console.log("Mantenimiento guardado con 茅xito.");
    } catch (error) {
        console.error("Error al guardar el mantenimiento:", error);
    }
}

/**
 * Actualiza el estado de un mantenimiento.
 */
async function updateRepairStatus(id, newStatus) {
    if (!isAuthReady || !userId) return console.warn("Autenticaci贸n no lista.");
    
    try {
        // Usando .doc() y .update()
        const repairRef = getRepairsCollectionRef().doc(id);
        await repairRef.update({ status: newStatus });
    } catch (error) {
        console.error("Error al actualizar el estado:", error);
    }
}

/**
 * Elimina un mantenimiento de Firestore.
 */
async function deleteRepair(id) {
    if (!isAuthReady || !userId) return console.warn("Autenticaci贸n no lista.");
    
	if (IS_MOCK_MODE) {
        console.log(`Modo Mock: Simulación de borrado de ID: ${id}.`);
        alert(`Modo Mock: Borrado de ${id} simulado.`);
        return; 
    }
    try {
        // Usando .doc() y .delete()
        const repairRef = getRepairsCollectionRef().doc(id);
        await repairRef.delete();
        console.log(`Mantenimiento ${id} eliminado con 茅xito.`);
    } catch (error) {
        console.error("Error al eliminar el mantenimiento:", error);
    }
}

// --- Renderizado y Listeners de UI ---

function renderRepairs(repairs) {
    const listContainer = document.getElementById('repairs-list');
    listContainer.innerHTML = '';
    
    // ... el resto de la funci贸n renderRepairs es el mismo ...
    if (repairs.length === 0) {
        listContainer.innerHTML = `
            <div class="p-4 text-center rounded-lg" style="background-color: #2a2a40; color: var(--color-text-secondary);">
                No hay mantenimientos reportados todav铆a.
            </div>
        `;
        return;
    }

    const sortedRepairs = repairs.sort((a, b) => {
        const statusOrder = { 'Pendiente': 1, 'En Progreso': 2, 'Completado': 3 };
        return statusOrder[a.status] - statusOrder[b.status];
    });

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

                    <div class="flex space-x-2 shrink-0">
                        ${repair.status !== 'Completado' ? `
                            <button data-action="next-status" data-id="${repair.id}" 
                                class="secondary-icon-btn p-2 rounded-full transition-transform hover:scale-110" title="Pr贸ximo Estado">
                                <i class="ph ph-arrow-circle-right text-xl"></i>
                            </button>
                        ` : ''}

                        <button data-action="delete" data-id="${repair.id}" 
                            class="secondary-icon-btn p-2 rounded-full transition-transform hover:scale-110" title="Eliminar" style="color: #FF5722;">
                            <i class="ph ph-trash text-xl"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        listContainer.innerHTML += repairHtml;
    });

    listContainer.removeEventListener('click', handleRepairActions);
    listContainer.addEventListener('click', handleRepairActions);
}

function handleRepairActions(e) {
    const button = e.target.closest('button');
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    if (action === 'delete') {
        deleteRepair(id);
    } else if (action === 'next-status') {
        const card = button.closest('.repair-card');
        const statusElement = card.querySelector('[class*="status-"]');
        if (!statusElement) return;

        const currentStatusText = statusElement.textContent.trim().split(' ')[1] || statusElement.textContent.trim();
        let nextStatus;

        switch (currentStatusText) {
            case 'Pendiente':
                nextStatus = 'En Progreso';
                break;
            case 'Progreso':
            case 'En Progreso':
                nextStatus = 'Completado';
                break;
            default:
                return;
        }
        updateRepairStatus(id, nextStatus);
    }
}


function setupRepairsListener() {
    if (!db || !isAuthReady) return;

    // Usando .where() y .onSnapshot() de la API global
    const repairsQuery = getRepairsCollectionRef();
    
    repairsQuery.onSnapshot((snapshot) => {
        const repairs = [];
        snapshot.forEach((doc) => {
            repairs.push({ id: doc.id, ...doc.data() });
        });
        renderRepairs(repairs);
    }, (error) => {
        console.error("Error en la conexi贸n en tiempo real:", error);
        document.getElementById('repairs-list').innerHTML = `
            <div class="message-error p-3 mt-4 text-red-400 bg-red-900/40 border border-red-900 rounded-lg">
                No se pudieron cargar los mantenimientos. Error de Firestore.
            </div>
        `;
    });
}


// --- Ejecuci贸n ---
window.addEventListener('load', () => {
    initializeAppAndAuth();
    document.getElementById('new-repair-form').addEventListener('submit', addRepair);
});