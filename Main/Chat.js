// ===================================================================================
// Chat.js - Lógica del Chat
// ===================================================================================

// Se asume que Firebase (compatibilidad) está disponible globalmente desde Main.js.
// Se asume que Main.js ha establecido window.db y window.auth tras el login.

(function () { // ⬅️ INICIO: IIFE para aislar el ámbito y evitar conflictos de declaración.

    // ===============================================
    // 1. CONFIGURACIÓN Y VARIABLES LOCALES
    // ===============================================

    let currentRecipientId = null;
    // 🔑 CLAVE CRÍTICA: Almacenar la función de cancelación del listener de Firestore.
    let unsubscribeFromChat = null;

    // 🔑 CLAVE: Obtener el userId de la sesión.
    const userId = sessionStorage.getItem('portis-user-identifier');
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
        console.error("Chat: window.db no está disponible.");
        showMessage('error', 'Error de base de datos. Intente recargar.');
    }


    // ===============================================
    // 2. LÓGICA DE ALMACENAMIENTO Y LÍMITE (CAPPING)
    // ===============================================

    async function saveMessageAndApplyCapping(recipientId, text, timestamp) {
        if (!db || !isFirebaseReady) {
            console.warn("Firestore no está listo. Mensaje no guardado.");
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
        if (!db || !currentRecipientId || !isFirebaseReady) return;

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

        if (isFirebaseReady) {
            // 🚨 CRÍTICO: Iniciamos el listener
            listenForChatMessages();
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

        input.value = '';

        if (isFirebaseReady) {
            // El onSnapshot se encargará de renderizar este mensaje después de guardarse
            saveMessageAndApplyCapping(currentRecipientId, text, timestamp);
        }
    }

    // ===============================================
    // 4. INICIALIZACIÓN Y CARGA DE USUARIOS
    // ===============================================

    async function loadUsers() {
        const userListContainer = document.getElementById('user-list-container');
        if (!userListContainer) return;

        let users = [];

        if (!isFirebaseReady) {
            console.warn("Carga de usuarios abortada: Firebase no listo.");
            return;
        }

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
                        name: data.username || data.displayName || `Usuario ${doc.id.substring(0, 6)}`,
                        photoURL: data.photoURL // << ADD THIS LINE
                    });
                }
            });
        } catch (error) {
            console.error("Error al cargar usuarios reales: ", error);
            showMessage('error', 'Error al cargar la lista de contactos. (Verifique permisos)');
            return;
        }


        userListContainer.innerHTML = users.map(user => `
            <div class="user-chat-card flex items-center p-3 rounded-xl cursor-pointer transition" 
                 onclick="openChatModal('${user.id}', '${user.name}')">
                
                <div class="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center font-bold mr-4 overflow-hidden border border-gray-300 dark:border-gray-600">
                    <img src="${user.photoURL || profileImagePath}" alt="${user.name.charAt(0)}" class="w-full h-full object-cover">
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

                    if (isFirebaseReady) {
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

    // ----------------------------------------------------------------------------------
    // MODAL DE CHAT (Inyectado dinámicamente si no existe)
    // ----------------------------------------------------------------------------------
    // Verificamos si el modal ya existe en el DOM, si no, lo creamos.
    // Esto asegura que el modal esté disponible incluso si Main.html no lo tiene explícitamente.
    if (!document.getElementById('message-modal')) {
        const modalHtml = `
        <div id="message-modal" class="fixed inset-0 z-50 hidden bg-black bg-opacity-70 flex justify-center items-end sm:items-center transition-opacity duration-300 modal-backdrop">
            <div class="modal-content w-full h-[90vh] sm:h-[80vh] sm:max-w-md bg-white dark:bg-[#1f1f33] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                
                <!-- Header -->
                <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-[#2a2a3e]">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-sm">
                            <i class="ph-fill ph-user text-xl"></i>
                        </div>
                        <div>
                            <h3 id="chat-recipient-name" class="font-bold text-lg leading-tight">Usuario</h3>
                            <span class="text-xs text-green-500 flex items-center gap-1">
                                <span class="w-2 h-2 rounded-full bg-green-500"></span> En línea
                            </span>
                        </div>
                    </div>
                    <button onclick="window.closeChatModal()" class="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400">
                        <i class="ph ph-x text-xl"></i>
                    </button>
                </div>

                <!-- Messages Area -->
                <div id="chat-messages-container" class="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-100 dark:bg-[#12121e]">
                    <!-- Mensajes se insertan aquí -->
                </div>

                <!-- Input Area -->
                <div class="p-3 bg-white dark:bg-[#1f1f33] border-t border-gray-200 dark:border-gray-700">
                    <div class="flex items-center gap-2 bg-gray-100 dark:bg-[#12121e] p-1.5 rounded-full border border-gray-200 dark:border-gray-700 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                        
                        <button id="chat-image-btn" class="p-2 rounded-full text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                            <i class="ph ph-image text-xl"></i>
                        </button>
                        <input type="file" id="chat-image-input" accept="image/*" class="hidden">

                        <input type="text" id="chat-input" placeholder="Escribe un mensaje..." 
                            class="flex-1 bg-transparent border-none focus:ring-0 text-sm px-2 py-2 text-gray-700 dark:text-gray-200 placeholder-gray-400">
                        
                        <button onclick="window.ChatActions.sendMessage(event)" class="p-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-transform active:scale-95 flex items-center justify-center">
                            <i class="ph-bold ph-paper-plane-right text-lg"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

})(); // ⬅️ FIN: Cierra la IIFE
