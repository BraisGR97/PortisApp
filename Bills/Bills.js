/**
 * ====================================================================
 * Bills.js - Lógica para la Gestión de Presupuestos
 * ====================================================================
 */

// ====================================================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// ====================================================================

const firebaseConfig = window.firebaseConfig;
const cloudinaryConfig = window.cloudinaryConfig;
const appId = firebaseConfig ? firebaseConfig.projectId : 'portis-app-id';

let app;
let db;
let auth;
let userId = sessionStorage.getItem('portis-user-identifier') || null;
let userDisplayName = sessionStorage.getItem('portis-user-display-name') || null;
let isAuthReady = false;

// Cache de datos para búsqueda
window.currentBillsData = [];

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

    if (displayElement) displayElement.textContent = userDisplayName;

    initializeAppAndAuth();
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
        console.error("Error al inicializar Firebase:", error);
        alert("Error crítico al cargar la aplicación.");
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

    const previewContainer = document.getElementById('image-preview-container');
    const preview = document.getElementById('image-preview');
    const imageUrlInput = document.getElementById('image-url');

    // Mostrar previsualización
    const reader = new FileReader();
    reader.onload = (e) => {
        preview.src = e.target.result;
        previewContainer.classList.remove('hidden');
    };
    reader.readAsDataURL(file);

    // Subir a Cloudinary
    try {
        const imageUrl = await uploadImageToCloudinary(file);
        if (imageUrl) {
            imageUrlInput.value = imageUrl;
        }
    } catch (error) {
        console.error("Error al subir imagen:", error);
        alert("Error al subir la imagen. Inténtalo de nuevo.");
    }
};

/**
 * Sube una imagen a Cloudinary.
 */
async function uploadImageToCloudinary(file) {
    if (!cloudinaryConfig) {
        alert("Error: Configuración de Cloudinary no encontrada.");
        return null;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', cloudinaryConfig.uploadPreset);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) throw new Error('Error al subir imagen');

    const data = await response.json();
    return data.secure_url;
}

/**
 * Limpia la imagen seleccionada.
 */
window.clearImage = function () {
    document.getElementById('image-upload').value = '';
    document.getElementById('image-url').value = '';
    document.getElementById('image-preview-container').classList.add('hidden');
};

/**
 * Abre el modal de visualización de imagen.
 */
window.openImageModal = function (imageUrl, title) {
    const modal = document.getElementById('view-image-modal');
    const img = document.getElementById('modal-image');
    const titleEl = document.getElementById('modal-image-title');

    img.src = imageUrl;
    titleEl.textContent = title;
    modal.classList.remove('hidden');
};

/**
 * Cierra el modal de visualización de imagen.
 */
window.closeImageModal = function () {
    document.getElementById('view-image-modal').classList.add('hidden');
};

// ====================================================================
// FUNCIONES DE FIREBASE
// ====================================================================

function getBillsCollectionRef() {
    return db.collection(`users/${userId}/bills`);
}

function setupBillsListener() {
    getBillsCollectionRef().onSnapshot((snapshot) => {
        const bills = [];
        snapshot.forEach((doc) => {
            bills.push({ id: doc.id, ...doc.data() });
        });
        renderBills(bills);
    }, (error) => {
        console.error("Error al escuchar cambios:", error);
    });
}

// ====================================================================
// CRUD - CREAR Y ACTUALIZAR
// ====================================================================

/**
 * Guarda un nuevo presupuesto.
 */
window.saveBill = async function (e) {
    e.preventDefault();

    const form = e.target;
    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.innerHTML;

    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="ph ph-circle-notch animate-spin mr-2"></i> Guardando...';

    try {
        const concept = document.getElementById('concept').value.trim();
        const cost = parseFloat(document.getElementById('cost').value);

        // Validación segura del input de fecha
        const dateInput = document.getElementById('date');
        if (!dateInput) throw new Error("Error interno: Input de fecha no encontrado.");
        const dateValue = dateInput.value;

        const status = 'Pendiente'; // Siempre se crea en Pendiente
        const notes = document.getElementById('notes').value.trim();
        const imageUrl = document.getElementById('image-url').value.trim();

        if (!concept || isNaN(cost) || !dateValue) {
            throw new Error("Por favor, completa todos los campos obligatorios.");
        }

        // Formatear fecha para mostrar (ej: "12 de Octubre de 2023")
        const dateObj = new Date(dateValue);
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const formattedDate = `${dateObj.getDate()} de ${monthNames[dateObj.getMonth()]} de ${dateObj.getFullYear()}`;

        const billData = {
            concept,
            cost: cost.toFixed(2),
            month: formattedDate, // Guardamos la fecha formateada en el campo 'month' para compatibilidad
            rawDate: dateValue,   // Guardamos también la fecha cruda por si acaso
            status,
            notes,
            imageUrl: imageUrl || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // VERIFICAR LIMITE DE IMAGENES (100)
        if (imageUrl) {
            // Bills solo tiene CREATE, no UPDATE via formulario (saveBill usa add).
            // (Nota: El código original solo tiene saveBill haciendo add, no update? 
            //  Revisando saveBill: Solo hace collection.add. NO soporta edición completa de formulario, 
            //  solo toggle status. Por tanto SIEMPRE es tarjeta nueva.)

            let existingBillsWithImages = window.currentBillsData.filter(b => b.imageUrl);

            if (existingBillsWithImages.length >= 100) {
                // Ordenar por fecha (createdAt) ascendente (más viejas primero)
                existingBillsWithImages.sort((a, b) => {
                    const timeA = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
                    const timeB = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
                    return timeA - timeB;
                });

                const oldestBill = existingBillsWithImages[0];

                // 1. Borrar de Cloudinary
                if (typeof window.deleteCloudinaryImage === 'function') {
                    await window.deleteCloudinaryImage(oldestBill.imageUrl);
                }

                // 2. Borrar referencia en Firestore
                await getBillsCollectionRef().doc(oldestBill.id).update({ imageUrl: "" });
            }
        }

        await getBillsCollectionRef().add(billData);
        finishSave(form, submitButton, originalButtonText);

    } catch (error) {
        console.error("Error al guardar:", error);
        alert(error.message || "Error al guardar el presupuesto.");
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonText;
    }
};

function finishSave(form, submitButton, originalButtonText) {
    form.reset();
    window.clearImage();
    submitButton.disabled = false;
    submitButton.innerHTML = originalButtonText;

    const newBillCard = document.getElementById('new-bill-card');
    const listContainer = document.getElementById('bills-list-container');
    const fab = document.getElementById('show-bill-form-fab');
    const fabIcon = fab.querySelector('i');

    newBillCard.classList.add('hidden');
    listContainer.classList.remove('hidden');

    fab.classList.remove('rotate-45');
    if (fabIcon) fabIcon.classList.replace('ph-x', 'ph-plus');
}

// ====================================================================
// CRUD - ELIMINAR Y ACTUALIZAR ESTADO
// ====================================================================

async function deleteBill(id) {
    if (!confirm('¿Estás seguro de que quieres eliminar este presupuesto?')) return;

    try {
        await getBillsCollectionRef().doc(id).delete();
    } catch (error) {
        console.error("Error al eliminar:", error);
        alert("Error al eliminar el presupuesto.");
    }
}

async function toggleBillStatus(id, newStatus) {
    try {
        await getBillsCollectionRef().doc(id).update({
            status: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error("Error al actualizar estado:", error);
        alert("Error al actualizar el estado.");
    }
}

// ====================================================================
// RENDERIZADO Y UI
// ====================================================================

function renderBills(bills, updateCache = true) {
    const container = document.getElementById('bills-list');
    const emptyState = document.getElementById('empty-state');

    if (updateCache) window.currentBillsData = bills;

    if (!bills || bills.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    // Ordenar por fecha de creación (más reciente primero)
    const sortedBills = [...bills].sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
        return dateB - dateA;
    });

    container.innerHTML = sortedBills.map(bill => {
        const statusClass = bill.status === 'Pagado' ? 'paid' : 'pending';
        const statusText = bill.status === 'Pagado' ? 'Pagado' : 'Pendiente';

        const imageButton = bill.imageUrl ?
            `<button class="action-btn" data-action="view-image" data-id="${bill.id}" data-url="${bill.imageUrl}" data-concept="${bill.concept}" title="Ver Imagen">
                <i class="ph ph-image"></i>
            </button>` : '';

        return `
            <div class="bill-card" data-id="${bill.id}">
                <div class="bill-header">
                    <div class="bill-info">
                        <h3 class="bill-card-title">${bill.concept}</h3>
                        <p class="bill-details">
                            <i class="ph ph-calendar-blank mr-1"></i>
                            ${bill.month}
                        </p>
                        <p class="bill-amount">
                            <i class="ph ph-currency-eur mr-1"></i>
                            ${parseFloat(bill.cost).toFixed(2)} €
                        </p>
                    </div>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>

                ${bill.notes ? `
                    <div class="mb-3">
                        <p class="bill-card-content line-clamp-2">
                            <i class="ph ph-note mr-1"></i>
                            ${bill.notes}
                        </p>
                    </div>
                ` : ''}

                <div class="bill-actions">
                    ${imageButton ? imageButton.replace('class="action-btn"', 'class="bill-action-btn view-image"') : ''}
                    <button class="bill-action-btn toggle ${bill.status === 'Pagado' ? 'completed' : 'pending'}" 
                            data-action="toggle-status" data-id="${bill.id}" data-status="${bill.status}" 
                            title="${bill.status === 'Pagado' ? 'Marcar como Pendiente' : 'Marcar como Pagado'}">
                        <i class="ph ${bill.status === 'Pagado' ? 'ph-x-circle' : 'ph-check-circle'} text-lg"></i>
                    </button>
                    <button class="bill-action-btn delete" data-action="delete" data-id="${bill.id}" title="Eliminar">
                        <i class="ph ph-trash text-lg"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    setTimeout(updateCardBorderOpacity, 50);
}

/**
 * Actualiza la opacidad del borde superior de las tarjetas (Efecto Visual).
 */
/**
 * Actualiza la opacidad del borde superior de las tarjetas (Efecto Visual).
 */
function updateCardBorderOpacity() {
    // 1. Contenedores (Border TOP static now, logic removed)

    // 2. Tarjetas de Facturas (Border TOP por posición en pantalla)
    const elements = document.querySelectorAll('.bill-card');
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
    const button = e.target.closest('[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    if (action === 'delete') {
        deleteBill(id);
    } else if (action === 'toggle-status') {
        const currentStatus = button.dataset.status;
        const newStatus = currentStatus === 'Pagado' ? 'Pendiente' : 'Pagado';
        toggleBillStatus(id, newStatus);
    } else if (action === 'view-image') {
        const imageUrl = button.dataset.url;
        const concept = button.dataset.concept;
        window.openImageModal(imageUrl, concept);
    }
}

window.toggleSearch = function () {
    const searchContainer = document.getElementById('search-container');
    const searchInput = document.getElementById('search-input');

    searchContainer.classList.toggle('hidden');

    if (!searchContainer.classList.contains('hidden')) {
        searchInput.focus();
    } else {
        searchInput.value = '';
        renderBills(window.currentBillsData, false);
    }
};

window.toggleNewBillForm = function () {
    const newBillCard = document.getElementById('new-bill-card');
    const listContainer = document.getElementById('bills-list-container');
    const fab = document.getElementById('show-bill-form-fab');
    const isHidden = newBillCard.classList.contains('hidden');
    const fabIcon = fab.querySelector('i');

    if (isHidden) {
        newBillCard.classList.remove('hidden');
        listContainer.classList.add('hidden'); // Hide list

        fab.classList.add('rotate-45');
        // Optional: Change icon class if you want exactly like Repairs, but rotation is usually enough.
        // If we want exact match: 
        if (fabIcon) fabIcon.classList.replace('ph-plus', 'ph-x');

        window.clearImage();
        document.getElementById('new-bill-form').reset();

        // Establecer fecha actual por defecto
        const dateInput = document.getElementById('date');
        if (dateInput) {
            const today = new Date().toISOString().split('T')[0];
            dateInput.value = today;
        }

        // No scroll needed as it replaces the view
    } else {
        newBillCard.classList.add('hidden');
        listContainer.classList.remove('hidden'); // Show list

        fab.classList.remove('rotate-45');
        if (fabIcon) fabIcon.classList.replace('ph-x', 'ph-plus');
    }
};

window.cancelEdit = function () {
    window.toggleNewBillForm();
};

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

    // Event Listeners
    const billsList = document.getElementById('bills-list');
    if (billsList) billsList.addEventListener('click', handleBillActions);

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (!query) {
                renderBills(window.currentBillsData, false);
                return;
            }

            const filtered = window.currentBillsData.filter(bill =>
                bill.concept.toLowerCase().includes(query) ||
                bill.month.toLowerCase().includes(query) ||
                bill.notes?.toLowerCase().includes(query)
            );

            renderBills(filtered, false);
        });
    }

    // Efectos visuales
    const scrollContainer = document.getElementById('app-content');
    if (scrollContainer) scrollContainer.addEventListener('scroll', updateCardBorderOpacity);

    setTimeout(updateCardBorderOpacity, 100);
    window.addEventListener('resize', updateCardBorderOpacity);
});
// ================================================================
// BORDE ANIMADO EN SCROLL
// ================================================================
// Fin del archivo

