// Shared.js - LÓGICA DE AVISOS RECIBIDOS Y MODAL COMPARTIR

let allSharedDamages = [];     // Avisos que he recibido (share == currentUser)
let allShareableDamages = [];  // Avisos propios que puedo compartir (username == currentUser)
let availableUsers = [];       // Lista de usuarios para el selector
let currentDamageToShare = null; // Aviso seleccionado para compartir

// --- Utilidades del DOM y Modales ---

/**
 * Muestra un mensaje de estado temporal.
 */
function showMessageBox(message, isError = true, targetElementId = 'listMessageBox') {
    const msgBox = document.getElementById(targetElementId);
    if (!msgBox) return;

    msgBox.textContent = message;
    msgBox.classList.remove('hidden', 'error', 'success');
    
    if (message !== "Cargando lista..." && message !== "Cargando usuarios...") {
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

/**
 * Cierra todos los modales.
 */
function closeModals() {
    document.getElementById('shareModal').classList.add('hidden');
    currentDamageToShare = null;
    // El botón se mantiene habilitado según tu última petición
    document.getElementById('confirmShareBtn').disabled = false; 
    document.getElementById('modalMessageBox').classList.add('hidden'); 
    
    document.querySelectorAll('.shareable-item').forEach(i => i.classList.remove('selected'));
}

/**
 * Abre el modal de compartir y carga los datos.
 */
function openShareModal() {
    const currentUser = localStorage.getItem('portisAppUser');
    if (!currentUser) {
        showMessageBox("Error: Sesión no encontrada.", true);
        return;
    }
    
    document.getElementById('shareModal').classList.remove('hidden');
    
    // Inicia la carga de usuarios y avisos propios
    loadUsers(currentUser);
    loadShareableDamages(currentUser);
}


// --- Lógica de Búsqueda y Filtro (Avisos Recibidos) ---

/**
 * Togglea la visibilidad del campo de búsqueda.
 */
function toggleSearch() {
    const searchContainer = document.getElementById('searchContainer');
    const searchInput = document.getElementById('searchInput');

    searchContainer.classList.toggle('hidden');

    if (!searchContainer.classList.contains('hidden')) {
        searchInput.focus(); 
    } else {
        searchInput.value = '';  
        filterDamages('');
    }
}

/**
 * Filtra y re-renderiza la lista de avisos basándose en el texto de búsqueda.
 */
function filterDamages(searchTerm) {
    const term = searchTerm.toLowerCase().trim();

    if (term === '') {
        renderDamagesList(allSharedDamages);
        return;
    }

    const filtered = allSharedDamages.filter(damage => {
        const dataString = [
            damage.ubicacion,
            damage.modelo,
            damage.llave,
			damage.contrato,
            damage.averia || ''
        ].join(' ').toLowerCase();

        return dataString.includes(term);
    });

    renderDamagesList(filtered);
}


// --- Lógica de Firestore y Lista Principal ---

/**
 * Ordena los avisos: averiados (Prioritarios) primero, y luego por fecha descendente.
 */
function sortDamages(damages) {
    return damages.sort((a, b) => {
        const dateA = new Date(a.fecha + '-01') || new Date('1900-01-01');
        const dateB = new Date(b.fecha + '-01') || new Date('1900-01-01');
        
        const tieneAveriaA = a.averia && a.averia.trim() !== '';
        const tieneAveriaB = b.averia && b.averia.trim() !== '';

        if (tieneAveriaA && !tieneAveriaB) return -1;
        if (!tieneAveriaA && tieneAveriaB) return 1;

        return dateB - dateA;  
    });
}


/**
 * Renderiza la lista de avisos RECIBIDOS en el DOM.
 */
function renderDamagesList(damages) {
    const listContainer = document.getElementById('damagesList');
    listContainer.innerHTML = '';  
    
    if (!damages || damages.length === 0) {
        const emptyMessage = (document.getElementById('searchInput') && document.getElementById('searchInput').value.trim() !== '')  
            ? 'No se encontraron resultados para la búsqueda actual.'  
            : 'No has recibido ningún aviso compartido.';

        listContainer.innerHTML = `<p class="empty-list-message">${emptyMessage}</p>`;
        return;
    }

    const sortedDamages = sortDamages(damages);

    sortedDamages.forEach(damage => {
        const item = document.createElement('div');
        item.classList.add('list-item');
        
        const isPriority = damage.averia && damage.averia.trim() !== '';
        if (isPriority) {
            item.classList.add('is-priority');
        }
        
        const dateParts = damage.fecha ? damage.fecha.split('-') : [];
        const formattedDate = dateParts.length === 2 ? `${dateParts[1]}/${dateParts[0]}` : 'Fecha Desconocida';

        item.innerHTML = `
            <div class="list-item-header">
                <strong class="ubicacion-text">${damage.ubicacion}</strong> | Enviado por: ${damage.sharedBy || 'Desconocido'}
            </div>
            
            <p class="compact-info">
                Modelo: ${damage.modelo} | Llave: ${damage.llave} | Contrato: ${damage.contrato} | Fecha: ${formattedDate}
            </p>
            
            <p class="averia-text compact-info">Avería: ${isPriority ? damage.averia : 'N/A'}</p>
            
            ${isPriority ? '<p class="priority-indicator">Alta Prioridad</p>' : ''}
        `;
        
        listContainer.appendChild(item);
    });
}


/**
 * Obtiene los avisos compartidos con el usuario actual desde la colección raíz /repairs,
 * filtrando por el campo 'share' == username.
 */
async function fetchSharedDamages() {
    const currentUser = localStorage.getItem('portisAppUser');
    
    if (!currentUser) {
        showMessageBox("Error: No se ha iniciado sesión. Volviendo a Login...", true);
        setTimeout(() => window.location.href = '../LogIn/LogIn.html', 1500);  
        return;
    }
    
    showMessageBox("Cargando lista...", false, 'listMessageBox');

    const db = window.db;
    const repairsCollectionRef = window.collection(db, 'repairs'); 

    try {
        const q = window.query(
            repairsCollectionRef, 
            window.where('share', '==', currentUser) 
        );
        const snapshot = await window.getDocs(q);
        
        const damages = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        allSharedDamages = damages; 
        
        renderDamagesList(damages);
        document.getElementById('listMessageBox').classList.add('hidden'); 
        
    } catch (error) {
        console.error("Error al obtener avisos compartidos:", error);
        showMessageBox(`Error al cargar la lista: ${error.message}. ¿El usuario está logueado?`, true, 'listMessageBox');
    }
}

// --- Lógica del Modal de Compartir ---

/**
 * Carga la lista de usuarios para el selector desde Firestore.
 * Muestra el 'username' y excluye al usuario actual.
 */
async function loadUsers(currentUser) {
    const selector = document.getElementById('userSelector');
    selector.innerHTML = '<option value="" disabled selected>Cargando usuarios...</option>';
    
    const USERS_COLLECTION = 'users'; 
    
    try {
        const usersSnapshot = await window.getDocs(window.collection(window.db, USERS_COLLECTION));
        
        availableUsers = [];
        selector.innerHTML = '<option value="" disabled selected>Selecciona un Usuario</option>';

        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            
            // 1. Validar que exista el username y que NO sea el usuario logueado
            if (userData.username && userData.username !== currentUser) { 
                
                const userName = userData.username; 
                
                availableUsers.push({ uid: userData.username, name: userName });
                
                const option = document.createElement('option');
                option.value = userData.username; 
                option.textContent = userName; // CLAVE: Usamos el username como texto a mostrar
                selector.appendChild(option);
            }
        });

        // Si no se cargó ningún usuario aparte del default, deshabilitar el botón
        if (selector.options.length === 1) { 
             selector.innerHTML = '<option value="" disabled selected>No hay otros usuarios para compartir</option>';
             document.getElementById('confirmShareBtn').disabled = true;
        } else {
             // Si hay usuarios, asegurar que el botón esté habilitado (siempre lo quiere habilitado)
             document.getElementById('confirmShareBtn').disabled = false;
        }
        
    } catch (error) {
        console.error("Error al cargar usuarios:", error);
        selector.innerHTML = '<option value="" disabled selected>Error al cargar usuarios</option>';
        showMessageBox("Error al cargar la lista de usuarios.", true, 'modalMessageBox');
        document.getElementById('confirmShareBtn').disabled = true;
    }
}


/**
 * Carga las averías PROPIAS del usuario logueado.
 */
async function loadShareableDamages(currentUser) { 
    const container = document.getElementById('shareableDamagesList');
    container.innerHTML = '<p class="empty-list-message">Cargando tus avisos...</p>';
    
    const REPAIRS_COLLECTION = 'repairs'; 

    try {
        const q = window.query(
            window.collection(window.db, REPAIRS_COLLECTION),
            window.where('username', '==', currentUser)
        );

        const querySnapshot = await window.getDocs(q);
        
        allShareableDamages = querySnapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() })); 
        
        renderShareableList(allShareableDamages, container);

    } catch (error) {
        console.error("Error al cargar averías propias compartibles:", error);
        container.innerHTML = `<p class="empty-list-message error">Error al cargar tus avisos</p>`;
    }
}

/**
 * Renderiza la lista de avisos seleccionables dentro del modal.
 */
function renderShareableList(dataList, container) {
    container.innerHTML = '';
    
    if (dataList.length === 0) {
        container.innerHTML = '<p class="empty-list-message">No tienes avisos propios registrados.</p>';
        return;
    }

    const sortedDataList = sortDamages(dataList); 

    sortedDataList.forEach(damage => {
        const item = document.createElement('div');
        item.classList.add('shareable-item', 'list-item'); 
        
        const isPriority = damage.averia && damage.averia.trim() !== '';
        if (isPriority) {
            item.classList.add('is-priority');
        }

        item.innerHTML = `
            <strong class="ubicacion-text">${damage.ubicacion} (${damage.modelo})</strong>
            <p class="compact-info">Avería: ${damage.averia || 'N/A'}</p>
        `;
        
        item.addEventListener('click', () => {
            document.querySelectorAll('.shareable-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            currentDamageToShare = damage;
        });

        container.appendChild(item);
    });
}


/**
 * Maneja la confirmación y realiza la actualización en Firestore.
 */
async function handleShareConfirmation() {
    const selectedUserUID = document.getElementById('userSelector').value;
    const currentUser = localStorage.getItem('portisAppUser');

    if (!currentDamageToShare) {
        showMessageBox("Selecciona un aviso para compartir.", true, 'modalMessageBox');
        return;
    }

    if (!selectedUserUID) {
        showMessageBox("Selecciona un usuario de destino.", true, 'modalMessageBox');
        return;
    }
    
    if (!currentUser) {
        showMessageBox("Error: Usuario actual no identificado.", true, 'modalMessageBox');
        return;
    }
    
    const damageId = currentDamageToShare.id;
    const db = window.db;
    
    // Referencia al documento de la avería en Firestore
    const damageDocRef = window.doc(db, 'repairs', damageId);
    
    try {
        showMessageBox(`Compartiendo aviso con ${selectedUserUID}...`, false, 'modalMessageBox');

        // 1. Actualiza el documento con el campo 'share' (creándolo si no existe)
        // También añade 'sharedBy' para que el receptor sepa quién lo compartió.
        await window.updateDoc(damageDocRef, {
            share: selectedUserUID, 
            sharedBy: currentUser
        });
        
        // 2. Éxito
        showMessageBox(`¡Aviso compartido con éxito con ${selectedUserUID}!`, false, 'modalMessageBox');
        
        // Cierra el modal después de un breve mensaje de éxito
        setTimeout(() => {
            closeModals();
        }, 1500);

    } catch (error) {
        // 3. Error
        console.error("Error al compartir el aviso:", error);
        showMessageBox(`Error al compartir: ${error.message}. Verifica tu conexión y permisos.`, true, 'modalMessageBox');
        
        // Asegurar que el botón se rehabilite en caso de error
        document.getElementById('confirmShareBtn').disabled = false;
    }
}

// --- Inicialización y Listeners ---

document.addEventListener('DOMContentLoaded', function() {
    const backBtn = document.getElementById('backBtn');
    const sendBtn = document.getElementById('sendBtn'); 
    
    const modalBackBtn = document.getElementById('modalBackBtn'); 
    const confirmShareBtn = document.getElementById('confirmShareBtn'); 
    
    const searchToggleBtn = document.getElementById('searchToggleBtn');
    const searchInput = document.getElementById('searchInput'); 
    
    // ** La lista principal debe cargar al inicio **
    fetchSharedDamages(); 

    // ** LISTENERS PRINCIPALES **
    
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            window.location.href = '../Main/Main.html'; 
        });
    }

    // * LISTENERS DEL MODAL DE COMPARTIR
    if (sendBtn) {
        sendBtn.addEventListener('click', openShareModal);
    }
    
    if (modalBackBtn) { 
        modalBackBtn.addEventListener('click', closeModals);
    }
    
    if (confirmShareBtn) {
        confirmShareBtn.addEventListener('click', handleShareConfirmation);
    }
    
    // * LISTENERS DE BÚSQUEDA
    if (searchToggleBtn) {
        searchToggleBtn.addEventListener('click', toggleSearch);
    }
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterDamages(e.target.value);
        });
    }
});