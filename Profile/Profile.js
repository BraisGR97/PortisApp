/**
 * ====================================================================
 * Profile.js - Lógica de la página de Perfil y configuración
 * ====================================================================
 */

// Las variables globales (firebaseConfig, IS_MOCK_MODE) están disponibles directamente en 'window'.

const appId = window.firebaseConfig ? window.firebaseConfig.projectId : 'mock-app-id';
const initialAuthToken = null;

let app;
let db;
let auth;

// Obtener el UID y el nombre de la sesión
let userId = sessionStorage.getItem('portis-user-identifier') || null;
let userDisplayName = sessionStorage.getItem('portis-user-display-name') || null;

let isAuthReady = false;
let initialUsername = ''; // Para detectar si el nombre de usuario ha cambiado
let userEmail = ''; // Para el modal de restablecimiento de contraseña

// --- FUNCIÓN DE INICIALIZACIÓN PRINCIPAL ---

/**
 * Inicializa Firebase, autentica al usuario y establece el listener de estado.
 */
async function initializeAppAndAuth() {
    const displayElement = document.getElementById('current-user-display');

    // 1. Verificar la sesión local (Redirigir si no hay sesión válida)
    if (!userId || !userDisplayName) {
        console.warn("Sesión no válida o caducada. Redirigiendo a Index.");
        // RUTA CORRECTA: '../index.html'
        window.location.href = '../index.html';
        return;
    }

    // Rellenar la UI con el nombre de sesión inmediatamente
    if (displayElement) {
        displayElement.textContent = userDisplayName;
    }

    // 2. Manejo del Mock Mode
    if (window.IS_MOCK_MODE) { // Usa window.IS_MOCK_MODE
        console.warn("Modo MOCK activado. Funcionalidad de Auth deshabilitada.");
        isAuthReady = true;
        // Simular datos de usuario en modo mock
        displayUserData({
            displayName: userDisplayName,
            email: 'mock@example.com',
            isAnonymous: false,
            metadata: { creationTime: new Date().toISOString() }
        });
        loadAndCalculateStats(true); // Llamar a stats en modo mock
        return;
    }

    // 3. Inicialización de Firebase
    try {
        if (!window.firebaseConfig || !window.firebaseConfig.apiKey) { // Usa window.firebaseConfig
            throw new Error("La configuración de Firebase está incompleta.");
        }

        app = firebase.initializeApp(window.firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();

        // Observador de estado de autenticación
        auth.onAuthStateChanged((user) => {
            if (user && user.uid === userId) {
                // Caso 1: Usuario autenticado y coincide con la sesión
                userId = user.uid;
                isAuthReady = true;
                displayUserData(user);
                loadAndCalculateStats();
            } else {
                // Caso 2: El usuario no coincide o ha cerrado sesión
                console.warn("Sesión de Firebase no válida o caducada. Redirigiendo.");
                window.location.href = '../index.html';
            }
        });

    } catch (error) {
        console.error("Error al inicializar Firebase o al autenticar:", error);
        alert("Error crítico al cargar el módulo de perfil. Verifique la consola.");
        displayElement.textContent = `Error de Conexión`;
        loadAndCalculateStats(true);
    }
}

/**
 * Muestra los datos editables e ineditables del usuario.
 */
function displayUserData(user) {
    const usernameInput = document.getElementById('username');
    const registrationDateElement = document.getElementById('stat-registration-date');

    // 1. Manejo del Username
    const currentUsername = user.displayName || userDisplayName || 'Admin';
    usernameInput.value = currentUsername;
    initialUsername = currentUsername;

    // 2. Manejo del Email (para el modal)
    userEmail = user.email || (user.isAnonymous ? 'Cuenta Anónima' : 'Correo no disponible');
    document.getElementById('password').placeholder = user.email || 'Click para restablecer';

    // 3. Listener para mostrar el botón de guardar
    usernameInput.removeEventListener('input', toggleSaveButton);
    usernameInput.addEventListener('input', toggleSaveButton);

    // 4. Fecha de Registro
    if (user.metadata && user.metadata.creationTime) {
        const creationDate = new Date(user.metadata.creationTime);
        const formattedDate = creationDate.toLocaleDateString('es-ES', {
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
        registrationDateElement.textContent = formattedDate;
    } else {
        registrationDateElement.textContent = '01/01/2024 (Mock)';
    }
}

// --- GESTIÓN DE INTERFAZ Y DATOS ---

/**
 * Muestra/Oculta el botón de guardar cambios si el username ha cambiado.
 */
function toggleSaveButton() {
    const usernameInput = document.getElementById('username');
    const saveButton = document.getElementById('save-changes-btn');

    const isModified = usernameInput.value.trim() !== initialUsername;

    if (isModified) {
        saveButton.removeAttribute('hidden');
    } else {
        saveButton.setAttribute('hidden', true);
    }
}

/**
 * Maneja la edición del perfil (sólo nombre de usuario) y guarda en Firestore/Auth.
 */
async function handleProfileEdit() {
    const usernameInput = document.getElementById('username');
    const newUsername = usernameInput.value.trim();
    const saveButton = document.getElementById('save-changes-btn');

    if (newUsername === initialUsername) return;
    if (!newUsername) {
        alert('El nombre de usuario no puede estar vacío.');
        return;
    }

    if (window.IS_MOCK_MODE) {
        alert(`Modo Mock: Nombre de usuario actualizado localmente a ${newUsername}. No persistido.`);
        initialUsername = newUsername;
        sessionStorage.setItem('portis-user-display-name', newUsername);
        window.location.reload();
        return;
    }

    saveButton.innerHTML = '<i class="ph ph-circle-notch animate-spin mr-2"></i> Guardando...';
    saveButton.disabled = true;

    try {
        const user = auth.currentUser;
        if (!user || user.isAnonymous) {
            throw new Error("La edición de perfil requiere una cuenta autenticada (no anónima).");
        }

        // 1. Actualizar el displayName en Firebase Auth
        await user.updateProfile({ displayName: newUsername });

        // 2. Actualizar el nombre en Firestore 
        const userDocRef = db.doc(`artifacts/${appId}/users/${userId}/profileData/userMetadata`);
        await userDocRef.set({
            displayName: newUsername,
            lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // 3. Actualizar estado local y UI
        initialUsername = newUsername;
        sessionStorage.setItem('portis-user-display-name', newUsername);

        alert(`Perfil actualizado con éxito. Nuevo nombre: ${newUsername}`);

        // Recargar para reflejar el cambio en el navbar inmediatamente
        window.location.reload();

    } catch (error) {
        console.error("Error al guardar cambios:", error);
        alert(`Error al guardar cambios: ${error.message}`);
    } finally {
        saveButton.innerHTML = '<i class="ph ph-floppy-disk-fill mr-2"></i> Guardar Cambios';
        saveButton.disabled = false;
        toggleSaveButton(); // Ocultar después de guardar
    }
}


// --- LÓGICA DEL MODAL DE CONTRASEÑA ---

/**
 * Abre el modal de cambio de contraseña.
 */
function openPasswordModal() {
    if (window.IS_MOCK_MODE) {
        alert('Funcionalidad de restablecimiento de contraseña deshabilitada en Modo Mock.');
        return;
    }

    const user = auth.currentUser;

    if (!user) {
        alert('Autenticación no inicializada.');
        return;
    }

    if (user.isAnonymous) {
        alert('Las cuentas anónimas no tienen un correo electrónico asociado para restablecer la contraseña.');
        return;
    }

    const email = user.email;
    if (!email) {
        alert('No se encontró un correo electrónico válido asociado a tu cuenta.');
        return;
    }

    document.getElementById('reset-email-display').textContent = email;
    document.getElementById('modal-message').setAttribute('hidden', true);

    // Mostrar el modal con transición
    document.getElementById('password-modal').classList.remove('hidden');
    const modalContent = document.querySelector('#password-modal > div');
    setTimeout(() => modalContent.classList.remove('scale-95'), 10);
}

/**
 * Cierra el modal de cambio de contraseña.
 */
function closePasswordModal() {
    const modalContent = document.querySelector('#password-modal > div');
    modalContent.classList.add('scale-95');
    setTimeout(() => document.getElementById('password-modal').classList.add('hidden'), 300);
}

/**
 * Envía el correo electrónico de restablecimiento de contraseña.
 */
async function sendPasswordReset() {
    if (window.IS_MOCK_MODE) return;

    const modalMessage = document.getElementById('modal-message');
    modalMessage.textContent = 'Enviando...';
    modalMessage.className = 'p-3 mb-4 rounded-lg text-sm font-medium text-center bg-blue-900 text-white';
    modalMessage.removeAttribute('hidden');

    const email = auth.currentUser?.email;

    if (!email) {
        modalMessage.textContent = 'Error: No se encontró un correo electrónico para enviar el restablecimiento.';
        modalMessage.className = 'p-3 mb-4 rounded-lg text-sm font-medium text-center bg-red-800 text-white';
        return;
    }

    try {
        await auth.sendPasswordResetEmail(email);
        modalMessage.textContent = `Correo de restablecimiento enviado a ${email}. Revisa tu bandeja de entrada.`;
        modalMessage.className = 'p-3 mb-4 rounded-lg text-sm font-medium text-center bg-green-700 text-white';

        setTimeout(closePasswordModal, 4000);
    } catch (error) {
        console.error("Error al enviar el correo de restablecimiento:", error);
        modalMessage.textContent = `Error al enviar el correo: ${error.message}`;
        modalMessage.className = 'p-3 mb-4 rounded-lg text-sm font-medium text-center bg-red-800 text-white';
    }
}

// --- GESTIÓN DE ESTADÍSTICAS ---

async function loadAndCalculateStats(isMock = false) {
    if (!isAuthReady || !userId) return console.warn("Autenticación no lista para cargar stats.");

    if (isMock) {
        // Simular datos en modo mock
        document.getElementById('stat-repairs-count').textContent = 12;
        document.getElementById('stat-total-records').textContent = 18;
        document.getElementById('stat-total-cost').textContent = `450.00 €`;
        return;
    }

    try {
        // Rutas de Firestore basadas en el appId y userId
        const repairsRef = db.collection(`artifacts/${appId}/users/${userId}/repairs`);
        const billsRef = db.collection(`artifacts/${appId}/users/${userId}/bills`);

        const repairsSnapshot = await repairsRef.get();
        const repairsCount = repairsSnapshot.size;

        const billsSnapshot = await billsRef.get();
        const billsCount = billsSnapshot.size;

        let totalCost = 0;
        billsSnapshot.forEach(doc => {
            const bill = doc.data();
            const cost = parseFloat(bill.cost || 0);
            if (!isNaN(cost)) {
                totalCost += cost;
            }
        });

        // Renderizar las estadísticas
        document.getElementById('stat-repairs-count').textContent = repairsCount;
        document.getElementById('stat-total-records').textContent = repairsCount + billsCount;
        document.getElementById('stat-total-cost').textContent = `${totalCost.toFixed(2)} €`;

    } catch (error) {
        console.error("Error al cargar y calcular estadísticas:", error);
        document.getElementById('stat-total-cost').textContent = `Error`;
    }
}


// --- Ejecución ---
window.addEventListener('load', () => {
    // Aplicar el tema (Arreglo de CSS)
    if (typeof window.applyColorMode === 'function') {
        window.applyColorMode();
    }

    initializeAppAndAuth();

    // Listener para el botón de edición
    const saveBtn = document.getElementById('save-changes-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', handleProfileEdit);
    }

    // Hacer que las funciones del modal sean globales para el onclick del HTML
    window.openPasswordModal = openPasswordModal;
    window.closePasswordModal = closePasswordModal;
    window.sendPasswordReset = sendPasswordReset;
});
