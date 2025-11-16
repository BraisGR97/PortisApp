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

// --- FUNCIONES DE FIREBASE ---

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
                displayUserData(user); // Mostrar datos del usuario
                loadAndCalculateStats(); // Cargar estadísticas
            } else {
                userId = crypto.randomUUID(); 
                displayElement.textContent = `ID Anónimo`;
                isAuthReady = true;
                loadAndCalculateStats(); // Cargar estadísticas (usando ID anónimo si falla auth)
            }
        });
        
    } catch (error) {
        console.error("Error al inicializar Firebase o al autenticar:", error);
    }
}

/**
 * Muestra los datos editables e ineditables del usuario (mockeados).
 */
function displayUserData(user) {
    // Datos editables (Mostramos valores placeholder o mockeados)
    const usernameInput = document.getElementById('username');
    const registrationDateElement = document.getElementById('stat-registration-date');
    
    // Si tenemos un nombre de usuario mockeado en sessionStorage, lo usamos
    const mockUsername = sessionStorage.getItem('portis-user-display-name') || 'Admin';
    usernameInput.value = mockUsername;
    
    // Fecha de Registro (Usamos la fecha de creación de la cuenta Firebase, si existe)
    if (user.metadata && user.metadata.creationTime) {
        const creationDate = new Date(user.metadata.creationTime);
        const formattedDate = creationDate.toLocaleDateString('es-ES', { 
            year: 'numeric', month: '2-digit', day: '2-digit' 
        });
        registrationDateElement.textContent = formattedDate;
    } else {
        // Mockeamos una fecha de registro si estamos en modo anónimo total
        registrationDateElement.textContent = '01/01/2024 (Mock)';
    }
}

// --- GESTIÓN DE ESTADÍSTICAS ---

async function loadAndCalculateStats() {
    if (!isAuthReady || !userId) return console.warn("Autenticación no lista para cargar stats.");

    try {
        const repairsRef = db.collection(`artifacts/${appId}/users/${userId}/repairs`);
        const billsRef = db.collection(`artifacts/${appId}/users/${userId}/bills`);

        // 1. Obtener datos de Mantenimientos
        const repairsSnapshot = await repairsRef.get();
        const repairsCount = repairsSnapshot.size;
        
        // 2. Obtener datos de Presupuestos (Gastos)
        const billsSnapshot = await billsRef.get();
        const billsCount = billsSnapshot.size;
        
        let totalCost = 0;
        billsSnapshot.forEach(doc => {
            const bill = doc.data();
            // Aseguramos que el coste sea un número para la suma
            const cost = parseFloat(bill.cost);
            if (!isNaN(cost)) {
                totalCost += cost;
            }
        });

        // 3. Renderizar las estadísticas
        document.getElementById('stat-repairs-count').textContent = repairsCount;
        document.getElementById('stat-total-records').textContent = repairsCount + billsCount;
        document.getElementById('stat-total-cost').textContent = `${totalCost.toFixed(2)} €`;

    } catch (error) {
        console.error("Error al cargar y calcular estadísticas:", error);
        document.getElementById('stat-total-cost').textContent = `Error`;
    }
}

// --- MANEJO DE FORMULARIO DE EDICIÓN (Placeholder) ---

function handleProfileEdit(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    // const password = document.getElementById('password').value; // No se maneja en el mock
    
    console.log(`Intentando guardar cambios para Username: ${username}`);
    
    // Lógica de edición de perfil (PENDIENTE DE IMPLEMENTAR)
    // 1. Validar campos
    // 2. Actualizar sessionStorage para el nombre de usuario mockeado
    sessionStorage.setItem('portis-user-display-name', username);
    
    // 3. Mostrar un mensaje de éxito
    alert(`Perfil (Nombre: ${username}) actualizado. (La lógica de contraseña es pendiente).`);
    window.location.reload(); // Recargar para actualizar el navbar
}

// --- Ejecución ---
window.addEventListener('load', () => {
    initializeAppAndAuth();
    
    // Listener para el formulario de edición
    document.getElementById('profile-edit-form').addEventListener('submit', handleProfileEdit);
});