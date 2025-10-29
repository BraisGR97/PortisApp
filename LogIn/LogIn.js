// LogIn.js

// --- Funciones de Utilidad ---

// Función para mostrar mensajes de estado
function showMessage(message, isError = true) {
    const msgBox = document.getElementById('messageBox');
    if (!msgBox) return;

    msgBox.textContent = message;
    msgBox.classList.remove('hidden', 'error', 'success');
    
    if (message !== "Comprobando credenciales...") {
        setTimeout(() => {
            msgBox.classList.add('hidden');
        }, 5000);
    }

    if (isError) {
        msgBox.classList.add('error');
    } else {
        msgBox.classList.add('success');
    }
}

// Crea un usuario de prueba si no existe
async function setupTestUser() {
    // Verificar si Firebase está cargado
    if (!window.db || !window.collection) {
        console.warn("Firebase no está completamente cargado. Reintentando...");
        setTimeout(setupTestUser, 500); // Reintentar si no está listo
        return;
    }
    
    const db = window.db;
    const collection = window.collection;
    const query = window.query;
    const where = window.where;
    const getDocs = window.getDocs;
    const doc = window.doc;
    const setDoc = window.setDoc;
    
    const TEST_USERNAME = "prueba";
    const TEST_PASSWORD = "123";

    // En un entorno real, la ruta sería 'users'. Aquí la mantendremos simple.
    const usersCollectionRef = collection(db, 'users');
    
    try {
        const q = query(usersCollectionRef, where('username', '==', TEST_USERNAME));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            // ID automática al no pasar un segundo argumento a doc() y usar setDoc()
            const newUserDocRef = doc(usersCollectionRef); 
            await setDoc(newUserDocRef, {
                username: TEST_USERNAME,
                password: TEST_PASSWORD, // Texto plano según tu solicitud
                role: 'test_user'
            });
            console.log(`[SETUP]: Usuario de prueba ('${TEST_USERNAME}' / '123') creado en Firestore.`);
        }
    } catch (error) {
        console.warn("Advertencia: No se pudo crear el usuario de prueba. Asegura que las reglas de Firestore son 'allow read, write'.", error);
    }
}


// Función principal de Login al pulsar 'Entrar'
async function handleLogin() {
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('loginBtn');

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (username === "" || password === "") {
        showMessage("Por favor, introduce usuario y contraseña.", true);
        return;
    }
    
    showMessage("Comprobando credenciales...", false);
    loginBtn.disabled = true;

    // Verificar si Firebase está cargado
    if (!window.db) {
        showMessage("Esperando conexión con Firebase...", true);
        loginBtn.disabled = false;
        return;
    }

    const db = window.db;
    const collection = window.collection;
    const query = window.query;
    const where = window.where;
    const getDocs = window.getDocs;
    
    // Asumimos que la colección se llama 'users'
    const usersCollectionRef = collection(db, 'users');

    try {
        // Consulta Firestore: Busca un documento donde username Y password coincidan
        const q = query(
            usersCollectionRef, 
            where('username', '==', username),
            where('password', '==', password)
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            // Credenciales inválidas
            showMessage("Usuario o contraseña incorrectos.", true);
        } else {
            // Login exitoso
            showMessage("Inicio de sesión exitoso. Redirigiendo...", false);
            
            // Redirige a la página principal
            setTimeout(() => {
                // Desde LogIn/ debe ir a ../Main/Main.html
                window.location.href = '../Main/Main.html';
            }, 1000); 
        }

    } catch (error) {
        console.error("Error al buscar en Firestore:", error);
        showMessage(`Error al conectar con la base de datos: ${error.message}`, true);
    } finally {
        if (!document.querySelector('.message-box.success')) {
            loginBtn.disabled = false;
        }
    }
}

// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', function() {
    const loginBtn = document.getElementById('loginBtn');
    const registerLink = document.getElementById('registerLink');

    // Inicializar el usuario de prueba
    setupTestUser();

    // 1. Botón 'Entrar'
    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
    }

    // 2. Enlace 'aquí' (Registro)
    if (registerLink) {
        registerLink.addEventListener('click', function(event) {
            event.preventDefault(); 
            // Desde LogIn/ debe ir a ../SigIn/SignIn.html
            window.location.href = '../SignIn/SignIn.html'; 
        });
    }
});