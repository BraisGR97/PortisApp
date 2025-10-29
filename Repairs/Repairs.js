// Repairs.js

// --- Utilidades del DOM (Se mantienen igual) ---

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
 * Espera a que el ID de usuario de Firebase esté disponible.
 * @returns {Promise<string>} El ID de usuario actual.
 */
function waitForUserId() {
    return new Promise((resolve, reject) => {
        const check = () => {
            if (window.CURRENT_USER_ID && window.CURRENT_USER_ID !== "LOADING...") {
                resolve(window.CURRENT_USER_ID);
            } else {
                setTimeout(check, 100); 
            }
        };
        check();
    });
}

/**
 * Renderiza la lista de reparaciones en el DOM. (Se mantiene igual)
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
        
        const [year, month] = repair.fecha.split('-');
        const formattedDate = `${month}/${year}`;

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
 * Obtiene las reparaciones del usuario actual desde la subcolección.
 * CORREGIDO: Consulta en /users/{userId}/repairs
 */
async function fetchRepairs() {
    let userId;
    try {
        showMessageBox("Cargando lista...", false, 'listMessageBox');
        userId = await waitForUserId();
    } catch (error) {
        showMessageBox("Error crítico: No se pudo obtener el ID de usuario para cargar datos.", true, 'listMessageBox');
        return;
    }

    const db = window.db;
    
    // USANDO LA SUBCOLECCIÓN: users -> [userId] -> repairs
    // Necesitas importar doc() en Repairs.html para esto
    const repairsCollectionRef = window.collection(
        window.doc(db, 'users', userId), 
        'repairs'
    );

    try {
        // En una subcolección filtrada por ID de documento, no necesitas un where
        const snapshot = await window.getDocs(repairsCollectionRef);
        
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
 * Maneja el envío del formulario para añadir una nueva reparación.
 * CORREGIDO: Guarda en /users/{userId}/repairs
 */
async function handleAddRepair(event) {
    event.preventDefault();
    
    const submitBtn = document.getElementById('submitAddBtn');
    submitBtn.disabled = true;

    let userId;
    try {
        showMessageBox("Guardando...", false, 'modalMessageBox');
        userId = await waitForUserId(); 
    } catch (error) {
        showMessageBox("Error: ID de usuario no disponible para guardar.", true, 'modalMessageBox');
        submitBtn.disabled = false;
        return;
    }
    
    const data = {
        ubicacion: document.getElementById('ubicacion').value,
        modelo: document.getElementById('modelo').value,
        fecha: document.getElementById('fecha').value, 
        contrato: document.getElementById('contrato').value,
        llave: document.getElementById('llave').value,
        averia: document.getElementById('averia').value,
        // Ya no necesitamos 'userId' dentro del documento, ya que está en la ruta
        timestamp: new Date().toISOString()
    };
    
    const db = window.db;

    // USANDO LA SUBCOLECCIÓN: users -> [userId] -> repairs
    const repairsCollectionRef = window.collection(
        window.doc(db, 'users', userId), 
        'repairs'
    );

    try {
        await window.addDoc(repairsCollectionRef, data);
        showMessageBox("Reparación añadida con éxito.", false, 'modalMessageBox');
        
        await fetchRepairs();
        
        setTimeout(() => {
            closeModal();
            showMessageBox("Lista de reparaciones actualizada.", false);
        }, 1000);
        
    } catch (error) {
        console.error("Error al guardar en Firestore:", error);
        showMessageBox(`Error al guardar: ${error.message}`, true, 'modalMessageBox');
    } finally {
        setTimeout(() => { submitBtn.disabled = false; }, 1000);
    }
}


// --- Inicialización (Se mantiene igual) ---

document.addEventListener('DOMContentLoaded', function() {
    const backBtn = document.getElementById('backBtn');
    const addBtn = document.getElementById('addBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const addRepairForm = document.getElementById('addRepairForm');
    const modalOverlay = document.getElementById('addModal');
    
    fetchRepairs();

    if (backBtn) {
        backBtn.addEventListener('click', function() {
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