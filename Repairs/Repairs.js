// Repairs.js - LÓGICA FINAL (Colección Raíz /repairs + Filtro por localStorage.username)

// --- Utilidades del DOM ---

function showMessageBox(message, isError = true, targetElementId = 'listMessageBox') {
    const msgBox = document.getElementById(targetElementId);
    if (!msgBox) return;

    msgBox.textContent = message;
    msgBox.classList.remove('hidden', 'error', 'success');
    
    if (message !== "Cargando lista..." && message !== "Guardando...") {
        if (isError) {
            msgBox.classList.add('error');
        } else {
            msgBox.classList.add('success');
        }
        
        setTimeout(() => {
            msgBox.classList.add('hidden');
        }, 5000);
    }
}

function openModal() {
    document.getElementById('addModal').classList.remove('hidden');
    document.getElementById('addRepairForm').reset(); 
    document.getElementById('modalMessageBox').classList.add('hidden'); 
}

function closeModal() {
    document.getElementById('addModal').classList.add('hidden');
}

// --- Lógica de Firestore y Lista ---

/**
 * Renderiza la lista de reparaciones en el DOM.
 */
function renderRepairsList(repairs) {
    const listContainer = document.getElementById('repairsList');
    listContainer.innerHTML = ''; 
    
    if (!repairs || repairs.length === 0) {
        listContainer.innerHTML = '<p class="empty-list-message">Aún no hay reparaciones registradas. Pulsa "Añadir" para empezar.</p>';
        return;
    }

    repairs.forEach(repair => {
        const item = document.createElement('div');
        item.classList.add('list-item');
        
        // Asegurarse de que repair.fecha existe y tiene formato YYYY-MM
        const dateParts = repair.fecha ? repair.fecha.split('-') : [];
        const formattedDate = dateParts.length === 2 ? `${dateParts[1]}/${dateParts[0]}` : 'Fecha Desconocida';

        item.innerHTML = `
            <strong>Ubicación: ${repair.ubicacion}</strong>
            <p>Modelo: ${repair.modelo} | Llave: ${repair.llave}</p>
            <p>Contrato: ${repair.contrato} | Fecha: ${formattedDate}</p>
            <p>Avería: ${repair.averia}</p>
        `;
        listContainer.appendChild(item);
    });
}

/**
 * Obtiene las reparaciones del usuario actual desde la colección raíz /repairs,
 * filtrando por el campo 'username'.
 */
async function fetchRepairs() {
    // 1. OBTENER EL USUARIO LOGUEADO DESDE LOCALSTORAGE
    const currentUser = localStorage.getItem('portisAppUser');
    
    if (!currentUser) {
        showMessageBox("Error: No se ha iniciado sesión. Volviendo a Login...", true);
        // Redirigir si no hay usuario logueado
        setTimeout(() => window.location.href = '../LogIn/LogIn.html', 1500); 
        return;
    }
    
    showMessageBox("Cargando lista...", false, 'listMessageBox');

    const db = window.db;
    const repairsCollectionRef = window.collection(db, 'repairs'); // Colección Raíz

    try {
        // 2. FILTRAR LA COLECCIÓN RAÍZ POR EL USERNAME
        const q = window.query(
            repairsCollectionRef, 
            window.where('username', '==', currentUser) // <-- EL FILTRO CLAVE
        );
        const snapshot = await window.getDocs(q);
        
        const repairs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        renderRepairsList(repairs);
        document.getElementById('listMessageBox').classList.add('hidden'); 
        
    } catch (error) {
        console.error("Error al obtener reparaciones:", error);
        showMessageBox(`Error al cargar la lista: ${error.message}`, true, 'listMessageBox');
    }
}

/**
 * Maneja el envío del formulario para añadir una nueva reparación,
 * guardando el 'username' actual.
 */
async function handleAddRepair(event) {
    event.preventDefault();
    
    const submitBtn = document.getElementById('submitAddBtn');
    submitBtn.disabled = true;

    // 1. OBTENER EL USUARIO LOGUEADO DESDE LOCALSTORAGE
    const currentUser = localStorage.getItem('portisAppUser');
    
    if (!currentUser) {
        showMessageBox("Error: Sesión expirada. No se puede guardar.", true, 'modalMessageBox');
        submitBtn.disabled = false;
        return;
    }
    
    showMessageBox("Guardando...", false, 'modalMessageBox');

    // 2. CREAR EL OBJETO DE DATOS (INCLUYENDO EL USERNAME)
    const data = {
        ubicacion: document.getElementById('ubicacion').value,
        modelo: document.getElementById('modelo').value,
        fecha: document.getElementById('fecha').value, 
        contrato: document.getElementById('contrato').value,
        llave: document.getElementById('llave').value,
        averia: document.getElementById('averia').value,
        username: currentUser, // <-- CAMBIO CLAVE: SE AÑADE EL USERNAME
        timestamp: new Date().toISOString()
    };
    
    const db = window.db;
    const repairsCollectionRef = window.collection(db, 'repairs'); // Colección Raíz

    try {
        // 3. GUARDAR EN LA COLECCIÓN RAÍZ /repairs (CON ID AUTOMÁTICO)
        await window.addDoc(repairsCollectionRef, data);
        showMessageBox("Reparación añadida con éxito.", false, 'modalMessageBox');
        
        // Recargar la lista para mostrar el nuevo elemento
        await fetchRepairs();
        
        setTimeout(() => {
            closeModal();
            showMessageBox("Lista de reparaciones actualizada.", false);
        }, 1000);
        
    } catch (error) {
        console.error("Error al guardar en Firestore:", error);
        showMessageBox(`Error al guardar: ${error.message}`, true, 'modalMessageBox');
    } finally {
        // Aseguramos que el botón se habilita de nuevo (si no se cerró el modal)
        setTimeout(() => { 
            if (document.getElementById('addModal') && !document.getElementById('addModal').classList.contains('hidden')) {
                 submitBtn.disabled = false; 
            }
        }, 1000);
    }
}


// --- Inicialización ---

document.addEventListener('DOMContentLoaded', function() {
    const backBtn = document.getElementById('backBtn');
    const addBtn = document.getElementById('addBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const addRepairForm = document.getElementById('addRepairForm');
    const modalOverlay = document.getElementById('addModal');
    
    fetchRepairs(); // Carga la lista filtrada al iniciar

    if (backBtn) {
        backBtn.addEventListener('click', function() {
            // CORREGIDO: Subir de nivel y entrar a Main.html
            window.location.href = '../Main/Main.html'; 
        });
    }

    if (addBtn) {
        addBtn.addEventListener('click', openModal);
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeModal);
    }
    
    if (modalOverlay) {
        modalOverlay.addEventListener('click', function(e) {
            if (e.target === modalOverlay) {
                closeModal();
            }
        });
    }

    if (addRepairForm) {
        addRepairForm.addEventListener('submit', handleAddRepair);
    }
});