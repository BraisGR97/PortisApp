// =======================
// 1. CONFIGURACIÓN DE FIREBASE
// =======================
// ¡¡¡PEGA AQUÍ TU OBJETO firebaseConfig de la consola de Firebase!!!
const firebaseConfig = {
    apiKey: "AIzaSyD_tC3KaK3UVyNOPiSsnI0s5k8Cd_qFJpg",
    authDomain: "portisapp.firebaseapp.com",
    projectId: "portisapp",
    storageBucket: "portisapp.firebasestorage.app",
    messagingSenderId: "38313359657",
    appId: "1:38313359657:web:ae73a0f8f7556bed92df38"
};

// =======================
// 2. INICIALIZACIÓN DE SERVICIOS
// =======================
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const reparacionesRef = db.collection('reparaciones');

// =======================
// 3. REFERENCIAS DEL DOM
// =======================
// Páginas
const loginPage = document.getElementById('login-page');
const mainMenuPage = document.getElementById('main-menu-page');
const reparacionesPage = document.getElementById('reparaciones-page');
const pages = [loginPage, mainMenuPage, reparacionesPage];

// Login (Fase 1)
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');

// Menú (Fase 2)
const menuReparacionesBtn = document.getElementById('menu-reparaciones-btn');
const menuRegistrosBtn = document.getElementById('menu-registros-btn');
const menuLogoutBtn = document.getElementById('menu-logout-btn');

// Reparaciones (Fase 3)
const reparacionesVolverBtn = document.getElementById('reparaciones-volver-btn');
const reparacionesAddBtn = document.getElementById('reparaciones-add-btn');
const listaReparacionesContainer = document.getElementById('lista-reparaciones-container');

// Modal (Fase 3)
const modal = document.getElementById('modal-reparaciones');
const modalUbicacion = document.getElementById('modal-ubicacion');
const modalModelo = document.getElementById('modal-modelo');
const modalFecha = document.getElementById('modal-fecha');
const modalContrato = document.getElementById('modal-contrato');
const modalProblemas = document.getElementById('modal-problemas'); // (Fase 4)
const modalAgregarBtn = document.getElementById('modal-agregar-btn');
const modalCerrarBtn = document.getElementById('modal-cerrar-btn');


// =======================
// 4. FUNCIÓN AUXILIAR DE NAVEGACIÓN
// =======================
function mostrarPagina(idPagina) {
    pages.forEach(page => {
        if (page.id === idPagina) {
            page.classList.add('active');
        } else {
            page.classList.remove('active');
        }
    });
}

// =======================
// 5. LÓGICA DE AUTENTICACIÓN (Fase 1)
// =======================

// Listener de estado de Auth: Mueve al usuario entre login y menú
auth.onAuthStateChanged(user => {
    if (user) {
        // Usuario está logueado
        mostrarPagina('main-menu-page'); // Inicia en el menú
        // Cargar datos de reparaciones solo cuando está logueado
        escucharReparaciones(); 
    } else {
        // Usuario no está logueado
        mostrarPagina('login-page');
        emailInput.value = '';
        passwordInput.value = '';
    }
});

// Botón de Login
loginBtn.addEventListener('click', () => {
    const email = emailInput.value;
    const password = passwordInput.value;

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Éxito. El 'onAuthStateChanged' se encargará de mover la página.
            loginError.textContent = '';
        })
        .catch((error) => {
            console.error("Error de login:", error.message);
            loginError.textContent = 'Error: Usuario o contraseña incorrectos.';
        });
});

// Botón de Logout (Fase 2)
menuLogoutBtn.addEventListener('click', () => {
    auth.signOut();
});

// =======================
// 6. LÓGICA DE NAVEGACIÓN (Fase 2 y 3)
// =======================

menuReparacionesBtn.addEventListener('click', () => {
    mostrarPagina('reparaciones-page');
});

menuRegistrosBtn.addEventListener('click', () => {
    // Aún no implementado
    alert('La sección "Registros" aún no está disponible.');
});

reparacionesVolverBtn.addEventListener('click', () => {
    mostrarPagina('main-menu-page');
});

// =======================
// 7. LÓGICA DEL MODAL (Fase 3)
// =======================

reparacionesAddBtn.addEventListener('click', () => {
    modal.classList.add('active');
});

modalCerrarBtn.addEventListener('click', () => {
    modal.classList.remove('active');
});

modalAgregarBtn.addEventListener('click', () => {
    // Recoger datos del modal
    const data = {
        ubicacion: modalUbicacion.value,
        modelo: modalModelo.value,
        contrato: modalContrato.value,
        problemas: modalProblemas.value, // (Fase 4)
        // Guardamos la fecha como Timestamp de Firestore para ordenar correctamente
        fecha: firebase.firestore.Timestamp.fromDate(new Date(modalFecha.value))
    };

    // Validar (simple)
    if (!data.ubicacion || !data.modelo || !modalFecha.value) {
        alert("Por favor, completa ubicación, modelo y fecha.");
        return;
    }

    // Añadir a Firestore
    reparacionesRef.add(data)
        .then(() => {
            // Limpiar formulario y cerrar modal
            modalUbicacion.value = '';
            modalModelo.value = '';
            modalFecha.value = '';
            modalContrato.value = 'Mensual';
            modalProblemas.value = '';
            modal.classList.remove('active');
        })
        .catch(error => {
            console.error("Error al añadir documento: ", error);
        });
});


// =======================
// 8. LÓGICA DE FIRESTORE Y ORDENAMIENTO (Fase 3 y 4)
// =======================

let unsubscribeReparaciones; // Variable para guardar el listener

// Función para escuchar cambios en tiempo real
function escucharReparaciones() {
    // Si ya hay un listener, lo cerramos para evitar duplicados
    if (unsubscribeReparaciones) {
        unsubscribeReparaciones();
    }

    // Creamos un nuevo listener (onSnapshot)
    unsubscribeReparaciones = reparacionesRef.onSnapshot(snapshot => {
        let reparaciones = [];
        snapshot.forEach(doc => {
            reparaciones.push({ id: doc.id, ...doc.data() });
        });

        // 4. SISTEMA DE ORDENAMIENTO
        const reparacionesOrdenadas = ordenarReparaciones(reparaciones);

        // 3. RENDERIZAR LA LISTA
        renderizarLista(reparacionesOrdenadas);
    }, error => {
        console.error("Error al escuchar reparaciones: ", error);
    });
}

// Función de Ordenamiento (Fase 4)
function ordenarReparaciones(lista) {
    return lista.sort((a, b) => {
        // Convertir Timestamps de Firestore a Objetos Date de JS
        const fechaA = a.fecha.toDate();
        const fechaB = b.fecha.toDate();

        // Comprobar si tienen problemas
        const aTieneProblemas = a.problemas && a.problemas.trim() !== '';
        const bTieneProblemas = b.problemas && b.problemas.trim() !== '';

        // Lógica de prioridad:
        if (aTieneProblemas && !bTieneProblemas) {
            return -1; // A (con problemas) va antes que B (sin problemas)
        }
        if (!aTieneProblemas && bTieneProblemas) {
            return 1; // B (con problemas) va antes que A (sin problemas)
        }

        // Si ambos tienen o ambos no tienen problemas, ordenar por fecha
        // (dateB - dateA) = Descendente (más nuevas primero)
        return fechaB - fechaA;
    });
}

// Función para "pintar" la lista en el HTML (Fase 3)
function renderizarLista(lista) {
    listaReparacionesContainer.innerHTML = ''; // Limpiar lista

    if (lista.length === 0) {
        listaReparacionesContainer.innerHTML = '<p>No hay reparaciones registradas.</p>';
        return;
    }

    lista.forEach(item => {
        // Convertir fecha para mostrarla
        const fechaFormateada = item.fecha.toDate().toLocaleDateString('es-ES');
        
        // (Fase 4) Añadir clase de prioridad si hay problemas
        const clasePrioridad = (item.problemas && item.problemas.trim() !== '') ? 'prioridad' : '';

        const itemHTML = `
            <div class="reparacion-item ${clasePrioridad}">
                <h3>${item.ubicacion} - ${item.modelo}</h3>
                <p><strong>Fecha:</strong> ${fechaFormateada}</p>
                <p><strong>Contrato:</strong> ${item.contrato}</p>
                <p><strong>Problemas:</strong> ${item.problemas || 'Ninguno'}</p>
            </div>
        `;
        listaReparacionesContainer.innerHTML += itemHTML;
    });
}