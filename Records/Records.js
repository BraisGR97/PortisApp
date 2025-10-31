// Records.js - LÓGICA DE VISUALIZACIÓN DE HISTORIAL (Colección: /records)
let allRecords = []; // Variable global para almacenar todos los registros cargados

// --- Utilidades del DOM ---

/**
 * Muestra un mensaje de estado temporal.
 */
function showMessageBox(message, isError = true, targetElementId = 'listMessageBox') {
    const msgBox = document.getElementById(targetElementId);
    if (!msgBox) return;

    msgBox.textContent = message;
    msgBox.classList.remove('hidden', 'error', 'success');
    
    // Si NO es el mensaje de carga, aplicamos la clase de estado y el temporizador.
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
 * Redirige a la página de detalle, pasando su ID y la colección.
 */
function openDamagePage(recordData) {
    const recordId = recordData.id;
    // CLAVE: Redirigimos a la nueva página de detalles de historial
    window.location.href = `../History/History.html?id=${recordId}&collection=records`;
}

// --- Lógica de Búsqueda y Filtro ---

/**
 * Togglea la visibilidad del campo de búsqueda.
 */
function toggleSearch() {
    const searchContainer = document.getElementById('searchContainer');
    const searchInput = document.getElementById('searchInput');

    searchContainer.classList.toggle('hidden');

    if (!searchContainer.classList.contains('hidden')) {
        searchInput.focus(); // Enfoca el input al abrir
    } else {
        // Al ocultar, limpiar el campo y restaurar la lista completa
        searchInput.value = ''; 
        filterRecords(''); 
    }
}

/**
 * Filtra y re-renderiza la lista de reparaciones basándose en el texto de búsqueda.
 * @param {string} searchTerm - El texto introducido por el usuario.
 */
function filterRecords(searchTerm) {
    const term = searchTerm.toLowerCase().trim();

    if (term === '') {
        // Si el término está vacío, renderiza la lista completa
        renderRecordsList(allRecords);
        return;
    }

    const filtered = allRecords.filter(record => {
        // Combina los campos relevantes en una sola cadena para buscar coincidencias
        const dataString = [
            record.ubicacion,
            record.modelo,
            record.llave,
            record.contrato,
            record.averia || '' // Usar cadena vacía si no existe el campo 'averia'
        ].join(' ').toLowerCase();

        return dataString.includes(term);
    });

    renderRecordsList(filtered);
}

// --- Lógica de Firestore y Lista ---

/**
 * Ordena los registros por la fecha de completado (completedAt) descendente.
 */
function sortRecords(records) {
    return records.sort((a, b) => {
        // Usamos completedAt (fecha y hora del registro) para el historial.
        const dateA = new Date(a.completedAt || '1900-01-01T00:00:00Z');
        const dateB = new Date(b.completedAt || '1900-01-01T00:00:00Z');
        
        // Desempate: Fecha más reciente primero (descendente)
        return dateB - dateA; 
    });
}


/**
 * Renderiza la lista de REGISTROS de historial en el DOM.
 */
function renderRecordsList(records) {
    const listContainer = document.getElementById('repairsList');
    listContainer.innerHTML = ''; 
    
    if (!records || records.length === 0) {
        // Revisar si está vacío por filtro o por no haber registros
        const emptyMessage = (document.getElementById('searchInput') && document.getElementById('searchInput').value.trim() !== '') 
            ? 'No se encontraron registros para la búsqueda actual.' 
            : 'Aún no hay registros en tu historial.';
        
        listContainer.innerHTML = `<p class="empty-list-message">${emptyMessage}</p>`;
        return;
    }

    const sortedRecords = sortRecords(records); // Usamos la nueva función de ordenación

    sortedRecords.forEach(record => {
        const item = document.createElement('div');
        item.classList.add('list-item');
        
        // El historial no tiene prioridad; podemos usar el campo 'isCompletedSuccessfully' si existe.
        const isSuccess = record.isCompletedSuccessfully === true;
        const statusText = isSuccess ? 'Completado con Éxito' : 'Solo Registro';
        
        if (isSuccess) {
            item.classList.add('is-success'); // Clase de estilo verde/azul
        } else {
            item.classList.add('is-failure'); // Clase de estilo gris/rojo suave
        }
        
        // Formatear la fecha de PRÓXIMO MANTENIMIENTO (si existe, campo 'fecha')
        const nextDateParts = record.fecha ? record.fecha.split('-') : [];
        const formattedNextDate = nextDateParts.length === 2 ? `${nextDateParts[1]}/${nextDateParts[0]}` : 'N/A';

        // Formatear la fecha de REGISTRO (completedAt)
        let completedDate = 'N/A';
        if (record.completedAt) {
            try {
                const dateObj = new Date(record.completedAt);
                completedDate = dateObj.toLocaleDateString('es-ES', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric' 
                });
            } catch (e) {
                completedDate = 'Fecha Inválida';
            }
        }

        item.innerHTML = `
            <div class="list-item-header">
                <strong class="ubicacion-text">${record.ubicacion}</strong>
            </div>
            
            <p class="status-indicator">Estado: ${statusText}</p>
            
            <p class="compact-info">
                Modelo: ${record.modelo} | Llave: ${record.llave} | Contrato: ${record.contrato}
            </p>
            <p class="compact-info">
                Próximo Mant.: ${formattedNextDate} | Registrado el: ${completedDate}
            </p>
        `;
        
        item.addEventListener('click', () => openDamagePage(record)); 
        
        listContainer.appendChild(item);
    });
}


/**
 * Obtiene los registros del usuario actual desde la COLECCIÓN RAÍZ /records.
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
    const recordsCollectionRef = window.collection(db, 'records'); // <-- OK: COLECCIÓN 'records'
    
    try {
        // FILTRAR LA COLECCIÓN RAÍZ POR EL USERNAME
        const q = window.query(
            recordsCollectionRef, 
            window.where('username', '==', currentUser)
        );
        const snapshot = await window.getDocs(q);
        
        const records = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // ************************************************
        // * CORRECCIÓN 1: ASIGNAR A LA VARIABLE GLOBAL
        // ************************************************
        allRecords = records; 

        // CLAVE: Llamamos a la función de renderizado de HISTORIAL
        renderRecordsList(allRecords);
        
        // Ocultar el mensaje de carga al finalizar con éxito.
        document.getElementById('listMessageBox').classList.add('hidden'); 
        
    } catch (error) {
        console.error("Error al obtener registros:", error);
        showMessageBox(`Error al cargar el historial: ${error.message}`, true, 'listMessageBox');
    }
}


// --- Inicialización ---

document.addEventListener('DOMContentLoaded', function() {
    const backBtn = document.getElementById('backBtn');
    
    // ************************************************
    // * CORRECCIÓN 2: DEFINIR LOS ELEMENTOS DE BÚSQUEDA
    // ************************************************
    const searchToggleBtn = document.getElementById('searchToggleBtn');
    const searchInput = document.getElementById('searchInput');
    // Asumo que tienes una forma de añadir 'addRecordsForm' si fuera necesario,
    // pero lo dejo fuera ya que esta página es de solo lectura.
    // const addRecordsForm = document.getElementById('addRecordsForm');


    // Comprobación de que la inicialización de Firebase se haya realizado
    if (!window.db) {
        showMessageBox("Error: Firebase no inicializado. Asegúrate de que el bloque <script type='module'> en Records.html se ejecuta correctamente.", true);
        return;
    }
    
    fetchRecords(); // Llama a la función de carga

    if (backBtn) {
        backBtn.addEventListener('click', function() {
            // Regresar al Main.html
            window.location.href = '../Main/Main.html'; 
        });
    }

    // ************************************************
    // * Listeners para la funcionalidad de búsqueda (YA ESTABAN CORRECTOS)
    // ************************************************
    if (searchToggleBtn) {
        searchToggleBtn.addEventListener('click', toggleSearch);
    }
    
    if (searchInput) {
        // El evento 'input' dispara el filtro en tiempo real
        searchInput.addEventListener('input', (e) => {
            filterRecords(e.target.value);
        });
    }
    // ************************************************
    
    // if (addRecordsForm) {
    //     addRecordsForm.addEventListener('submit', handleAddRecord);
    // }
});