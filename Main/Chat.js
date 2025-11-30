// Se asume que Firebase (compatibilidad) está disponible globalmente desde Main.js.
// Se asume que Main.js ha establecido window.db y window.auth tras el login.

(function () { // ⬅️ INICIO: IIFE para aislar el ámbito y evitar conflictos de declaración.

    // ===============================================
    // 1. CONFIGURACIÓN Y VARIABLES LOCALES
    // ===============================================

    let currentRecipientId = null;
    // 🔑 CLAVE CRÍTICA: Almacenar la función de cancelación del listener de Firestore.
    let unsubscribeFromChat = null;

    // 🔑 CLAVE: Leemos la configuración de la ventana y la convertimos en una constante LOCAL
    const IS_MOCK_MODE = window.IS_MOCK_MODE;

    // 🔑 CLAVE: Obtener el userId de la sesión. Si no existe, usamos un mock temporal
    const userId = sessionStorage.getItem('portis-user-identifier') || 'mock_user_123';
    const MESSAGE_LIMIT = 50;
    const profileImagePath = '../assets/logo.png';

    let db = null; // Instancia de Firestore
    let isFirebaseReady = false;
    let lastRenderedDate = null;

    // --- [Funciones Auxiliares - showMessage, getChatId] ---

    function showMessage(type, message) {
        // Usamos la función global showAppMessage de config.js si está disponible
        if (typeof window.showAppMessage === 'function') {
            window.showAppMessage(message, type);
        } else {
            // Fallback: Lógica de muestra de mensajes local
            const appMessage = document.getElementById('app-message');
            if (appMessage) {
                appMessage.className = `message-box message-${type} fixed top-20 left-1/2 -translate-x-1/2 z-[1000] w-[90%] md:w-auto message-box-show`;
                appMessage.textContent = message;
                appMessage.style.display = 'block';
                setTimeout(() => {
                    appMessage.classList.remove('message-box-show');
                    setTimeout(() => appMessage.style.display = 'none', 300);
                }, 3000);
            }
            console.log(`[${type.toUpperCase()}] Notificación: ${message}`);
        }
    }

    function getChatId(otherUserId) {
        // Crea un ID de chat único y ordenado alfabéticamente
        // Esta estructura asegura que la conversación entre A y B es la misma que B y A.
        return [userId, otherUserId].sort().join('_');
    }

    // ----------------------------------------------------------------------------------
    // 🛑 FUNCIÓN CORREGIDA: Setup de Firebase (Compatibilidad) usando instancias globales
    // ----------------------------------------------------------------------------------
    async function setupFirebase() {
        if (IS_MOCK_MODE) {
            console.warn("Chat: MODO MOCK activado. Chat no persistente.");
            isFirebaseReady = true;
            return;
        }

        // 🚨 CRÍTICO: Usar las instancias globales proporcionadas por Main.js
        if (typeof window.firebaseReadyPromise !== 'undefined') {
            console.log("Chat: Esperando señal de Firebase Ready...");
            await window.firebaseReadyPromise;
        }

        if (typeof window.db !== 'undefined' && typeof firebase !== 'undefined') {
            db = window.db; // Asignamos la instancia global a la local
            isFirebaseReady = true;
            console.log(`Chat: Firestore conectado a través de window.db para el usuario ${userId}`);
            return;
        }

        // Si window.db no existe o no hay promesa, algo salió mal.
        console.error("Chat: window.db no está disponible. Fallback a Mock Mode.");
        showMessage('error', 'Error de base de datos. Usando modo simulado.');
        window.IS_MOCK_MODE = true;
        isFirebaseReady = true;
    }


    // ===============================================
    // 2. LÓGICA DE ALMACENAMIENTO Y LÍMITE (CAPPING)
    // ===============================================

    async function saveMessageAndApplyCapping(recipientId, text, timestamp) {
        if (!db || !isFirebaseReady || IS_MOCK_MODE) {
            console.warn("Firestore no está listo o está en Mock Mode. Mensaje no guardado.");
            return;
        }

        const chatId = getChatId(recipientId);
        // 🔑 CLAVE: Usar la API de compatibilidad: db.collection().doc().collection()
        const chatCollectionRef = db.collection('chats').doc(chatId).collection('messages');

        // Usamos el timestamp de Firebase globalmente
        const messageData = {
            senderId: userId,
            text: text,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            clientTimestamp: timestamp,
        };

        try {
            await chatCollectionRef.add(messageData);

            // Capping (eliminación de mensajes antiguos)
            const q = chatCollectionRef.orderBy('timestamp', 'asc').limit(MESSAGE_LIMIT + 1);
            const snapshot = await q.get(); // Usar .get() en la Query de compatibilidad

            if (snapshot.docs.length > MESSAGE_LIMIT) {
                const messagesToDelete = snapshot.docs.slice(0, snapshot.docs.length - MESSAGE_LIMIT);

                const batch = db.batch(); // Usar db.batch() de compatibilidad
                messagesToDelete.forEach(docToDelete => {
                    batch.delete(docToDelete.ref); // Usar la referencia del documento
                });

                await batch.commit();
                console.log(`Se eliminaron ${messagesToDelete.length} mensajes antiguos para mantener el límite de ${MESSAGE_LIMIT}.`);
            }

        } catch (error) {
            console.error("Error al enviar/guardar mensaje: ", error);
            showMessage('error', 'Error al enviar mensaje.');
        }
    }

    // ----------------------------------------------------------------------------------
    // 🚨 FUNCIÓN CRÍTICA: Listener en Tiempo Real
    // ----------------------------------------------------------------------------------
    function listenForChatMessages() {
        if (!db || !currentRecipientId || !isFirebaseReady || IS_MOCK_MODE) return;

        // 🛑 CRÍTICO: Si ya hay un listener activo, lo cerramos antes de abrir uno nuevo.
        if (unsubscribeFromChat) {
            unsubscribeFromChat();
            unsubscribeFromChat = null;
        }

        const chatId = getChatId(currentRecipientId);
        const messagesContainer = document.getElementById('chat-messages-container');
        if (messagesContainer) messagesContainer.innerHTML = '';

        // 🔑 CLAVE: Usar la API de compatibilidad y onSnapshot
        const chatCollectionRef = db.collection('chats').doc(chatId).collection('messages');
        const q = chatCollectionRef.orderBy('timestamp', 'asc').limit(MESSAGE_LIMIT);

        // 🚨 FUNCIÓN DE SUSCRIPCIÓN (onSnapshot)
        unsubscribeFromChat = q.onSnapshot(snapshot => {
            if (!messagesContainer) return;

            snapshot.docChanges().forEach(change => {
                if (change.type === "added") {
                    const data = change.doc.data();
                    const isCurrentUser = data.senderId === userId;

                    // Determinar el timestamp correcto
                    let timestamp = new Date();
                    if (data.timestamp && data.timestamp.toDate) {
                        timestamp = data.timestamp.toDate();
                    } else if (data.clientTimestamp) {
                        timestamp = new Date(data.clientTimestamp);
                    }

                    renderMessage(data.senderId, data.text, isCurrentUser, timestamp);
                }
            });

        }, error => {
            console.error("Error en el listener de chat: ", error);
            showMessage('error', 'Error de conexión en tiempo real con el chat.');
            // Intentar desuscribirse en caso de error
            if (unsubscribeFromChat) {
                unsubscribeFromChat();
                unsubscribeFromChat = null;
            }
        });

        console.log(`Listener de chat iniciado para el chat ID: ${chatId}`);
    }


    // ===============================================
    // 3. LÓGICA DE INTERFAZ Y EVENTOS
    // ===============================================

    // ===============================================
    // 2.5. LÓGICA DE SUBIDA DE IMÁGENES
    // ===============================================

    async function uploadImageToCloudinary(file) {
        const config = window.cloudinaryConfig;
        if (!config) {
            console.error("Configuración de Cloudinary no encontrada.");
            showMessage('error', 'Error de configuración de imágenes.');
            return null;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', config.uploadPreset);
        formData.append('cloud_name', config.cloudName);

        try {
            showMessage('success', 'Subiendo imagen...');
            const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Error en la subida a Cloudinary');
            }

            const data = await response.json();
            return data.secure_url;
        } catch (error) {
            console.error("Error subiendo imagen:", error);
            showMessage('error', 'Error al subir la imagen.');
            return null;
        }
    }

    function renderMessage(senderId, text, isCurrentUser, timestamp = new Date()) {
        const container = document.getElementById('chat-messages-container');
        if (!container) return;

        // Validación de fecha
        if (!(timestamp instanceof Date) || isNaN(timestamp.getTime())) {
            timestamp = new Date();
        }

        // Lógica de Separadores de Fecha
        const messageDate = timestamp.toLocaleDateString();
        if (lastRenderedDate !== messageDate) {
            let displayDate = messageDate;
            const today = new Date().toLocaleDateString();
            const yesterday = new Date(Date.now() - 86400000).toLocaleDateString();

            if (messageDate === today) displayDate = 'Hoy';
            else if (messageDate === yesterday) displayDate = 'Ayer';

            const separatorHtml = `
                <div class="flex justify-center my-4">
                    <span class="text-xs font-medium px-3 py-1 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                        ${displayDate}
                    </span>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', separatorHtml);
            lastRenderedDate = messageDate;
        }

        const messageClass = isCurrentUser ? 'bg-red-600 ml-auto' : 'bg-gray-700 mr-auto';
        const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Detectar si es una imagen de Cloudinary
        const isImage = text.includes('res.cloudinary.com');

        let contentHtml = `<p class="text-sm">${text}</p>`;

        if (isImage) {
            contentHtml = `
                <div class="image-message">
                    <img src="${text}" alt="Imagen enviada" class="rounded-lg max-w-full h-auto cursor-pointer" onclick="window.open('${text}', '_blank')">
                </div>
            `;
        }

        const messageHtml = `
            <div class="flex ${isCurrentUser ? 'justify-end' : 'justify-start'}">
                <div class="max-w-xs md:max-w-md p-3 rounded-xl ${messageClass} shadow-md" style="color: var(--color-text-light);">
                    ${contentHtml}
                    <span class="text-xs opacity-75 block mt-1 text-right">${timeString}</span>
                </div>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', messageHtml);
        container.scrollTop = container.scrollHeight;
    }

    // ----------------------------------------------------------------------------------
    // 🛑 FUNCIÓN MODIFICADA: Ahora inicia el listener en tiempo real.
    // ----------------------------------------------------------------------------------
    window.openChatModal = function (recipientId, recipientName) {
        currentRecipientId = recipientId;
        lastRenderedDate = null; // Resetear fecha al abrir chat

        const recipientNameEl = document.getElementById('chat-recipient-name');
        const messagesContainer = document.getElementById('chat-messages-container');

        if (recipientNameEl) recipientNameEl.textContent = recipientName;
        if (messagesContainer) messagesContainer.innerHTML = '';

        // Usamos la función global showModal definida en Main.js
        if (typeof window.showModal === 'function') {
            window.showModal('message-modal');
        }

        if (!IS_MOCK_MODE && isFirebaseReady) {
            // 🚨 CRÍTICO: Iniciamos el listener
            listenForChatMessages();
        } else {
            // Lógica de Mock Mode
            renderMessage('System', '⚠️ MOCK MODE. Mensajes no persistentes.', false, new Date(Date.now() - 60000));
            renderMessage(recipientId, 'Hola, ' + recipientName + ', ¿cómo estás?', false, new Date(Date.now() - 30000));
            renderMessage(userId, '¡Todo bien! Probando el chat simulado.', true);
        }
    }

    // ----------------------------------------------------------------------------------
    // 🚨 FUNCIÓN CRÍTICA: Para cerrar el modal y el listener
    // ----------------------------------------------------------------------------------
    window.closeChatModal = function () {
        // 🔑 Desuscribirse del listener para liberar recursos de Firebase
        if (unsubscribeFromChat) {
            unsubscribeFromChat();
            unsubscribeFromChat = null;
            console.log("Listener de chat desuscripto.");
        }

        currentRecipientId = null; // Limpiar el destinatario

        // Usamos la función global closeModal, asumiendo que existe en Main.js
        if (typeof window.closeModal === 'function') {
            window.closeModal('message-modal');
        }
    };


    function sendMessage(e) {
        // 🛑 Protección contra envíos de formulario si el botón está dentro de un <form>
        if (e && e.preventDefault) {
            e.preventDefault();
        }

        const input = document.getElementById('chat-input');
        if (!input || !currentRecipientId) return;

        const text = input.value.trim();
        if (text === '') return;

        const timestamp = new Date();

        // En modo Real-Time, solo renderizamos en Mock Mode.
        if (IS_MOCK_MODE) {
            renderMessage(userId, text, true, timestamp);
        }

        input.value = '';

        if (!IS_MOCK_MODE && isFirebaseReady) {
            // El onSnapshot se encargará de renderizar este mensaje después de guardarse
            saveMessageAndApplyCapping(currentRecipientId, text, timestamp);
        } else if (IS_MOCK_MODE) {
            console.log(`Mensaje enviado a ${currentRecipientId} (Mock Mode): ${text}`);
            // En mock mode, la función renderMessage ya se encargó de mostrarlo.
        }
    }

    // ===============================================
    // 4. INICIALIZACIÓN Y CARGA DE USUARIOS
    // ===============================================

    async function loadUsers() {
        const userListContainer = document.getElementById('user-list-container');
        if (!userListContainer) return;

        let users = [];

        if (IS_MOCK_MODE || !isFirebaseReady) {
            console.log("Cargando usuarios en MODO MOCK.");
            users = [
                { id: 'Alfonso_Perez_UID', name: 'Alfonso Pérez' },
                { id: 'Beatriz_Lopez_UID', name: 'Beatriz López' },
                { id: 'Carlos_Martin_UID', name: 'Carlos Martín' }
            ];
            // Aseguramos que el usuario actual no esté en la lista, incluso en mock
            users = users.filter(user => user.id !== userId);
        } else {
            console.log("Cargando usuarios REALES de Firestore.");
            try {
                // 🔑 CLAVE: Usar la API de compatibilidad para colecciones
                const usersCollectionRef = db.collection('users');
                const snapshot = await usersCollectionRef.get();

                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (doc.id !== userId) {
                        users.push({
                            id: doc.id,
                            // 🛑 CORRECCIÓN: Preferir 'username', luego 'displayName', y finalmente un fallback
                            name: data.username || data.displayName || `Usuario ${doc.id.substring(0, 6)}`
                        });
                    }
                });
            } catch (error) {
                console.error("Error al cargar usuarios reales: ", error);
                showMessage('error', 'Error al cargar la lista de contactos. (Verifique permisos)');
                return;
            }
        }

        userListContainer.innerHTML = users.map(user => `
            <div class="flex items-center p-3 rounded-xl cursor-pointer hover:bg-white/10 transition" 
                 style="background-color: var(--color-bg-secondary);" 
                 onclick="openChatModal('${user.id}', '${user.name}')">
                
                <div class="w-10 h-10 rounded-full bg-red-800 flex items-center justify-center font-bold mr-4 overflow-hidden">
                    <img src="${profileImagePath}" alt="${user.name.charAt(0)}" class="w-full h-full object-cover">
                </div>
                
                <p class="font-semibold user-chat-item-name">${user.name}</p>
                </div>
        `).join('');
    }


    // ===============================================
    // 5. INICIALIZACIÓN Y LISTENERS
    // ===============================================

    function initChat() {
        // 🔑 Aplicar el tema
        if (typeof window.applyColorMode === 'function') {
            window.applyColorMode();
        }

        // 🔑 Setup de Firebase antes de cargar usuarios
        setupFirebase().then(() => {
            loadUsers();
        });

        const chatInput = document.getElementById('chat-input');

        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendMessage(e); // 🛑 Pasamos el evento para el preventDefault
                    e.preventDefault();
                }
            });
        }

        // Listeners para imagen
        const imageBtn = document.getElementById('chat-image-btn');
        const imageInput = document.getElementById('chat-image-input');

        if (imageBtn && imageInput) {
            imageBtn.addEventListener('click', () => {
                imageInput.click();
            });

            imageInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                // Validar tipo
                if (!file.type.startsWith('image/')) {
                    showMessage('error', 'Solo se permiten imágenes.');
                    return;
                }

                // Subir imagen
                const imageUrl = await uploadImageToCloudinary(file);

                if (imageUrl && currentRecipientId) {
                    const timestamp = new Date();

                    if (IS_MOCK_MODE) {
                        renderMessage(userId, imageUrl, true, timestamp);
                    } else if (isFirebaseReady) {
                        saveMessageAndApplyCapping(currentRecipientId, imageUrl, timestamp);
                    }

                    // Limpiar input
                    imageInput.value = '';
                }
            });
        }

        console.log('Chat inicializado. Flujo de inicialización asegurado.');
    }

    // Exponer acciones del chat para Buttons.js
    window.ChatActions = {
        sendMessage: (e) => sendMessage(e),
        closeChatModal: () => window.closeChatModal()
    };

    // Hacer la función de inicialización global
    window.initChat = initChat;

})(); // ⬅️ FIN: Cierra la IIFE