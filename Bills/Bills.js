// La lógica de Firebase ahora se accede globalmente desde los scripts en el HTML

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
 * Muestra u oculta el formulario de nuevo presupuesto.
 */
window.toggleNewBillForm = function() {
    const formCard = document.getElementById('new-bill-card');
    const fab = document.getElementById('show-bill-form-fab');
    
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
             throw new Error("La configuración de Firebase está incompleta.");
        }
        
        // Inicialización usando las API de compatibilidad globales
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
                
                if (userDisplayName) {
                    displayElement.textContent = userDisplayName; 
                } else {
                    displayElement.textContent = `ID: ${userId.substring(0, 8)}...`;
                }

                isAuthReady = true;
                setupBillsListener(); 
            } else {
                userId = crypto.randomUUID(); 
                displayElement.textContent = `ID Anónimo`;
                isAuthReady = true;
                setupBillsListener(); 
            }
        });
        
        // Establecer la fecha actual por defecto en el campo de fecha
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0'); // Mes empieza en 0
        const dd = String(today.getDate()).padStart(2, '0');
        document.getElementById('bill_date').value = `${yyyy}-${mm}-${dd}`;
        
    } catch (error) {
        console.error("Error al inicializar Firebase o al autenticar:", error);
        document.getElementById('bills-list').innerHTML = `
            <div class="message-error p-3 mt-4 text-red-400 bg-red-900/40 border border-red-900 rounded-lg">
                Error de conexión. No se pudo cargar el módulo de datos. (Verifique la consola del navegador)
            </div>
        `;
    }
}

// --- Funciones de Firestore (CRUD) ---

function getBillsCollectionRef() {
    // Usaremos una nueva colección 'bills' para los presupuestos
    return db.collection(`artifacts/${appId}/users/${userId}/bills`);
}

/**
 * Añade un nuevo presupuesto a Firestore.
 */
async function addBill(e) {
    e.preventDefault();
    if (!isAuthReady || !userId) return console.warn("Autenticación no lista.");

    if (IS_MOCK_MODE) {
        console.log('Modo Mock: Mantenimiento/Presupuesto simulado y guardado localmente (no persistido).');
        // Opcional: Podrías limpiar el formulario aquí
        document.getElementById('new-repair-form').reset();
        window.toggleNewRepairForm();
        return; 
    }
    // Recoger y validar campos
    const concept = document.getElementById('concept').value.trim();
    const billDateStr = document.getElementById('bill_date').value;
    const costInput = document.getElementById('cost').value;
    const notes = document.getElementById('notes').value.trim(); 

    // Validación básica
    if (!concept || !billDateStr || !costInput) {
         console.error('Validación fallida: Rellena los campos obligatorios (Concepto, Fecha, Coste).');
         return;
    }

    const cost = parseFloat(costInput);
    if (isNaN(cost) || cost < 0) {
        console.error('Validación fallida: El coste debe ser un número positivo.');
        return;
    }
    
    // Crear un objeto Date para la fecha
    const billDate = new Date(billDateStr + 'T00:00:00'); // Añadir T00:00:00 para evitar problemas de zona horaria

    const billData = {
        concept,
        bill_date: billDate,
        cost: cost.toFixed(2), // Guardar con 2 decimales
        notes: notes || null,
        status: 'Pendiente', // Estado inicial por defecto
        userId: userId,
        timestamp: Date.now()
    };

    try {
        await getBillsCollectionRef().add(billData);
        document.getElementById('new-bill-form').reset();
        
        // Restablecer la fecha actual
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        document.getElementById('bill_date').value = `${yyyy}-${mm}-${dd}`;
        
        toggleNewBillForm();
        console.log("Presupuesto guardado con éxito.");
    } catch (error) {
        console.error("Error al guardar el presupuesto:", error);
    }
}

/**
 * Elimina un presupuesto de Firestore.
 */
async function deleteBill(id) {
    if (!isAuthReady || !userId) return console.warn("Autenticación no lista.");
    
	if (IS_MOCK_MODE) {
        console.log(`Modo Mock: Simulación de borrado de ID: ${id}.`);
        alert(`Modo Mock: Borrado de ${id} simulado.`);
        return; 
    }
    if (!confirm("¿Estás seguro de que quieres eliminar este presupuesto?")) {
        return;
    }
    
    try {
        const billRef = getBillsCollectionRef().doc(id);
        await billRef.delete();
        console.log(`Presupuesto ${id} eliminado con éxito.`);
    } catch (error) {
        console.error("Error al eliminar el presupuesto:", error);
    }
}

// --- Renderizado y Listeners de UI ---

function renderBills(bills) {
    const listContainer = document.getElementById('bills-list');
    listContainer.innerHTML = '';
    
    if (bills.length === 0) {
        listContainer.innerHTML = `
            <div class="p-4 text-center rounded-lg" style="background-color: #2a2a40; color: var(--color-text-secondary);">
                No hay presupuestos registrados todavía.
            </div>
        `;
        return;
    }

    // Ordenar por fecha descendente (más recientes primero)
    const sortedBills = bills.sort((a, b) => b.timestamp - a.timestamp);

    sortedBills.forEach(bill => {
        // Formatear la fecha
        const date = bill.bill_date ? new Date(bill.bill_date.toDate ? bill.bill_date.toDate() : bill.bill_date) : new Date(bill.timestamp);
        const formattedDate = date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '');

        const billHtml = `
            <div class="bill-card" data-id="${bill.id}">
                <div class="flex justify-between items-start">
                    <div class="flex-1 min-w-0 pr-4">
                        <p class="text-sm font-light mb-1" style="color: #00BCD4;">${formattedDate}</p>
                        <p class="text-lg font-semibold truncate" style="color: var(--color-text-light);">${bill.concept}</p>
                        <p class="text-xl font-bold" style="color: #4CAF50;">${bill.cost} €</p>
                        <p class="text-sm italic mt-1" style="color: var(--color-text-secondary);">${bill.notes || 'Sin notas.'}</p>
                    </div>

                    <div class="flex space-x-2 shrink-0">
                        <button data-action="delete" data-id="${bill.id}" 
                            class="secondary-icon-btn p-2 rounded-full transition-transform hover:scale-110" title="Eliminar" style="color: #FF5722;">
                            <i class="ph ph-trash text-xl"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        listContainer.innerHTML += billHtml;
    });

    listContainer.removeEventListener('click', handleBillActions);
    listContainer.addEventListener('click', handleBillActions);
}

function handleBillActions(e) {
    const button = e.target.closest('button');
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    if (action === 'delete') {
        deleteBill(id);
    }
}


function setupBillsListener() {
    if (!db || !isAuthReady) return;

    // Obtener y escuchar la colección de 'bills'
    const billsQuery = getBillsCollectionRef().orderBy('timestamp', 'desc'); // Ordenar por el momento de creación
    
    billsQuery.onSnapshot((snapshot) => {
        const bills = [];
        snapshot.forEach((doc) => {
            bills.push({ id: doc.id, ...doc.data() });
        });
        renderBills(bills);
    }, (error) => {
        console.error("Error en la conexión en tiempo real:", error);
        document.getElementById('bills-list').innerHTML = `
            <div class="message-error p-3 mt-4 text-red-400 bg-red-900/40 border border-red-900 rounded-lg">
                No se pudieron cargar los presupuestos. Error de Firestore.
            </div>
        `;
    });
}


// --- Ejecución ---
window.addEventListener('load', () => {
    initializeAppAndAuth();
    document.getElementById('new-bill-form').addEventListener('submit', addBill);
});