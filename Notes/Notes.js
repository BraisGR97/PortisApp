/**
 * ====================================================================
 * Notes.js - Lógica para la Gestión de Notas
 * ====================================================================
 * 
 * Este módulo gestiona la creación, edición, eliminación y visualización
 * de notas personales del usuario.
 */

// ====================================================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// ====================================================================

const firebaseConfig = window.firebaseConfig;

let app;
let db;
let auth;
let userId = null;
let isAuthReady = false;

// Cache de datos para búsqueda
window.currentNotesData = [];

// ====================================================================
// AUTENTICACIÓN Y SETUP
// ====================================================================

/**
 * Valida la sesión del usuario y prepara la interfaz.
 */
function checkAuthenticationAndSetup() {
    userId = sessionStorage.getItem('portis-user-identifier');
    const userDisplayName = sessionStorage.getItem('portis-user-display-name');
    const displayElement = document.getElementById('current-user-display');

    if (!userId || !userDisplayName) {
        window.location.href = '../index.html';
        return;
    }

    if (displayElement) {
        displayElement.textContent = userDisplayName;
    }

    initializeAppAndAuth();
    document.getElementById('new-note-form').addEventListener('submit', saveNote);
}

/**
 * Inicializa Firebase y establece el listener de autenticación.
 */
async function initializeAppAndAuth() {
    try {
        if (!firebaseConfig || !firebaseConfig.apiKey) {
            throw new Error("La configuración de Firebase está incompleta.");
        }

        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();

        auth.onAuthStateChanged((user) => {
            if (user && user.uid === userId) {
                isAuthReady = true;
                setupNotesListener();
            } else {
                window.location.href = '../index.html';
            }
        });

    } catch (error) {
        document.getElementById('notes-list').innerHTML = `
            <div class="message-error p-3 mt-4 text-red-400 bg-red-900/40 border border-red-900 rounded-lg">
                Error de conexión. No se pudo cargar el módulo de datos.
            </div>
        `;
    }
}

// ====================================================================
// FUNCIONES DE FIREBASE
// ====================================================================

/**
 * Obtiene la referencia a la colección de notas del usuario.
 * @returns {Object|null} Referencia a la colección o null
 */
function getNotesCollectionRef() {
    if (!db || !userId) return null;
    return db.collection(`users/${userId}/notes`);
}

/**
 * Configura el listener en tiempo real para las notas (Firebase).
 */
function setupNotesListener() {
    if (!db || !isAuthReady || !userId) return;

    const notesQuery = getNotesCollectionRef().orderBy('timestamp', 'desc');

    notesQuery.onSnapshot((snapshot) => {
        const notes = [];
        snapshot.forEach((doc) => {
            notes.push({ id: doc.id, ...doc.data() });
        });
        renderNotes(notes);
    }, (error) => {
        // Error en la conexión
    });
}

// ====================================================================
// CRUD - CREAR Y ACTUALIZAR NOTAS
// ====================================================================

/**
 * Guarda una nota nueva o actualiza una existente.
 * @param {Event} e - Evento del formulario
 */
async function saveNote(e) {
    e.preventDefault();
    if (!isAuthReady || !userId) return;

    const form = document.getElementById('new-note-form');
    const submitButton = document.getElementById('save-note-btn');
    const idInput = document.getElementById('note-id');
    const editId = idInput.value;

    const title = document.getElementById('title').value.trim();
    const content = document.getElementById('content').value.trim();
    const imageUrl = document.getElementById('image-url').value;

    if (!title) return;

    submitButton.innerHTML = '<i class="ph ph-circle-notch animate-spin mr-2"></i> Guardando...';
    submitButton.disabled = true;

    const noteData = {
        title,
        content,
        imageUrl,
        userId: userId,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        const notesRef = getNotesCollectionRef();
        if (!notesRef) return;

        // VERIFICAR LIMITE DE IMAGENES (100)
        // Si estamos guardando una imagen, verificar si excedemos el limite
        if (imageUrl) {
            let existingNotesWithImages = window.currentNotesData.filter(n => n.imageUrl);
            let isAddingNewImage = true;

            if (editId) {
                const currentNote = window.currentNotesData.find(n => n.id === editId);
                // Si ya tenía imagen, no estamos sumando una nueva al total
                if (currentNote && currentNote.imageUrl) isAddingNewImage = false;
            }

            if (isAddingNewImage && existingNotesWithImages.length >= 100) {
                // Ordenar por fecha (timestmap) ascendente (más viejas primero)
                existingNotesWithImages.sort((a, b) => {
                    const timeA = a.timestamp && a.timestamp.toMillis ? a.timestamp.toMillis() : (a.timestamp || 0);
                    const timeB = b.timestamp && b.timestamp.toMillis ? b.timestamp.toMillis() : (b.timestamp || 0);
                    return timeA - timeB;
                });

                const oldestNote = existingNotesWithImages[0];

                // 1. Borrar de Cloudinary
                if (typeof window.deleteCloudinaryImage === 'function') {
                    await window.deleteCloudinaryImage(oldestNote.imageUrl);
                }

                // 2. Borrar referencia en Firestore (sin borrar la nota)
                await notesRef.doc(oldestNote.id).update({ imageUrl: "" });
            }
        }

        if (editId) {
            await notesRef.doc(editId).update({
                title,
                content,
                imageUrl,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            await notesRef.add(noteData);
        }

        resetForm();
        window.toggleNewNoteForm();

    } catch (error) {
        alert("Error al guardar la nota. Inténtalo de nuevo.");
    }

    submitButton.innerHTML = '<i class="ph ph-floppy-disk mr-2"></i> Guardar Nota';
    submitButton.disabled = false;
}

// ====================================================================
// CRUD - ELIMINAR NOTAS
// ====================================================================

/**
 * Elimina una nota después de confirmación del usuario.
 * @param {string} id - ID de la nota a eliminar
 */
window.deleteNote = async function (id) {
    if (!isAuthReady || !userId) return;

    if (!confirm("¿Estás seguro de que quieres eliminar esta nota?")) {
        return;
    }

    const noteElement = document.querySelector(`.note-card[data-id="${id}"]`);
    if (noteElement) {
        noteElement.classList.add('opacity-0', 'transform', '-translate-x-full');
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    try {
        const notesRef = getNotesCollectionRef();
        if (notesRef) {
            await notesRef.doc(id).delete();
        }
    } catch (error) {
        if (noteElement) {
            noteElement.classList.remove('opacity-0', 'transform', '-translate-x-full');
        }
    }
}

// ====================================================================
// CRUD - EDITAR NOTAS
// ====================================================================

/**
 * Prepara el formulario para editar una nota existente.
 * @param {string} id - ID de la nota a editar
 */
window.editNote = function (id) {
    const notes = window.currentNotesData;
    const note = notes.find(n => n.id === id);

    if (!note) return;

    // Rellenar formulario
    document.getElementById('note-id').value = note.id;
    document.getElementById('title').value = note.title;
    document.getElementById('content').value = note.content || '';

    // Rellenar imagen si existe
    if (note.imageUrl) {
        document.getElementById('image-url').value = note.imageUrl;
        document.getElementById('image-preview').src = note.imageUrl;
        document.getElementById('image-preview-container').classList.remove('hidden');
    } else {
        clearImage();
    }

    // Cambiar UI del formulario
    document.getElementById('form-title').innerHTML = `
        <i class="ph ph-pencil-simple card-icon"></i>
        Editar Nota
    `;
    document.getElementById('save-note-btn').innerHTML = '<i class="ph ph-floppy-disk mr-2"></i> Actualizar Nota';
    document.getElementById('cancel-edit-btn').classList.remove('hidden');

    // Mostrar formulario si está oculto
    const card = document.getElementById('new-note-card');
    if (card.classList.contains('hidden')) {
        window.toggleNewNoteForm();
    } else {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/**
 * Cancela la edición y resetea el formulario.
 */
window.cancelEdit = function () {
    resetForm();
    window.toggleNewNoteForm();
}

/**
 * Resetea el formulario a su estado inicial.
 */
function resetForm() {
    const form = document.getElementById('new-note-form');
    form.reset();
    document.getElementById('note-id').value = '';
    clearImage();

    document.getElementById('form-title').innerHTML = `
        <i class="ph ph-notebook card-icon"></i>
        Nueva Nota
    `;
    document.getElementById('save-note-btn').innerHTML = '<i class="ph ph-floppy-disk mr-2"></i> Guardar Nota';
    document.getElementById('cancel-edit-btn').classList.add('hidden');
}

// ====================================================================
// GESTIÓN DE IMÁGENES Y MODAL
// ====================================================================

/**
 * Maneja la selección de una imagen en el formulario.
 */
window.handleImageSelect = async function (event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        alert("La imagen es demasiado grande. Máximo 5MB.");
        return;
    }

    // Mostrar preview
    const reader = new FileReader();
    reader.onload = function (e) {
        const preview = document.getElementById('image-preview');
        const container = document.getElementById('image-preview-container');
        preview.src = e.target.result;
        container.classList.remove('hidden');
    };
    reader.readAsDataURL(file);

    document.getElementById('image-filename').textContent = file.name;

    // Subir a Cloudinary
    try {
        const imageUrl = await uploadImageToCloudinary(file);
        document.getElementById('image-url').value = imageUrl;
    } catch (error) {
        alert("Error al subir la imagen. Inténtalo de nuevo.");
        clearImage();
    }
};

/**
 * Sube una imagen a Cloudinary.
 */
async function uploadImageToCloudinary(file) {
    const cloudName = window.cloudinaryConfig.cloudName;
    const uploadPreset = window.cloudinaryConfig.uploadPreset;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/upload`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) throw new Error('Error en la subida a Cloudinary');

    const data = await response.json();
    return data.secure_url;
}

/**
 * Limpia la imagen seleccionada.
 */
window.clearImage = function () {
    document.getElementById('image-upload').value = '';
    document.getElementById('image-url').value = '';
    document.getElementById('image-filename').textContent = '';
    document.getElementById('image-preview').src = '';
    document.getElementById('image-preview-container').classList.add('hidden');
};

/**
 * Abre el modal de visualización de nota.
 */
window.openViewModal = function (id) {
    const notes = window.currentNotesData;
    const note = notes.find(n => n.id === id);
    if (!note) return;

    document.getElementById('view-note-title').textContent = note.title;

    const dateRaw = note.timestamp && note.timestamp.toDate ? note.timestamp.toDate() : new Date(note.timestamp);
    const formattedDate = dateRaw.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    document.getElementById('view-note-date').textContent = formattedDate;

    const contentEl = document.getElementById('view-note-content');
    contentEl.textContent = note.content || 'Sin contenido...';

    const imageEl = document.getElementById('view-note-image');
    if (note.imageUrl) {
        imageEl.src = note.imageUrl;
        imageEl.classList.remove('hidden');
    } else {
        imageEl.classList.add('hidden');
    }

    document.getElementById('view-note-modal').classList.remove('hidden');
};

/**
 * Cierra el modal de visualización.
 */
window.closeViewModal = function () {
    document.getElementById('view-note-modal').classList.add('hidden');
};

// ====================================================================
// RENDERIZADO Y UI
// ====================================================================

/**
 * Renderiza las notas en la interfaz.
 * @param {Array} notes - Array de notas a renderizar
 * @param {boolean} updateCache - Si se debe actualizar el cache
 */
function renderNotes(notes, updateCache = true) {
    if (updateCache) {
        window.currentNotesData = notes;
    }

    const listContainer = document.getElementById('notes-list');
    listContainer.innerHTML = '';

    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

    let filteredNotes = notes;
    if (searchTerm) {
        filteredNotes = notes.filter(n =>
            (n.title && n.title.toLowerCase().includes(searchTerm)) ||
            (n.content && n.content.toLowerCase().includes(searchTerm))
        );
    }

    if (filteredNotes.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state-message">
                ${searchTerm ? 'No se encontraron notas.' : 'No hay notas guardadas.'}
            </div>
        `;
        return;
    }

    // Ordenar por timestamp (más reciente primero)
    filteredNotes.sort((a, b) => {
        const timeA = a.timestamp && a.timestamp.toMillis ? a.timestamp.toMillis() : (a.timestamp || 0);
        const timeB = b.timestamp && b.timestamp.toMillis ? b.timestamp.toMillis() : (b.timestamp || 0);
        return timeB - timeA;
    });

    filteredNotes.forEach(note => {
        const dateRaw = note.timestamp && note.timestamp.toDate ? note.timestamp.toDate() : new Date(note.timestamp);
        const formattedDate = dateRaw.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

        const card = document.createElement('div');
        card.className = 'note-card';
        card.setAttribute('data-id', note.id);

        // Añadir evento click para abrir modal (evitando botones de acción)
        card.onclick = function (e) {
            if (!e.target.closest('button')) {
                window.openViewModal(note.id);
            }
        };

        const imageHtml = note.imageUrl ?
            `<img src="${note.imageUrl}" alt="Thumbnail" class="note-image-thumbnail">` : '';

        const noteHtml = `
            ${imageHtml}
            <div class="note-header">
                <div class="note-title-container">
                    <h3 class="note-card-title" title="${note.title}">${note.title}</h3>
                </div>
                <span class="note-date-badge">
                    ${formattedDate}
                </span>
            </div>
            
            <div class="note-card-content line-clamp-3">
                ${note.content || '<span class="italic opacity-50">Sin contenido...</span>'}
            </div>

            <div class="note-actions">
                <button data-action="edit" data-id="${note.id}"
                    class="note-action-btn edit" 
                    title="Editar nota">
                    <i class="ph ph-pencil-simple text-lg pointer-events-none"></i>
                </button>
                <button data-action="delete" data-id="${note.id}"
                    class="note-action-btn delete" 
                    title="Eliminar nota">
                    <i class="ph ph-trash text-lg pointer-events-none"></i>
                </button>
            </div>
        `;

        card.innerHTML = noteHtml;
        listContainer.appendChild(card);
    });

    // Actualizar efectos visuales una vez renderizado
    setTimeout(updateCardBorderOpacity, 50);
}

/**
 * Actualiza la opacidad del borde superior de las tarjetas basada en su posición.
 */
/**
 * Actualiza la opacidad del borde superior de las tarjetas.
 */
function updateCardBorderOpacity() {
    // Tarjetas de Notas (Border TOP por posición en el contenedor con scroll)
    const elements = document.querySelectorAll('.note-card');

    // Obtener el contenedor con scroll
    const scrollContainer = document.querySelector('#notes-list-container .card-inner-content');
    if (!scrollContainer) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const containerTop = containerRect.top;
    const containerHeight = containerRect.height;

    elements.forEach(element => {
        const rect = element.getBoundingClientRect();
        const elementTop = rect.top;

        // Calcular la distancia desde el top del contenedor
        const distanceFromContainerTop = elementTop - containerTop;

        let opacity = 0;

        // Solo aplicar opacidad si el elemento está visible dentro del contenedor
        if (distanceFromContainerTop < containerHeight && distanceFromContainerTop > -rect.height) {
            // Normalizar la posición: 0 en el top del contenedor, 1 en el 70% del contenedor
            const normalizedPosition = Math.max(0, Math.min(1, distanceFromContainerTop / (containerHeight * 0.7)));
            opacity = 1 - normalizedPosition;
            opacity = 0.2 + (opacity * 0.8); // Rango de 0.2 a 1.0
        }

        element.style.borderTopColor = `rgba(255, 255, 255, ${opacity})`;
    });
}

/**
 * Maneja los clicks en los botones de acción de las notas.
 * @param {Event} e - Evento de click
 */
function handleNoteActions(e) {
    const button = e.target.closest('button[data-action][data-id]');
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    if (action === 'delete') {
        window.deleteNote(id);
    } else if (action === 'edit') {
        window.editNote(id);
    }
}

// ====================================================================
// FUNCIONES DE BÚSQUEDA
// ====================================================================

/**
 * Alterna la visibilidad de la barra de búsqueda.
 */
window.toggleSearch = function () {
    const searchContainer = document.getElementById('search-container');
    const searchInput = document.getElementById('search-input');

    if (searchContainer && searchInput) {
        const isHidden = searchContainer.classList.contains('hidden');
        if (isHidden) {
            searchContainer.classList.remove('hidden');
            searchInput.focus();
        } else {
            searchContainer.classList.add('hidden');
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input'));
        }
    }
}

// ====================================================================
// FUNCIONES DE FORMULARIO
// ====================================================================

/**
 * Alterna la visibilidad del formulario de nueva nota.
 */
window.toggleNewNoteForm = function () {
    const card = document.getElementById('new-note-card');
    const listContainer = document.getElementById('notes-list-container');
    const fab = document.getElementById('show-note-form-fab');

    if (!card || !fab) return;

    const isHidden = card.classList.contains('hidden');

    if (isHidden) {
        card.classList.remove('hidden');
        if (listContainer) listContainer.classList.add('hidden'); // Hide list

        fab.classList.add('rotate-45');
        fab.querySelector('i').classList.replace('ph-plus', 'ph-x');
        // card.scrollIntoView({ behavior: 'smooth', block: 'start' }); // No scroll needed
    } else {
        card.classList.add('hidden');
        if (listContainer) listContainer.classList.remove('hidden'); // Show list

        fab.classList.remove('rotate-45');
        fab.querySelector('i').classList.replace('ph-x', 'ph-plus');

        // Si cerramos el formulario y estaba en modo edición, reseteamos
        if (document.getElementById('note-id').value) {
            resetForm();
        }
    }
}

// ====================================================================
// INICIALIZACIÓN
// ====================================================================

window.addEventListener('load', () => {
    // Aplicar tema guardado
    if (typeof window.applyColorMode === 'function') {
        window.applyColorMode();
    }

    // Listener para cambios de tema
    window.addEventListener('storage', (e) => {
        if (e.key === 'portis-theme') {
            if (typeof window.applyColorMode === 'function') {
                window.applyColorMode();
            }
        }
    });

    // Inicializar autenticación y datos
    checkAuthenticationAndSetup();

    // Event listener para acciones de notas
    const listContainer = document.getElementById('notes-list');
    if (listContainer) {
        listContainer.addEventListener('click', handleNoteActions);
    }

    // Event listener para búsqueda
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (window.currentNotesData) {
                renderNotes(window.currentNotesData, false);
            }
        });
    }

    // Ejecutar al hacer scroll en todos los contenedores relevantes
    window.addEventListener('scroll', updateCardBorderOpacity, { passive: true });

    const appContent = document.getElementById('app-content');
    if (appContent) {
        appContent.addEventListener('scroll', updateCardBorderOpacity, { passive: true });
    }

    // Escuchar scroll del contenedor interno de notas
    const scrollContainer = document.querySelector('.card-container.inverted-split .card-inner-content');
    if (scrollContainer) {
        scrollContainer.addEventListener('scroll', updateCardBorderOpacity, { passive: true });
    }

    // Escuchar scroll en el contenedor de lista de notas
    const notesListContainer = document.querySelector('.card-inner-content');
    if (notesListContainer) {
        notesListContainer.addEventListener('scroll', updateCardBorderOpacity, { passive: true });
    }

    // Ejecutar una vez al cargar y al redimensionar
    setTimeout(updateCardBorderOpacity, 100);
    window.addEventListener('resize', updateCardBorderOpacity);
});

// Fin del archivo

