/**
 * ====================================================================
 * Bills.js - Lógica para la Gestión de Presupuestos (Bills)
 * ====================================================================
 */

// -----------------------------------------------------------------
// 1. CONFIGURACIÓN Y VARIABLES GLOBALES (Usando CONST para inmutables)
// -----------------------------------------------------------------
const firebaseConfig = window.firebaseConfig;
const IS_MOCK_MODE = window.IS_MOCK_MODE;

if (IS_MOCK_MODE) {
    console.warn("Modo MOCK: Las operaciones de Firestore serán simuladas.");
}

const appId = firebaseConfig ? firebaseConfig.projectId : 'mock-app-id';

let app;
let db;
let auth;
let userId = null; // ✅ Mejorado: Inicializado como null
let isAuthReady = false;

// Clave para guardar los presupuestos en localStorage en Mock Mode
const MOCK_BILLS_STORAGE_KEY = 'mock_bills_data';

// Cache de datos para búsqueda
window.currentBillsData = [];

/**
 * Función auxiliar para obtener los presupuestos mock guardados.
 * @returns {Array<Object>} Lista de presupuestos mock.
 */
function getLocalMockBills() {
    try {
        const storedBills = localStorage.getItem(MOCK_BILLS_STORAGE_KEY);
        // Si no hay datos, o si no se está en Mock Mode, devuelve el valor por defecto.
        return storedBills ? JSON.parse(storedBills) : [];
    } catch (e) {
        console.error("Error al leer presupuestos mock de localStorage:", e);
        return [];
    }
}

/**
 * Función auxiliar para guardar los presupuestos mock en localStorage.
 * @param {Array<Object>} bills Lista de presupuestos a guardar.
 */
function saveLocalMockBills(bills) {
    if (!IS_MOCK_MODE) return;
    try {
        localStorage.setItem(MOCK_BILLS_STORAGE_KEY, JSON.stringify(bills));
    } catch (e) {
        console.error("Error al guardar presupuestos mock en localStorage:", e);
    }
}


// -----------------------------------------------------------------

/**
 * Valida la sesión y prepara la UI.
 */
function checkAuthenticationAndSetup() {
    // Obtenemos la sesión actual
    userId = sessionStorage.getItem('portis-user-identifier');
    const userDisplayName = sessionStorage.getItem('portis-user-display-name');
    const displayElement = document.getElementById('current-user-display');


    // 1. Verificar si el usuario está autenticado (debe haber sesión activa)
    if (!userId || !userDisplayName) {
        console.warn("Sesión no válida o caducada. Redirigiendo a Index.");
        window.location.href = '../index.html';
        return;
    }

    // 2. Mostrar la identidad del usuario (usando el nombre guardado)
    if (displayElement) {
        displayElement.textContent = userDisplayName;
    }

    // 3. Inicializar Firebase o entrar en Mock Mode
    if (IS_MOCK_MODE) {
        // Modo MOCK: Simplemente marcamos la autenticación como lista y cargamos datos mock
        console.warn("Modo MOCK activado. Usando datos no persistentes.");
        isAuthReady = true;

        // --- Lógica para cargar datos Mock ---
        let mockBills = getLocalMockBills();

        // Si no hay datos guardados localmente, usamos los datos de prueba iniciales
        if (mockBills.length === 0) {
            console.log("Creando datos mock iniciales por primera vez.");
            mockBills = [
                // Nota: Los objetos se guardan directamente como están. Al cargarlos
                // para renderizar, hay que asegurar que bill_date se pueda convertir.
                { id: 'm1', concept: 'Presupuesto Inicial', bill_date: new Date().toISOString(), cost: '150.00', notes: 'Revisión general.', timestamp: Date.now(), status: 'Pendiente' },
                { id: 'm2', concept: 'Pieza de Repuesto', bill_date: new Date('2025-10-20').toISOString(), cost: '85.50', notes: 'Pedido a proveedor B.', timestamp: Date.now() - 10000, status: 'Pagado' },
            ];
            saveLocalMockBills(mockBills);
        }

        // Adaptar los datos mock para que renderBills los pueda usar
        const renderableBills = mockBills.map(b => ({
            ...b,
            bill_date: { toDate: () => new Date(b.bill_date) } // Simular función toDate()
        }));

        renderBills(renderableBills);
        // ------------------------------------

    } else {
        // Modo REAL: Inicialización de Firebase
        initializeAppAndAuth();
    }

    // 4. Establecer la fecha actual por defecto en el campo de fecha
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0'); // Mes empieza en 0
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('bill_date').value = `${yyyy}-${mm}-${dd}`;

    // 5. Asignar listener del formulario de forma segura
    document.getElementById('new-bill-form').addEventListener('submit', addBill);
}


/**
 * Inicializa Firebase, y establece el listener de estado.
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
                setupBillsListener();
            } else {
                console.warn("Firebase no detecta sesión activa. Redirigiendo.");
                window.location.href = '../index.html';
            }
        });

    } catch (error) {
        console.error("Error al inicializar Firebase o al autenticar:", error);
        document.getElementById('bills-list').innerHTML = `
            <div class="message-error p-3 mt-4 text-red-400 bg-red-900/40 border border-red-900 rounded-lg">
                Error de conexión. No se pudo cargar el módulo de datos. (Verifique la consola del navegador)
            </div>
        `;
    }
}

// -----------------------------------------------------------------
// 4. FUNCIONES DE FIREBASE (CRUD)
// -----------------------------------------------------------------

function getBillsCollectionRef() {
    if (!db || !userId) return null;
    // Usar la misma estructura que Repairs y Maintenance
    return db.collection(`users/${userId}/bills`);
}

/**
 * Añade un nuevo presupuesto a Firestore o a Local Storage (Mock Mode).
 */
async function addBill(e) {
    e.preventDefault();
    if (!isAuthReady || !userId) return console.warn("Autenticación no lista.");

    const form = document.getElementById('new-bill-form');
    const submitButton = form.querySelector('button[type="submit"]');

    // Recoger y validar campos
    const concept = document.getElementById('concept').value.trim();
    const billDateStr = document.getElementById('bill_date').value;
    const costInput = document.getElementById('cost').value;
    const notes = document.getElementById('notes').value.trim();

    if (!concept || !billDateStr || !costInput) {
        // No es necesario alertar si el HTML tiene 'required', pero se mantiene por seguridad
        return;
    }

    const cost = parseFloat(costInput);
    if (isNaN(cost) || cost < 0) {
        alert('El coste debe ser un número positivo.');
        return;
    }

    submitButton.innerHTML = '<i class="ph ph-circle-notch animate-spin mr-2"></i> Guardando...';
    submitButton.disabled = true;

    const billDate = new Date(billDateStr + 'T00:00:00');

    // Manejo de Mock Mode
    if (IS_MOCK_MODE) {
        // Datos para guardar localmente
        const newMockBill = {
            id: 'm' + Date.now(), // ID simple para mock
            concept,
            // Almacenar la fecha como ISO string para fácil deserialización
            bill_date: billDate.toISOString(),
            cost: cost.toFixed(2),
            notes: notes || null,
            status: 'Pendiente',
            userId: userId,
            timestamp: Date.now()
        };

        // 1. Recuperar, añadir y guardar
        let mockBills = getLocalMockBills();
        mockBills.unshift(newMockBill); // Añadir al inicio para que se vea primero
        saveLocalMockBills(mockBills);

        // 2. Renderizar la lista actualizada
        const renderableBills = mockBills.map(b => ({
            ...b,
            bill_date: { toDate: () => new Date(b.bill_date) }
        }));
        renderBills(renderableBills);

        // 3. Limpiar y terminar UI
        await new Promise(resolve => setTimeout(resolve, 500));
        form.reset();
        window.toggleNewBillForm();
        submitButton.innerHTML = '<i class="ph ph-floppy-disk mr-2"></i> Guardar Presupuesto';
        submitButton.disabled = false;
        console.log('Modo Mock: Presupuesto guardado localmente (en localStorage).', newMockBill);
        return;
    }

    // Datos para Firestore (Modo Real)
    const billData = {
        concept,
        bill_date: firebase.firestore.Timestamp.fromDate(billDate),
        cost: cost.toFixed(2),
        notes: notes || null,
        status: 'Pendiente',
        userId: userId,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Operación Real de Firestore
    try {
        const billsRef = getBillsCollectionRef();
        if (!billsRef) return;

        await billsRef.add(billData);

        form.reset();
        window.toggleNewBillForm();
        console.log("Presupuesto guardado con éxito.");
    } catch (error) {
        console.error("Error al guardar el presupuesto:", error);
    } finally {
        submitButton.innerHTML = '<i class="ph ph-floppy-disk mr-2"></i> Guardar Presupuesto';
        submitButton.disabled = false;
    }
}

/**
 * Elimina un presupuesto de Firestore o de Local Storage (Mock Mode).
 */
window.deleteBill = async function (id) {
    if (!isAuthReady || !userId) return console.warn("Autenticación no lista.");

    if (!confirm("¿Estás seguro de que quieres eliminar este presupuesto?")) {
        return;
    }

    const billElement = document.querySelector(`.bill-card[data-id="${id}"]`);
    if (billElement) {
        // Efecto de transición
        billElement.classList.add('opacity-0', 'transform', '-translate-x-full');
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    if (IS_MOCK_MODE) {
        // Lógica de borrado en Mock Mode (Local Storage)
        let mockBills = getLocalMockBills();
        const initialLength = mockBills.length;

        // Filtrar y guardar la nueva lista
        mockBills = mockBills.filter(b => b.id !== id);
        saveLocalMockBills(mockBills);

        if (initialLength !== mockBills.length) {
            console.log(`Modo Mock: Presupuesto ID ${id} eliminado localmente.`);
            // Si el elemento no se ha borrado con la transición, lo borramos ahora
            if (billElement) billElement.remove();

            // Renderizar la lista actualizada de Local Storage
            const renderableBills = mockBills.map(b => ({
                ...b,
                bill_date: { toDate: () => new Date(b.bill_date) }
            }));
            renderBills(renderableBills);

        } else {
            console.warn(`Modo Mock: No se encontró el presupuesto ID ${id}.`);
        }
        return;
    }

    // Lógica de borrado en Modo Real (Firestore)
    try {
        const billsRef = getBillsCollectionRef();
        if (!billsRef) return;

        await billsRef.doc(id).delete();
        console.log(`Presupuesto ${id} eliminado con éxito.`);
    } catch (error) {
        console.error("Error al eliminar el presupuesto:", error);
        // Si falla, revertir la transición
        if (billElement) {
            billElement.classList.remove('opacity-0', 'transform', '-translate-x-full');
        }
    }
}

// -----------------------------------------------------------------
// 5. RENDERIZADO Y LISTENERS DE UI
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
            // Disparar evento de input para limpiar el filtro
            searchInput.dispatchEvent(new Event('input'));
        }
    }
}

function renderBills(bills, updateCache = true) {
    if (updateCache) {
        window.currentBillsData = bills;
    }

    const listContainer = document.getElementById('bills-list');
    listContainer.innerHTML = '';

    // 1. Filtrado
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

    let filteredBills = bills;
    if (searchTerm) {
        filteredBills = bills.filter(b =>
            (b.concept && b.concept.toLowerCase().includes(searchTerm)) ||
            (b.notes && b.notes.toLowerCase().includes(searchTerm)) ||
            (b.cost && b.cost.toString().includes(searchTerm))
        );
    }

    if (filteredBills.length === 0) {
        listContainer.innerHTML = `
            <div class="p-4 text-center rounded-lg" style="background-color: var(--color-bg-secondary); color: var(--color-text-secondary);">
                No hay presupuestos que coincidan con la búsqueda.
            </div>
        `;
        return;
    }

    // 2. Ordenar por fecha (más reciente primero)
    filteredBills.sort((a, b) => {
        const dateA = a.bill_date && a.bill_date.toDate ? a.bill_date.toDate() : new Date(a.bill_date);
        const dateB = b.bill_date && b.bill_date.toDate ? b.bill_date.toDate() : new Date(b.bill_date);
        return dateB - dateA;
    });

    // 3. Agrupar por mes
    const billsByMonth = {};

    filteredBills.forEach(bill => {
        const dateRaw = bill.bill_date && bill.bill_date.toDate ? bill.bill_date.toDate() : new Date(bill.bill_date);
        // Clave de agrupación: "Noviembre 2023"
        const monthKey = dateRaw.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        // Capitalizar primera letra
        const formattedMonthKey = monthKey.charAt(0).toUpperCase() + monthKey.slice(1);

        if (!billsByMonth[formattedMonthKey]) {
            billsByMonth[formattedMonthKey] = {
                bills: [],
                total: 0
            };
        }

        billsByMonth[formattedMonthKey].bills.push(bill);
        billsByMonth[formattedMonthKey].total += parseFloat(bill.cost) || 0;
    });

    // 4. Renderizar grupos
    Object.keys(billsByMonth).forEach(monthKey => {
        const group = billsByMonth[monthKey];

        // Header del mes
        const monthHeader = document.createElement('div');
        monthHeader.className = 'flex justify-between items-center px-2 py-3 mt-4 mb-2 border-b border-dashed';
        monthHeader.style.borderColor = 'var(--color-border)';
        monthHeader.innerHTML = `
            <h3 class="text-lg font-bold" style="color: var(--color-text-primary);">${monthKey}</h3>
            <span class="text-sm font-semibold px-3 py-1 rounded-full" style="background-color: var(--color-bg-tertiary); color: var(--color-accent-blue);">
                Total: ${group.total.toFixed(2)} €
            </span>
        `;
        listContainer.appendChild(monthHeader);

        // Lista de facturas del mes
        group.bills.forEach(bill => {
            const dateRaw = bill.bill_date && bill.bill_date.toDate ? bill.bill_date.toDate() : new Date(bill.bill_date);
            const formattedDate = dateRaw.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '');

            const card = document.createElement('div');
            card.className = 'bill-card p-4 rounded-xl shadow-sm border relative group cursor-pointer transition-all duration-200 hover:shadow-md mb-3';
            card.setAttribute('data-id', bill.id);
            card.style.backgroundColor = 'var(--color-bg-secondary)';
            card.style.borderColor = 'var(--color-border)';

            const billHtml = `
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-lg truncate pr-8" style="color: var(--color-text-primary);">${bill.concept}</h3>
                    <span class="text-xs font-medium px-2 py-1 rounded-full ${bill.status === 'Pagado' ? 'text-green-500 bg-green-100 dark:bg-green-900/30' : 'text-orange-500 bg-orange-100 dark:bg-orange-900/30'}">
                        ${bill.status || 'Pendiente'}
                    </span>
                </div>
                
                <div class="text-sm mb-3 space-y-1" style="color: var(--color-text-secondary);">
                    <p class="flex items-center gap-2">
                        <i class="ph ph-calendar-blank"></i>
                        ${formattedDate}
                    </p>
                    <p class="flex items-center gap-2 italic">
                        <i class="ph ph-note"></i>
                        ${bill.notes ? (bill.notes.length > 40 ? bill.notes.substring(0, 40) + '...' : bill.notes) : 'Sin notas.'}
                    </p>
                </div>

                <div class="flex justify-between items-center mt-3 pt-3 border-t" style="border-color: var(--color-border);">
                    <span class="text-xl font-bold" style="color: #4CAF50;">
                        ${bill.cost} €
                    </span>
                    
                    <div class="flex gap-2">
                        ${bill.status !== 'Pagado' ? `
                        <button data-action="pay" data-id="${bill.id}"
                            class="action-btn pay-btn p-2 rounded-full hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors text-green-500" 
                            title="Marcar como Pagado" 
                            aria-label="Pagar presupuesto ${bill.concept}">
                            <i class="ph ph-check-circle text-lg pointer-events-none"></i>
                        </button>
                        ` : ''}
                        <button data-action="delete" data-id="${bill.id}"
                            class="action-btn delete-btn p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-red-500" 
                            title="Eliminar presupuesto" 
                            aria-label="Eliminar presupuesto ${bill.concept}">
                            <i class="ph ph-trash text-lg pointer-events-none"></i>
                        </button>
                    </div>
                </div>
            `;

            card.innerHTML = billHtml;
            listContainer.appendChild(card);
        });
    });
}

/**
 * Delegación de eventos para manejar clics dentro de la lista.
 */
function handleBillActions(e) {
    const button = e.target.closest('button[data-action][data-id]');
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    if (action === 'delete') {
        window.deleteBill(id);
    } else if (action === 'pay') {
        window.toggleBillStatus(id, 'Pagado');
    }
}

/**
 * Cambia el estado de un presupuesto.
 */
window.toggleBillStatus = async function (id, newStatus) {
    if (!isAuthReady || !userId) return console.warn("Autenticación no lista.");

    if (IS_MOCK_MODE) {
        let mockBills = getLocalMockBills();
        const index = mockBills.findIndex(b => b.id === id);
        if (index !== -1) {
            mockBills[index].status = newStatus;
            saveLocalMockBills(mockBills);

            // Renderizar la lista actualizada
            const renderableBills = mockBills.map(b => ({
                ...b,
                bill_date: { toDate: () => new Date(b.bill_date) }
            }));
            renderBills(renderableBills);
        }
        return;
    }

    // Modo Real
    try {
        const billsRef = getBillsCollectionRef();
        if (!billsRef) return;

        await billsRef.doc(id).update({ status: newStatus });
        console.log(`Presupuesto ${id} marcado como ${newStatus}.`);
    } catch (error) {
        console.error("Error al actualizar el estado del presupuesto:", error);
    }
}


function setupBillsListener() {
    if (!db || !isAuthReady || !userId) return;

    const billsQuery = getBillsCollectionRef().orderBy('timestamp', 'desc');

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

/**
 * Muestra u oculta el formulario de creación de presupuestos.
 */
window.toggleNewBillForm = function () {
    const card = document.getElementById('new-bill-card');
    const fab = document.getElementById('show-bill-form-fab');
    const form = document.getElementById('new-bill-form');

    if (!card || !fab) return;

    const isHidden = card.classList.contains('hidden');

    if (isHidden) {
        // Mostrar formulario
        card.classList.remove('hidden');
        fab.classList.add('rotate-45');
        fab.querySelector('i').classList.replace('ph-plus', 'ph-x');

        // Scroll suave hacia el formulario
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Resetear formulario al abrir
        if (form) {
            form.reset();
            // Restaurar fecha por defecto
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            document.getElementById('bill_date').value = `${yyyy}-${mm}-${dd}`;
        }

    } else {
        // Ocultar formulario
        card.classList.add('hidden');
        fab.classList.remove('rotate-45');
        fab.querySelector('i').classList.replace('ph-x', 'ph-plus');
    }
}

// --- Ejecución ---
window.addEventListener('load', () => {
    if (typeof window.applyColorMode === 'function') {
        window.applyColorMode();
    }

    // Escuchar cambios en localStorage para el tema (si se cambia en otra pestaña)
    window.addEventListener('storage', (e) => {
        if (e.key === 'portis-theme') {
            if (typeof window.applyColorMode === 'function') {
                window.applyColorMode();
            }
        }
    });

    checkAuthenticationAndSetup();

    const listContainer = document.getElementById('bills-list');
    if (listContainer) {
        listContainer.addEventListener('click', handleBillActions);
    }

    // Listener para el input de búsqueda
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            // Re-renderizar usando los datos cacheados
            if (window.currentBillsData) {
                renderBills(window.currentBillsData, false);
            }
        });
    }
});