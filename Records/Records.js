// Records.js - LÓGICA DE VISUALIZACIÓN DE HISTORIAL (Nueva Colección: /records)

// --- Utilidades del DOM ---

/**
 * Muestra un mensaje de estado temporal. Reutiliza la función de Repairs.
 */
function showMessageBox(message, isError = true, targetElementId = 'listMessageBox') {
    const msgBox = document.getElementById(targetElementId);
    if (!msgBox) return;

    msgBox.textContent = message;
    msgBox.classList.remove('hidden', 'error', 'success');
    
    if (message !== "Cargando lista...") {
        if (isError) {
            msgBox.classList.add('error');
        } else {
            msgBox.classList.add('success');
        }
        
        // Ocultar después de 5 segundos
        setTimeout(() => {
            msgBox.classList.add('hidden');
        }, 5000);
    }
}

/**
 * Redirige a la página de detalle de la avería, pasando su ID.
 */
function openDamagePage(repairData) {
    const repairId = repairData.id;
    window.location.href = `../Damage/Damage.html?id=${repairId}`;
}


// --- Lógica de Firestore y Lista ---

/**
 * Ordena las reparaciones: averiadas (Prioritarias) primero, y luego por fecha descendente.
 */
function sortRepairs(repairs) {
    return repairs.sort((a, b) => {
        const dateA = new Date(a.fecha + '-01') || new Date('1900-01-01');
        const dateB = new Date(b.fecha + '-01') || new Date('1900-01-01');
        
        // Prioridad se basa en si el campo 'averia' está lleno.
        const tieneAveriaA = a.averia && a.averia.trim() !== '';
        const tieneAveriaB = b.averia && b.averia.trim() !== '';

        // 1. Prioridad: Elementos CON avería primero.
        if (tieneAveriaA && !tieneAveriaB) return -1;
        if (!tieneAveriaA && tieneAveriaB) return 1;

        // 2. Desempate: Fecha más reciente primero (descendente)
        return dateB - dateA; 
    });
}


/**
 * Renderiza la lista de reparaciones/registros en el DOM.
 */
function renderRepairsList(repairs) {
    const listContainer = document.getElementById('repairsList');
    listContainer.innerHTML = ''; 
    
    if (!repairs || repairs.length === 0) {
        listContainer.innerHTML = '<p class="empty-list-message">Aún no hay registros en tu historial.</p>';
        return;
    }

    const sortedRepairs = sortRepairs(repairs);

    sortedRepairs.forEach(repair => {
        const item = document.createElement('div');
        item.classList.add('list-item');
        
        // Determinar si es PRIORITARIO (si el campo 'averia' tiene texto)
        const isPriority = repair.averia && repair.averia.trim() !== '';
        if (isPriority) {
            item.classList.add('is-priority'); // Clase para el fondo rojo suave
        }
        
        const dateParts = repair.fecha ? repair.fecha.split('-') : [];
        const formattedDate = dateParts.length === 2 ? `${dateParts[1]}/${dateParts[0]}` : 'Fecha Desconocida';

        item.innerHTML = `
            <div class="list-item-header">
                <strong class="ubicacion-text">${repair.ubicacion}</strong>
            </div>
            
            <p class="compact-info">
                Modelo: ${repair.modelo} | Llave: ${repair.llave} | Contrato: ${repair.contrato} | Fecha: ${formattedDate}
            </p>
            
            <p class="averia-text compact-info">Avería: ${isPriority ? repair.averia : 'N/A'}</p>
            
            ${isPriority ? '<p class="priority-indicator">(Prioritario)</p>' : ''}
        `;
        
        // Asigna el evento de clic para redirigir a la página de detalle
        item.addEventListener('click', () => openDamagePage(repair)); 
        
        listContainer.appendChild(item);
    });
}


/**
 * Obtiene los registros del usuario actual desde la COLECCIÓN RAÍZ /records,
 * filtrando por el campo 'username'.
 */
async function fetchRecords() {
    const currentUser = localStorage.getItem('portisAppUser');
    
    if (!currentUser) {
        showMessageBox("Error: No se ha iniciado sesión. Volviendo a Login...", true);
        setTimeout(() => window.location.href = '../LogIn/LogIn.html', 1500); 
        return;
    }
    
    showMessageBox("Cargando lista...", false, 'listMessageBox');

    const db = window.db;
    const recordsCollectionRef = window.collection(db, 'records'); // <-- COLECCIÓN 'records'
                                                                    
    try {
        // FILTRAR LA COLECCIÓN RAÍZ POR EL USERNAME
        const q = window.query(
            recordsCollectionRef, 
            window.where('username', '==', currentUser)
        );
        const snapshot = await window.getDocs(q);
        
        const repairs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        renderRepairsList(repairs);
        document.getElementById('listMessageBox').classList.add('hidden'); 
        
    } catch (error) {
        console.error("Error al obtener registros:", error);
        showMessageBox(`Error al cargar el historial: ${error.message}`, true, 'listMessageBox');
    }
}


// --- Inicialización ---

document.addEventListener('DOMContentLoaded', function() {
    const backBtn = document.getElementById('backBtn');
    
    fetchRecords(); // Llama a la nueva función de carga

    if (backBtn) {
        backBtn.addEventListener('click', function() {
            // Regresar al Main.html
            window.location.href = '../Main/Main.html'; 
        });
    }
    
    // NO HAY LISTENERS DE MODAL O FORMULARIO DE AÑADIR
});