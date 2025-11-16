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

// --- INICIALIZACIÓN ---

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
                displayElement.textContent = userDisplayName || `ID: ${userId.substring(0, 8)}...`;
                isAuthReady = true;
            } else {
                userId = crypto.randomUUID(); 
                displayElement.textContent = `ID Anónimo`;
                isAuthReady = true;
            }
        });
        
        // Cargar el tema al inicio
        loadThemeSetting();
        
    } catch (error) {
        console.error("Error al inicializar Firebase o al autenticar:", error);
    }
}

// --- GESTIÓN DEL TEMA (Modo Oscuro/Claro) ---

/**
 * Carga la configuración del tema guardada o usa el modo oscuro por defecto.
 */
function loadThemeSetting() {
    // Usamos localStorage para persistir el tema
    const theme = localStorage.getItem('portis-theme') || 'dark';
    const body = document.body;
    const toggle = document.getElementById('dark-mode-toggle');
    const icon = document.getElementById('theme-icon');

    if (theme === 'light') {
        body.classList.add('light-mode');
        body.classList.remove('dark-mode');
        toggle.checked = false;
        icon.className = 'ph ph-sun-fill text-2xl';
    } else {
        body.classList.remove('light-mode');
        body.classList.add('dark-mode');
        toggle.checked = true;
        icon.className = 'ph ph-moon-fill text-2xl';
    }
}

/**
 * Cambia el tema cuando se acciona el toggle.
 */
function toggleTheme() {
    const body = document.body;
    const isDarkMode = body.classList.toggle('light-mode'); // toggle devuelve si contiene 'light-mode'
    const icon = document.getElementById('theme-icon');

    if (isDarkMode) {
        localStorage.setItem('portis-theme', 'light');
        icon.className = 'ph ph-sun-fill text-2xl';
    } else {
        localStorage.setItem('portis-theme', 'dark');
        icon.className = 'ph ph-moon-fill text-2xl';
    }
    // Forzamos la actualización del CSS
    loadThemeSetting(); 
}

// --- GESTIÓN DE ELIMINACIÓN DE CUENTA ---

function showDeleteModal() {
    document.getElementById('delete-confirm-modal').classList.remove('hidden');
    document.getElementById('confirm-input').value = '';
    document.getElementById('confirm-delete-btn').disabled = true;
    document.getElementById('confirm-delete-btn').classList.add('opacity-50');
}

function hideDeleteModal() {
    document.getElementById('delete-confirm-modal').classList.add('hidden');
}

function checkConfirmationInput(e) {
    const input = e.target.value.trim();
    const button = document.getElementById('confirm-delete-btn');
    const isConfirmed = input === 'ELIMINAR MI CUENTA';

    button.disabled = !isConfirmed;
    button.classList.toggle('opacity-50', !isConfirmed);
}

/**
 * Borra todos los datos del usuario de las colecciones y luego borra la cuenta.
 */
async function deleteAccountAndData() {
    // AÑADIR ESTA COMPROBACIÓN AQUÍ
    if (IS_MOCK_MODE) {
        alert("Modo Mock: Simulación de borrado de cuenta exitosa. Redirigiendo...");
        sessionStorage.removeItem('portis-user-display-name');
        window.location.href = '../Login/Login.html';
        return;
    }
    if (!isAuthReady || !userId) return console.error("Usuario no autenticado para eliminar.");

    const user = auth.currentUser;
    if (!user) return console.error("No hay usuario logueado.");

    try {
        console.log(`Iniciando eliminación de datos para el usuario: ${userId}`);

        // 1. Eliminar documentos de la colección 'repairs'
        const repairsRef = db.collection(`artifacts/${appId}/users/${userId}/repairs`);
        const repairsSnapshot = await repairsRef.get();
        
        const repairsDeletePromises = [];
        repairsSnapshot.forEach(doc => {
            repairsDeletePromises.push(doc.ref.delete());
        });
        await Promise.all(repairsDeletePromises);
        console.log(`Eliminados ${repairsDeletePromises.length} mantenimientos.`);

        // 2. Eliminar documentos de la colección 'bills'
        const billsRef = db.collection(`artifacts/${appId}/users/${userId}/bills`);
        const billsSnapshot = await billsRef.get();
        
        const billsDeletePromises = [];
        billsSnapshot.forEach(doc => {
            billsDeletePromises.push(doc.ref.delete());
        });
        await Promise.all(billsDeletePromises);
        console.log(`Eliminados ${billsDeletePromises.length} presupuestos.`);
        
        // 3. (OPCIONAL) Borrar la carpeta del usuario (metadata)
        // Esto es complejo en Firestore, pero se puede simular borrando un documento de referencia si existiera.
        
        // 4. Eliminar la cuenta del usuario de Authentication
        await user.delete(); 
        
        // 5. Limpiar sesión y redirigir
        sessionStorage.removeItem('portis-user-display-name');
        alert("¡Cuenta eliminada con éxito! Redirigiendo al Login.");
        window.location.href = '../Login/Login.html'; 

    } catch (error) {
        console.error("Error al eliminar la cuenta o datos:", error);
        // Firebase Auth puede fallar si la sesión ha expirado (user.delete() necesita reautenticación).
        if (error.code === 'auth/requires-recent-login') {
            alert("La sesión ha expirado. Por favor, vuelve a iniciar sesión para eliminar tu cuenta.");
            // Redirigir al login
            window.location.href = '../Login/Login.html';
        } else {
            alert(`Error al intentar eliminar la cuenta: ${error.message}`);
        }
    }
}


// --- EJECUCIÓN E LISTENERS ---

window.addEventListener('load', () => {
    initializeAppAndAuth();
    
    // Listener para el toggle de Modo Oscuro
    document.getElementById('dark-mode-toggle').addEventListener('change', toggleTheme);
    
    // Listeners del Modal de Eliminación
    document.getElementById('delete-account-btn').addEventListener('click', showDeleteModal);
    document.getElementById('cancel-delete-btn').addEventListener('click', hideDeleteModal);
    
    // Listener para validar el input de confirmación
    document.getElementById('confirm-input').addEventListener('input', checkConfirmationInput);

    // Listener para confirmar la eliminación
    document.getElementById('confirm-delete-btn').addEventListener('click', () => {
        // Ejecutar eliminación solo si el botón no está deshabilitado
        if (!document.getElementById('confirm-delete-btn').disabled) {
            deleteAccountAndData();
        }
    });
    
    // Placeholder para Idioma
    document.getElementById('language-select').addEventListener('change', (e) => {
        if (e.target.value !== 'es') {
            alert("Actualmente solo se soporta el idioma Español.");
            e.target.value = 'es';
        }
    });
});