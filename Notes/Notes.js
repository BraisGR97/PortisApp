/**
 * ====================================================================
 * Notes.js - Lógica para la Gestión de Notas
 * ====================================================================
 */

// -----------------------------------------------------------------
// 1. CONFIGURACIÓN Y VARIABLES GLOBALES
// -----------------------------------------------------------------
const firebaseConfig = window.firebaseConfig;
const IS_MOCK_MODE = window.IS_MOCK_MODE;

if (IS_MOCK_MODE) {
    console.warn("Modo MOCK: Las operaciones de Firestore serán simuladas.");
}

const appId = firebaseConfig ? firebaseConfig.projectId : 'mock-app-id';

let app;
let db;
let auth;
let userId = null;
let isAuthReady = false;

// Clave para guardar las notas en localStorage en Mock Mode
const MOCK_NOTES_STORAGE_KEY = 'mock_notes_data';

// Cache de datos para búsqueda
window.currentNotesData = [];

/**
 * Función auxiliar para obtener las notas mock guardadas.
 */
function getLocalMockNotes() {
    try {
        const storedNotes = localStorage.getItem(MOCK_NOTES_STORAGE_KEY);
        return storedNotes ? JSON.parse(storedNotes) : [];
    } catch (e) {
        console.error("Error al leer notas mock de localStorage:", e);
        return [];
    }
}

/**
 * Función auxiliar para guardar las notas mock en localStorage.
 */
function saveLocalMockNotes(notes) {
    if (!IS_MOCK_MODE) return;
    try {
        localStorage.setItem(MOCK_NOTES_STORAGE_KEY, JSON.stringify(notes));
    } catch (e) {
        console.error("Error al guardar notas mock en localStorage:", e);
    }
}


// -----------------------------------------------------------------

/**
 * Valida la sesión y prepara la UI.
 */
function checkAuthenticationAndSetup() {
    userId = sessionStorage.getItem('portis-user-identifier');
    const userDisplayName = sessionStorage.getItem('portis-user-display-name');
    const displayElement = document.getElementById('current-user-display');

    if (!userId || !userDisplayName) {
        console.warn("Sesión no válida o caducada. Redirigiendo a Index.");
        window.location.href = '../index.html';
        return;
    }

    if (displayElement) {
        displayElement.textContent = userDisplayName;
    }

    if (IS_MOCK_MODE) {
        console.warn("Modo MOCK activado. Usando datos no persistentes.");
        isAuthReady = true;

        let mockNotes = getLocalMockNotes();

        if (mockNotes.length === 0) {
            console.log("Creando datos mock iniciales por primera vez.");
            mockNotes = [
                { id: 'n1', title: 'Bienvenida', content: 'Esta es tu primera nota. Puedes editarla o borrarla.', timestamp: Date.now() },
                { id: 'n2', title: 'Lista de Tareas', content: '- Comprar leche\n- Llamar al fontanero\n- Revisar facturas', timestamp: Date.now() - 10000 },
            ];
            saveLocalMockNotes(mockNotes);
        }

        renderNotes(mockNotes);

    } else {
        initializeAppAndAuth();
    }

    document.getElementById('new-note-form').addEventListener('submit', saveNote);
}


/**
 * Inicializa Firebase, y establece el listener de estado.
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
                console.warn("Firebase no detecta sesión activa. Redirigiendo.");
                window.location.href = '../index.html';
            }
        });

    } catch (error) {
        console.error("Error al inicializar Firebase o al autenticar:", error);
        document.getElementById('notes-list').innerHTML = `
            <div class="message-error p-3 mt-4 text-red-400 bg-red-900/40 border border-red-900 rounded-lg">
                Error de conexión. No se pudo cargar el módulo de datos.
            </div>
        `;
    }
}

// -----------------------------------------------------------------
// 4. FUNCIONES DE FIREBASE (CRUD)
// -----------------------------------------------------------------

function getNotesCollectionRef() {
    if (!db || !userId) return null;
    return db.collection(`users/${userId}/notes`);
}

/**
 * Añade o Actualiza una nota.
 */
async function saveNote(e) {
    e.preventDefault();
    if (!isAuthReady || !userId) return console.warn("Autenticación no lista.");

    const form = document.getElementById('new-note-form');
    const submitButton = document.getElementById('save-note-btn');
    const idInput = document.getElementById('note-id');
    const editId = idInput.value;

    const title = document.getElementById('title').value.trim();
    const content = document.getElementById('content').value.trim();

    if (!title) return;

    submitButton.innerHTML = '<i class="ph ph-circle-notch animate-spin mr-2"></i> Guardando...';
    submitButton.disabled = true;

    const noteData = {
        title,
        content,
        userId: userId,
        timestamp: editId ? (IS_MOCK_MODE ? Date.now() : firebase.firestore.FieldValue.serverTimestamp()) : (IS_MOCK_MODE ? Date.now() : firebase.firestore.FieldValue.serverTimestamp())
    };

    // Si es edición, no sobrescribimos el timestamp de creación si quisiéramos mantenerlo, 
    // pero para ordenamiento por "última modificación" es mejor actualizarlo.
    // En este caso, actualizaremos el timestamp para que suba arriba.

    if (IS_MOCK_MODE) {
        let mockNotes = getLocalMockNotes();

        if (editId) {
            // Editar
            const index = mockNotes.findIndex(n => n.id === editId);
            if (index !== -1) {
                mockNotes[index] = { ...mockNotes[index], ...noteData, timestamp: Date.now() };
                console.log('Modo Mock: Nota actualizada.');
            }
        } else {
            // Crear
            const newNote = {
                id: 'n' + Date.now(),
                ...noteData,
                timestamp: Date.now()
            };
            mockNotes.unshift(newNote);
            console.log('Modo Mock: Nota creada.');
        }

        saveLocalMockNotes(mockNotes);
        renderNotes(mockNotes);

        await new Promise(resolve => setTimeout(resolve, 500));
        resetForm();
        window.toggleNewNoteForm();

    } else {
        // Modo Real
        try {
            const notesRef = getNotesCollectionRef();
            if (!notesRef) return;

            if (editId) {
                await notesRef.doc(editId).update({
                    title,
                    content,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log("Nota actualizada con éxito.");
            } else {
                await notesRef.add(noteData);
                console.log("Nota creada con éxito.");
            }

            resetForm();
            window.toggleNewNoteForm();

        } catch (error) {
            console.error("Error al guardar la nota:", error);
            alert("Error al guardar la nota. Inténtalo de nuevo.");
        }
    }

    submitButton.innerHTML = '<i class="ph ph-floppy-disk mr-2"></i> Guardar Nota';
    submitButton.disabled = false;
}

/**
 * Elimina una nota.
 */
window.deleteNote = async function (id) {
    if (!isAuthReady || !userId) return console.warn("Autenticación no lista.");

    if (!confirm("¿Estás seguro de que quieres eliminar esta nota?")) {
        return;
    }

    const noteElement = document.querySelector(`.note-card[data-id="${id}"]`);
    if (noteElement) {
        noteElement.classList.add('opacity-0', 'transform', '-translate-x-full');
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    if (IS_MOCK_MODE) {
        let mockNotes = getLocalMockNotes();
        mockNotes = mockNotes.filter(n => n.id !== id);
        saveLocalMockNotes(mockNotes);
        renderNotes(mockNotes);
    } else {
        try {
            const notesRef = getNotesCollectionRef();
            if (notesRef) {
                await notesRef.doc(id).delete();
            }
        } catch (error) {
            console.error("Error al eliminar la nota:", error);
            if (noteElement) {
                noteElement.classList.remove('opacity-0', 'transform', '-translate-x-full');
            }
        }
    }
}

/**
 * Prepara el formulario para editar una nota.
 */
window.editNote = function (id) {
    const notes = window.currentNotesData;
    const note = notes.find(n => n.id === id);

    if (!note) return;

    // Rellenar formulario
    document.getElementById('note-id').value = note.id;
    document.getElementById('title').value = note.title;
    document.getElementById('content').value = note.content || '';

    // Cambiar UI del formulario
    document.getElementById('form-title').innerHTML = `
        <i class="ph ph-pencil-simple" style="color: var(--color-accent-blue);"></i>
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

window.cancelEdit = function () {
    resetForm();
    // Si el formulario estaba abierto solo para editar, podríamos cerrarlo, 
    // pero mejor dejarlo abierto limpio o cerrarlo según UX. 
    // Aquí lo dejaremos abierto pero limpio, o podemos cerrarlo.
    // Vamos a cerrarlo para volver al estado inicial.
    window.toggleNewNoteForm();
}

function resetForm() {
    const form = document.getElementById('new-note-form');
    form.reset();
    document.getElementById('note-id').value = '';

    document.getElementById('form-title').innerHTML = `
        <i class="ph ph-notebook" style="color: var(--color-accent-red);"></i>
        Nueva Nota
    `;
    document.getElementById('save-note-btn').innerHTML = '<i class="ph ph-floppy-disk mr-2"></i> Guardar Nota';
    document.getElementById('cancel-edit-btn').classList.add('hidden');
}

// -----------------------------------------------------------------
// 5. RENDERIZADO Y LISTENERS DE UI
// -----------------------------------------------------------------

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
            <div class="p-4 text-center rounded-lg" style="background-color: var(--color-bg-secondary); color: var(--color-text-secondary);">
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
        card.className = 'note-card p-5 rounded-xl shadow-sm border relative group cursor-pointer transition-all duration-200 hover:shadow-md';
        card.setAttribute('data-id', note.id);
        card.style.backgroundColor = 'var(--color-bg-secondary)';
        card.style.borderColor = 'var(--color-border)';

        const noteHtml = `
            <div class="flex justify-between items-start mb-2">
                <h3 class="font-bold text-xl truncate pr-8" style="color: var(--color-text-primary);">${note.title}</h3>
                <span class="text-xs font-medium px-2 py-1 rounded-full text-gray-500 bg-gray-100 dark:bg-gray-800">
                    ${formattedDate}
                </span>
            </div>
            
            <div class="text-sm mb-4 whitespace-pre-line" style="color: var(--color-text-secondary); min-height: 40px;">
                ${note.content || '<span class="italic opacity-50">Sin contenido...</span>'}
            </div>

            <div class="flex justify-end items-center pt-3 border-t gap-2" style="border-color: var(--color-border);">
                <button data-action="edit" data-id="${note.id}"
                    class="action-btn edit-btn p-2 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-blue-500" 
                    title="Editar nota">
                    <i class="ph ph-pencil-simple text-lg pointer-events-none"></i>
                </button>
                <button data-action="delete" data-id="${note.id}"
                    class="action-btn delete-btn p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-red-500" 
                    title="Eliminar nota">
                    <i class="ph ph-trash text-lg pointer-events-none"></i>
                </button>
            </div>
        `;

        card.innerHTML = noteHtml;
        listContainer.appendChild(card);
    });
}

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
        console.error("Error en la conexión en tiempo real:", error);
    });
}

window.toggleNewNoteForm = function () {
    const card = document.getElementById('new-note-card');
    const fab = document.getElementById('show-note-form-fab');

    if (!card || !fab) return;

    const isHidden = card.classList.contains('hidden');

    if (isHidden) {
        card.classList.remove('hidden');
        fab.classList.add('rotate-45');
        fab.querySelector('i').classList.replace('ph-plus', 'ph-x');
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        card.classList.add('hidden');
        fab.classList.remove('rotate-45');
        fab.querySelector('i').classList.replace('ph-x', 'ph-plus');

        // Si cerramos el formulario y estaba en modo edición, reseteamos
        if (document.getElementById('note-id').value) {
            resetForm();
        }
    }
}

// --- Ejecución ---
window.addEventListener('load', () => {
    if (typeof window.applyColorMode === 'function') {
        window.applyColorMode();
    }

    window.addEventListener('storage', (e) => {
        if (e.key === 'portis-theme') {
            if (typeof window.applyColorMode === 'function') {
                window.applyColorMode();
            }
        }
    });

    checkAuthenticationAndSetup();

    const listContainer = document.getElementById('notes-list');
    if (listContainer) {
        listContainer.addEventListener('click', handleNoteActions);
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (window.currentNotesData) {
                renderNotes(window.currentNotesData, false);
            }
        });
    }
});
