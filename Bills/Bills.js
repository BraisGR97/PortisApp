/**
 * ====================================================================
 * Bills.js - Lógica para la Gestión de Presupuestos
 * ====================================================================
 * 
 * Este módulo gestiona la creación, visualización y eliminación de
 * presupuestos y gastos, soportando modo Mock y Firebase.
 */

// ====================================================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// ====================================================================

const firebaseConfig = window.firebaseConfig;
const cloudinaryConfig = window.cloudinaryConfig; // Configuración de Cloudinary
const IS_MOCK_MODE = window.IS_MOCK_MODE;

if (IS_MOCK_MODE) {
    console.warn("Modo MOCK: Las operaciones de Firestore serán simuladas.");
}

let app;
let db;
let auth;
let userId = null;
let isAuthReady = false;

// Clave para guardar los presupuestos en localStorage en Mock Mode
const MOCK_BILLS_STORAGE_KEY = 'mock_bills_data';

// Cache de datos para búsqueda
window.currentBillsData = [];

// ====================================================================
// FUNCIONES AUXILIARES MOCK
// ====================================================================

/**
 * Obtiene los presupuestos mock guardados.
 */
function getLocalMockBills() {
    try {
        const storedBills = localStorage.getItem(MOCK_BILLS_STORAGE_KEY);
        return storedBills ? JSON.parse(storedBills) : [];
    } catch (e) {
        console.error("Error al leer presupuestos mock:", e);
        return [];
    }
}

/**
 * Guarda los presupuestos mock en localStorage.
 */
function saveLocalMockBills(bills) {
    if (!IS_MOCK_MODE) return;
    try {
        localStorage.setItem(MOCK_BILLS_STORAGE_KEY, JSON.stringify(bills));
    } catch (e) {
        console.error("Error al guardar presupuestos mock:", e);
    }
}

// ====================================================================
// AUTENTICACIÓN Y SETUP
// ====================================================================

/**
 * Valida la sesión del usuario y prepara la interfaz.
 */
function checkAuthenticationAndSetup() {
    userId = sessionStorage.getItem('portis-user-identifier');
    const userDisplayName = sessionStorage.getItem('portis-user-display-name');
    const displayElement = document.getElementById('current-user-display');

    if (!userId || !userDisplayName) {
        window.location.href = '../index.html';
        return;
    }

    if (displayElement) {
        displayElement.textContent = userDisplayName;
    }

    if (IS_MOCK_MODE) {
        setupMockMode();
    } else {
        initializeAppAndAuth();
    }

    // Establecer fecha actual por defecto
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');

    const dateInput = document.getElementById('bill_date');
    if (dateInput) {
        dateInput.value = `${yyyy}-${mm}-${dd}`;
    }

    document.getElementById('new-bill-form').addEventListener('submit', saveBill);
}

/**
 * Configura el entorno Mock.
 */
function setupMockMode() {
    console.warn("Modo MOCK activado.");
    isAuthReady = true;

    let mockBills = getLocalMockBills();

    if (mockBills.length === 0) {
        console.log("Creando datos mock iniciales.");
        mockBills = [
            { id: 'm1', concept: 'Presupuesto Inicial', bill_date: new Date().toISOString(), cost: '150.00', notes: 'Revisión general.', imageUrl: '', timestamp: Date.now(), status: 'Pendiente' },
            { id: 'm2', concept: 'Pieza de Repuesto', bill_date: new Date('2025-10-20').toISOString(), cost: '85.50', notes: 'Pedido a proveedor B.', imageUrl: '', timestamp: Date.now() - 10000, status: 'Pagado' }
        ];
        saveLocalMockBills(mockBills);
    }

    const renderableBills = mockBills.map(b => ({
        ...b,
        bill_date: { toDate: () => new Date(b.bill_date) }
    }));

    renderBills(renderableBills);
}

/**
 * Inicializa Firebase y establece el listener.
 */
async function initializeAppAndAuth() {
    try {
        if (!firebaseConfig || !firebaseConfig.apiKey) {
            throw new Error("Configuración de Firebase incompleta.");
        }

        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();

        auth.onAuthStateChanged((user) => {
            if (user && user.uid === userId) {
                isAuthReady = true;
                setupBillsListener();
            } else {
                window.location.href = '../index.html';
            }
        });

    } catch (error) {
        console.error("Error Firebase:", error);
        document.getElementById('bills-list').innerHTML = `
            <div class="p-4 text-center text-red-400 border border-red-900 rounded-lg bg-red-900/20">
                Error de conexión. No se pudo cargar el módulo.
            </div>
        `;
    }
}

// ====================================================================
// GESTIÓN DE IMÁGENES
// ====================================================================

/**
 * Maneja la selección de una imagen en el formulario.
 */
window.handleImageSelect = async function (event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        alert("La imagen es demasiado grande. Máximo 5MB.");
        return;
    }

    // Mostrar preview
    const reader = new FileReader();
    reader.onload = function (e) {
        const preview = document.getElementById('image-preview');
        const container = document.getElementById('image-preview-container');
        preview.src = e.target.result;
        container.classList.remove('hidden');
    };
    reader.readAsDataURL(file);

    document.getElementById('image-filename').textContent = file.name;

    // Subir a Cloudinary
    try {
        const imageUrl = await uploadImageToCloudinary(file);
        document.getElementById('image-url').value = imageUrl;
    } catch (error) {
        alert("Error al subir la imagen. Inténtalo de nuevo.");
        clearImage();
    }
};

/**
 * Sube una imagen a Cloudinary.
 */
async function uploadImageToCloudinary(file) {
    const cloudName = cloudinaryConfig.cloudName;
    const uploadPreset = cloudinaryConfig.uploadPreset;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/upload`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) throw new Error('Error en la subida a Cloudinary');

    const data = await response.json();
    return data.secure_url;
}

/**
 * Limpia la imagen seleccionada.
 */
window.clearImage = function () {
    document.getElementById('image-upload').value = '';
    document.getElementById('image-url').value = '';
    document.getElementById('image-filename').textContent = '';
    document.getElementById('image-preview').src = '';
    document.getElementById('image-preview-container').classList.add('hidden');
};

/**
 * Abre el modal de visualización de imagen.
 */
window.openImageModal = function (imageUrl, title) {
    if (!imageUrl) return;
    document.getElementById('view-image-src').src = imageUrl;
    document.getElementById('view-image-title').textContent = title || 'Imagen del Presupuesto';
    document.getElementById('view-image-modal').classList.remove('hidden');
    // Asegurar que el modal se muestre (por si acaso hay conflicto de clases)
    document.getElementById('view-image-modal').style.display = 'flex';
};

/**
 * Cierra el modal de visualización de imagen.
 */
window.closeImageModal = function () {
    const modal = document.getElementById('view-image-modal');
    modal.classList.add('hidden');
    modal.style.display = ''; // Limpiar estilo inline
};


// ====================================================================
// FUNCIONES DE FIREBASE
// ====================================================================

function getBillsCollectionRef() {
    if (!db || !userId) return null;
    return db.collection(`users/${userId}/bills`);
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
        console.error("Error snapshot:", error);
    });
}

// ====================================================================
// CRUD - CREAR Y ACTUALIZAR
// ====================================================================

/**
 * Guarda un nuevo presupuesto.
 */
async function saveBill(e) {
    e.preventDefault();
    if (!isAuthReady || !userId) return;

    const form = document.getElementById('new-bill-form');
    const submitButton = document.getElementById('save-bill-btn');

    const concept = document.getElementById('concept').value.trim();
    const billDateStr = document.getElementById('bill_date').value;
    const costInput = document.getElementById('cost').value;
    const notes = document.getElementById('notes').value.trim();
    const imageUrl = document.getElementById('image-url').value;

    if (!concept || !billDateStr || !costInput) return;

    const cost = parseFloat(costInput);
    if (isNaN(cost) || cost < 0) {
        alert('El coste debe ser un número positivo.');
        return;
    }

    submitButton.innerHTML = '<i class="ph ph-circle-notch animate-spin mr-2"></i> Guardando...';
    submitButton.disabled = true;

    const billDate = new Date(billDateStr + 'T00:00:00');

    // MOCK MODE
    if (IS_MOCK_MODE) {
        const newMockBill = {
            id: 'm' + Date.now(),
            concept,
            bill_date: billDate.toISOString(),
            cost: cost.toFixed(2),
            notes: notes || null,
            imageUrl: imageUrl || null,
            status: 'Pendiente',
            userId: userId,
            timestamp: Date.now()
        };

        let mockBills = getLocalMockBills();
        mockBills.unshift(newMockBill);
        saveLocalMockBills(mockBills);

        const renderableBills = mockBills.map(b => ({
            ...b,
            bill_date: { toDate: () => new Date(b.bill_date) }
        }));
        renderBills(renderableBills);

        finishSave(form, submitButton);
        return;
    }

    // FIREBASE MODE
    const billData = {
        concept,
        bill_date: firebase.firestore.Timestamp.fromDate(billDate),
        cost: cost.toFixed(2),
        notes: notes || null,
        imageUrl: imageUrl || null,
        status: 'Pendiente',
        userId: userId,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        const billsRef = getBillsCollectionRef();
        if (billsRef) {
            await billsRef.add(billData);
            finishSave(form, submitButton);
        }
    } catch (error) {
        console.error("Error guardando:", error);
        alert("Error al guardar el presupuesto.");
        submitButton.innerHTML = '<i class="ph ph-floppy-disk mr-2"></i> Guardar Presupuesto';
        submitButton.disabled = false;
    }
}

function finishSave(form, submitButton) {
    form.reset();
    clearImage(); // Limpiar imagen
    window.toggleNewBillForm();
    submitButton.innerHTML = '<i class="ph ph-floppy-disk mr-2"></i> Guardar Presupuesto';
    submitButton.disabled = false;

    // Restaurar fecha
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('bill_date').value = `${yyyy}-${mm}-${dd}`;
}

// ====================================================================
// CRUD - ELIMINAR Y ACTUALIZAR ESTADO
// ====================================================================

window.deleteBill = async function (id) {
    if (!isAuthReady || !userId) return;

    if (!confirm("¿Estás seguro de que quieres eliminar este presupuesto?")) return;

    const billElement = document.querySelector(`.bill-card[data-id="${id}"]`);
    if (billElement) {
        billElement.classList.add('opacity-0', 'transform', '-translate-x-full');
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    if (IS_MOCK_MODE) {
        let mockBills = getLocalMockBills();
        mockBills = mockBills.filter(b => b.id !== id);
        saveLocalMockBills(mockBills);

        const renderableBills = mockBills.map(b => ({
            ...b,
            bill_date: { toDate: () => new Date(b.bill_date) }
        }));
        renderBills(renderableBills);
        return;
    }

    try {
        const billsRef = getBillsCollectionRef();
        if (billsRef) await billsRef.doc(id).delete();
    } catch (error) {
        console.error("Error eliminando:", error);
        if (billElement) {
            billElement.classList.remove('opacity-0', 'transform', '-translate-x-full');
        }
    }
}

window.toggleBillStatus = async function (id, newStatus) {
    if (!isAuthReady || !userId) return;

    if (IS_MOCK_MODE) {
        let mockBills = getLocalMockBills();
        const index = mockBills.findIndex(b => b.id === id);
        if (index !== -1) {
            mockBills[index].status = newStatus;
            saveLocalMockBills(mockBills);

            const renderableBills = mockBills.map(b => ({
                ...b,
                bill_date: { toDate: () => new Date(b.bill_date) }
            }));
            renderBills(renderableBills);
        }
        return;
    }

    try {
        const billsRef = getBillsCollectionRef();
        if (billsRef) await billsRef.doc(id).update({ status: newStatus });
    } catch (error) {
        console.error("Error actualizando estado:", error);
    }
}

// ====================================================================
// RENDERIZADO Y UI
// ====================================================================

function renderBills(bills, updateCache = true) {
    if (updateCache) window.currentBillsData = bills;

    const listContainer = document.getElementById('bills-list');
    listContainer.innerHTML = '';

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
                ${searchTerm ? 'No se encontraron resultados.' : 'No hay presupuestos registrados.'}
            </div>
        `;
        return;
    }

    // Ordenar y agrupar
    filteredBills.sort((a, b) => {
        const dateA = a.bill_date && a.bill_date.toDate ? a.bill_date.toDate() : new Date(a.bill_date);
        const dateB = b.bill_date && b.bill_date.toDate ? b.bill_date.toDate() : new Date(b.bill_date);
        return dateB - dateA;
    });

    const billsByMonth = {};
    filteredBills.forEach(bill => {
        const dateRaw = bill.bill_date && bill.bill_date.toDate ? bill.bill_date.toDate() : new Date(bill.bill_date);
        const monthKey = dateRaw.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        const formattedMonthKey = monthKey.charAt(0).toUpperCase() + monthKey.slice(1);

        if (!billsByMonth[formattedMonthKey]) {
            billsByMonth[formattedMonthKey] = { bills: [], total: 0 };
        }
        billsByMonth[formattedMonthKey].bills.push(bill);
        billsByMonth[formattedMonthKey].total += parseFloat(bill.cost) || 0;
    });

    Object.keys(billsByMonth).forEach(monthKey => {
        const group = billsByMonth[monthKey];

        const monthHeader = document.createElement('div');
        monthHeader.className = 'flex justify-between items-center px-2 py-3 mt-4 mb-2 border-b border-dashed';
        monthHeader.style.borderColor = 'var(--color-border)';
        monthHeader.innerHTML = `
            <h3 class="text-lg font-bold" style="color: var(--color-text-primary);">${monthKey}</h3>
            <span class="text-sm font-semibold px-3 py-1 rounded-full" style="background-color: var(--color-bg-tertiary); color: var(--color-accent-magenta);">
                Total: ${group.total.toFixed(2)} €
            </span>
        `;
        listContainer.appendChild(monthHeader);

        group.bills.forEach(bill => {
            const dateRaw = bill.bill_date && bill.bill_date.toDate ? bill.bill_date.toDate() : new Date(bill.bill_date);
            const formattedDate = dateRaw.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

            const card = document.createElement('div');
            card.className = 'bill-card';
            card.setAttribute('data-id', bill.id);

            const statusClass = bill.status === 'Pagado' ? 'paid' : 'pending';

            card.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-lg truncate pr-2 bill-card-title">${bill.concept}</h3>
                    <span class="status-badge ${statusClass}">
                        ${bill.status || 'Pendiente'}
                    </span>
                </div>
                
                <div class="text-sm mb-3 space-y-1 bill-card-content">
                    <p class="flex items-center gap-2">
                        <i class="ph ph-calendar-blank"></i>
                        ${formattedDate}
                    </p>
                    <p class="flex items-center gap-2 italic line-clamp-2">
                        <i class="ph ph-note"></i>
                        ${bill.notes || 'Sin notas.'}
                    </p>
                </div>

                <div class="flex justify-between items-center mt-3 pt-3 border-t" style="border-color: var(--color-border);">
                    <span class="text-xl font-bold" style="color: var(--color-accent-green);">
                        ${bill.cost} €
                    </span>
                    
                    <div class="flex gap-2">
                        ${bill.imageUrl ? `
                        <button data-action="view-image" data-id="${bill.id}"
                            class="secondary-icon-btn p-2 rounded-full hover:text-blue-500 hover:border-blue-500" 
                            title="Ver Imagen">
                            <i class="ph ph-image text-lg pointer-events-none"></i>
                        </button>
                        ` : ''}
                        
                        ${bill.status !== 'Pagado' ? `
                        <button data-action="pay" data-id="${bill.id}"
                            class="secondary-icon-btn p-2 rounded-full hover:text-green-500 hover:border-green-500" 
                            title="Marcar como Pagado">
                            <i class="ph ph-check-circle text-lg pointer-events-none"></i>
                        </button>
                        ` : ''}
                        <button data-action="delete" data-id="${bill.id}"
                            class="secondary-icon-btn p-2 rounded-full hover:text-red-500 hover:border-red-500" 
                            title="Eliminar">
                            <i class="ph ph-trash text-lg pointer-events-none"></i>
                        </button>
                    </div>
                </div>
            `;
            listContainer.appendChild(card);
        });
    });

    setTimeout(updateCardBorderOpacity, 50);
}

/**
 * Actualiza la opacidad del borde superior de las tarjetas (Efecto Visual).
 */
function updateCardBorderOpacity() {
    const elements = document.querySelectorAll('.bill-card, .card-container');
    const viewportHeight = window.innerHeight;

    elements.forEach(element => {
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

function handleBillActions(e) {
    const button = e.target.closest('button[data-action][data-id]');
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    if (action === 'delete') {
        window.deleteBill(id);
    } else if (action === 'pay') {
        window.toggleBillStatus(id, 'Pagado');
    } else if (action === 'view-image') {
        const bill = window.currentBillsData.find(b => b.id === id);
        if (bill && bill.imageUrl) {
            window.openImageModal(bill.imageUrl, bill.concept);
        }
    }
}

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
            searchInput.dispatchEvent(new Event('input'));
        }
    }
}

window.toggleNewBillForm = function () {
    const card = document.getElementById('new-bill-card');
    const fab = document.getElementById('show-bill-form-fab');
    const form = document.getElementById('new-bill-form');

    if (!card || !fab) return;

    const isHidden = card.classList.contains('hidden');

    if (isHidden) {
        card.classList.remove('hidden');
        fab.classList.add('rotate-45');
        fab.querySelector('i').classList.replace('ph-plus', 'ph-x');
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });

        if (form && !document.getElementById('bill-id').value) {
            form.reset();
            clearImage(); // Limpiar imagen al abrir
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            document.getElementById('bill_date').value = `${yyyy}-${mm}-${dd}`;
        }
    } else {
        card.classList.add('hidden');
        fab.classList.remove('rotate-45');
        fab.querySelector('i').classList.replace('ph-x', 'ph-plus');
    }
}

window.cancelEdit = function () {
    window.toggleNewBillForm();
}

// ====================================================================
// INICIALIZACIÓN
// ====================================================================

window.addEventListener('load', () => {
    if (typeof window.applyColorMode === 'function') window.applyColorMode();

    window.addEventListener('storage', (e) => {
        if (e.key === 'portis-theme' && typeof window.applyColorMode === 'function') {
            window.applyColorMode();
        }
    });

    checkAuthenticationAndSetup();

    const listContainer = document.getElementById('bills-list');
    if (listContainer) {
        listContainer.addEventListener('click', handleBillActions);
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (window.currentBillsData) {
                renderBills(window.currentBillsData, false);
            }
        });
    }

    // Efectos visuales
    window.addEventListener('scroll', updateCardBorderOpacity);
    const appContent = document.getElementById('app-content');
    if (appContent) appContent.addEventListener('scroll', updateCardBorderOpacity);
    const scrollContainer = document.querySelector('.card-container.inverted-split .card-inner-content');
    if (scrollContainer) scrollContainer.addEventListener('scroll', updateCardBorderOpacity);

    setTimeout(updateCardBorderOpacity, 100);
    window.addEventListener('resize', updateCardBorderOpacity);
});