// Se asume que Firebase (compatibilidad) está disponible globalmente desde Main.js.
// Se asume que Main.js ha establecido window.db y window.auth tras el login.

(function () { // ⬅️ INICIO: IIFE para aislar el ámbito y evitar conflictos de declaración.

    // ===============================================
    // 1. CONFIGURACIÓN Y VARIABLES LOCALES
    // ===============================================

    let currentRecipientId = null;
    // 🔑 CLAVE CRÍTICA: Almacenar la función de cancelación del listener de Firestore.
    let unsubscribeFromChat = null;

    // 🔑 CLAVE: Función helper para obtener userId dinámicamente
    function getUserId() {
        return sessionStorage.getItem('portis-user-identifier') || (window.auth && window.auth.currentUser ? window.auth.currentUser.uid : null);
    }

    // const userId removed to avoid stale values
    // Replaced with getUserId() in code

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
        }
    }

    function getChatId(otherUserId) {
        // Crea un ID de chat único y ordenado alfabéticamente
        // Esta estructura asegura que la conversación entre A y B es la misma que B y A.
        return [getUserId(), otherUserId].sort().join('_');
    }

    // ----------------------------------------------------------------------------------
    // 🛑 FUNCIÓN CORREGIDA: Setup de Firebase (Compatibilidad) usando instancias globales
    // ----------------------------------------------------------------------------------
    async function setupFirebase() {
        // 🚨 CRÍTICO: Usar las instancias globales proporcionadas por Main.js
        if (typeof window.firebaseReadyPromise !== 'undefined') {
            await window.firebaseReadyPromise;
        }

        if (typeof window.db !== 'undefined' && typeof firebase !== 'undefined') {
            db = window.db; // Asignamos la instancia global a la local
            isFirebaseReady = true;
            return;
        }

        // Si window.db no existe o no hay promesa, algo salió mal.
        showMessage('error', 'Error de base de datos. Usando modo simulado.');
        isFirebaseReady = true;
    }


    // ===============================================
    // 2. LÓGICA DE ALMACENAMIENTO Y LÍMITE (CAPPING)
    // ===============================================

    async function saveMessageAndApplyCapping(recipientId, text, timestamp) {
        if (!db || !isFirebaseReady) {
            return;
        }

        const chatId = getChatId(recipientId);
        // 🔑 CLAVE: Usar la API de compatibilidad: db.collection().doc().collection()
        const chatCollectionRef = db.collection('chats').doc(chatId).collection('messages');

        // Usamos el timestamp de Firebase globalmente
        const messageData = {
            senderId: getUserId(),
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
            }

        } catch (error) {
            showMessage('error', 'Error al enviar mensaje.');
        }
    }

    // ----------------------------------------------------------------------------------
    // 🚨 FUNCIÓN CRÍTICA: Listener en Tiempo Real
    // ----------------------------------------------------------------------------------
    // ----------------------------------------------------------------------------------
    // REEMPLAZO DE LISTENER: Ordenamiento Cliente-Side Robusto
    // ----------------------------------------------------------------------------------
    function listenForChatMessages() {
        if (!db || !currentRecipientId || !isFirebaseReady) return;

        if (unsubscribeFromChat) {
            unsubscribeFromChat();
            unsubscribeFromChat = null;
        }

        const chatId = getChatId(currentRecipientId);
        const messagesContainer = document.getElementById('chat-messages-container');
        if (messagesContainer) messagesContainer.innerHTML = '';
        lastRenderedDate = null; // Resetear fechas

        const chatCollectionRef = db.collection('chats').doc(chatId).collection('messages');
        const q = chatCollectionRef.orderBy('timestamp', 'asc').limit(MESSAGE_LIMIT);

        unsubscribeFromChat = q.onSnapshot(snapshot => {
            if (!messagesContainer) return;

            // 1. Convertir docs a objetos manejables para ordenar
            const messages = snapshot.docs.map(doc => {
                const data = doc.data();

                // Determinar timestamp efectivo
                let timestamp;
                // Si timestamp es null (escritura pendiente), asumimos "ahora" para que vaya al final
                if (data.timestamp === null) {
                    timestamp = new Date();
                } else if (data.timestamp && data.timestamp.toDate) {
                    timestamp = data.timestamp.toDate();
                } else if (data.clientTimestamp) {
                    timestamp = new Date(data.clientTimestamp);
                } else {
                    timestamp = new Date(0); // Fallback
                }

                return {
                    id: doc.id,
                    senderId: data.senderId,
                    text: data.text,
                    timestamp: timestamp,
                    // Flag para saber si es mío (útil para alineación)
                    isCurrentUser: data.senderId === getUserId()
                };
            });

            // 2. Ordenar en cliente (ASC: Más viejo -> Más nuevo)
            messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

            // 3. Renderizar TODO de nuevo para garantizar el orden correcto
            // (Es menos eficiente que docChanges pero garantiza consistencia visual instantánea)
            messagesContainer.innerHTML = '';
            lastRenderedDate = null;

            messages.forEach(msg => {
                renderMessage(msg.senderId, msg.text, msg.isCurrentUser, msg.timestamp);
            });

        }, error => {
            console.error("Error en chat listener:", error);
            // Intentar reconectar o manejar error silenciosamente
        });
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
            showMessage('error', 'Error config imágenes (window.cloudinaryConfig missing).');
            console.error("Falta window.cloudinaryConfig");
            return null;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', config.uploadPreset);
        // cloud_name optional in body if in URL, but good for completeness
        // formData.append('cloud_name', config.cloudName); 

        try {
            showMessage('success', 'Subiendo imagen...');
            const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error?.message || response.statusText;
                console.error("Cloudinary Error:", errorData);
                throw new Error(`Cloudinary: ${errorMessage}`);
            }

            const data = await response.json();
            return data.secure_url;
        } catch (error) {
            console.error("Upload error:", error);
            showMessage('error', `Error subida: ${error.message}`);
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
        // Robustez: Comprobar extensiones comunes de imagen también por si acaso
        const isImage = text.includes('res.cloudinary.com') ||
            /\.(jpg|jpeg|png|gif|webp)$/i.test(text) ||
            (text.startsWith('http') && text.includes('/image/upload/'));


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

        // 🔑 MARCAR COMO LEÍDO AL ABRIR
        const chatId = getChatId(recipientId);
        localStorage.setItem(`lastRead_${chatId}`, Date.now().toString());
        // Actualizar badge (restar o recalcular) - Para simplicidad recargamos usuarios/badges
        // Idealmente sería más óptimo, pero loadUsers() ya tiene la lógica.
        // Pero loadUsers es async y hace un fetch. Mejor solo ocultar el badge de este user visualmente si pudiéramos.
        // Por ahora, aceptamos que se actualice en la próxima carga o polling.

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
        // Removed check for container existence to allow background tasks
        const userListContainer = document.getElementById('user-list-container');
        let users = [];

        if (!isFirebaseReady) {
            // Wait or handle not ready
        } else {
            try {
                // 🔑 CLAVE: Usar la API de compatibilidad para colecciones
                const usersCollectionRef = db.collection('users');
                const snapshot = await usersCollectionRef.get();

                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (doc.id !== getUserId()) {
                        users.push({
                            id: doc.id,
                            name: data.username || data.displayName || `Usuario ${doc.id.substring(0, 6)}`,
                            photoURL: data.photoURL
                        });
                    }
                });
            } catch (error) {
                // Silenciar error en background
                return;
            }
        }

        // Renderizar solo si existe el contenedor (estamos en vista Chat)
        if (userListContainer) {
            renderUserList(users, {});
        }

        // Comprobar mensajes no leídos para cada usuario (siempre, para el badge global)
        checkUnreadMessages(users);
    }

    function renderUserList(users, unreadStatusMap) {
        const userListContainer = document.getElementById('user-list-container');
        if (!userListContainer) return;

        // Guardamos posición de scroll para restaurarla
        const scrollTop = userListContainer.scrollTop;

        userListContainer.innerHTML = users.map(user => {
            const hasUnread = unreadStatusMap[user.id];
            const unreadIndicator = hasUnread ?
                `<span class="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-800"></span>` : '';

            return `
            <div class="user-chat-card flex items-center p-3 rounded-xl cursor-pointer transition relative" 
                 onclick="openChatModal('${user.id}', '${user.name}')">
                
                <div class="relative w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center font-bold mr-4 overflow-hidden border border-gray-300 dark:border-gray-600">
                    <img src="${user.photoURL || profileImagePath}" alt="${user.name.charAt(0)}" class="w-full h-full object-cover">
                    ${unreadIndicator}
                </div>
                
                <p class="font-semibold user-chat-item-name">${user.name}</p>
            </div>
        `}).join('');

        // Restaurar scroll
        userListContainer.scrollTop = scrollTop;
    }

    async function checkUnreadMessages(users) {
        if (!db || !getUserId()) return;

        let totalUnread = 0;
        const unreadStatusMap = {};

        // Optimización: Promise.all para hacer las consultas en paralelo
        const promises = users.map(async (user) => {
            const chatId = [getUserId(), user.id].sort().join('_');
            try {
                // Obtener el último mensaje del chat
                const snapshot = await db.collection('chats').doc(chatId).collection('messages')
                    .orderBy('timestamp', 'desc')
                    .limit(1)
                    .get();

                if (!snapshot.empty) {
                    const lastMsg = snapshot.docs[0].data();
                    // Si el último mensaje NO es mío
                    if (lastMsg.senderId !== getUserId()) {
                        const lastReadTime = localStorage.getItem(`lastRead_${chatId}`);
                        let msgTime = 0;

                        if (lastMsg.timestamp && lastMsg.timestamp.toDate) {
                            msgTime = lastMsg.timestamp.toDate().getTime();
                        } else if (lastMsg.clientTimestamp) {
                            msgTime = new Date(lastMsg.clientTimestamp).getTime();
                        }

                        // Si no hay fecha de lectura o el mensaje es más reciente
                        if (!lastReadTime || msgTime > parseInt(lastReadTime)) {
                            unreadStatusMap[user.id] = true;
                            return 1;
                        }
                    }
                }
            } catch (e) {
                // console.error("Error checking unread for", user.id, e);
            }
            return 0;
        });

        const results = await Promise.all(promises);
        totalUnread = results.reduce((a, b) => a + b, 0);

        // Si estamos viendo la lista, actualizar indicadores individuales
        const userListContainer = document.getElementById('user-list-container');
        if (userListContainer) {
            renderUserList(users, unreadStatusMap);
        }

        updateUnreadBadge(totalUnread);
    }

    // Función para actualizar el badge de mensajes sin leer
    function updateUnreadBadge(count = 0) {
        const badge = document.getElementById('unread-badge');
        if (!badge) return;

        if (count > 0) {
            badge.classList.remove('hidden');
            // badge.textContent = count > 9 ? '9+' : count; // Si quisiéramos mostrar número
        } else {
            badge.classList.add('hidden');
        }
    }


    // ===============================================
    // 5. INICIALIZACIÓN Y LISTENERS
    // ===============================================

    let isChatInitialized = false;

    function initChat() {
        // 🔑 Aplicar el tema
        if (typeof window.applyColorMode === 'function') {
            window.applyColorMode();
        }

        // Aunque tengamos isChatInitialized, si el DOM se regenera (hot-reload o SPA navigation), 
        // necesitamos re-attachear los eventos.
        // La mejor manera de EVITAR duplicados es CLONAR y reemplazar los nodos.

        // 🔑 Setup de Firebase antes de cargar usuarios
        setupFirebase().then(() => {
            loadUsers();
        });

        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            // Clonamos para limpiar eventos previos
            const newChatInput = chatInput.cloneNode(true);
            chatInput.parentNode.replaceChild(newChatInput, chatInput);

            newChatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendMessage(e); // 🛑 Pasamos el evento para el preventDefault
                    e.preventDefault();
                }
            });
        }

        // Listeners para imagen
        // NOTA: 'chat-image-btn' ahora es un LABEL en HTML, por lo que el click lo maneja el navegador nativamente.
        // Solo necesitamos escuchar el CHANGE del input.
        const imageInput = document.getElementById('chat-image-input');

        if (imageInput) {
            // Eliminar listeners previos clonando el nodo
            const newImageInput = imageInput.cloneNode(true);
            imageInput.parentNode.replaceChild(newImageInput, imageInput);

            // Reasignar referencia
            const finalImageInput = document.getElementById('chat-image-input');

            // Manejo del cambio en el input
            finalImageInput.addEventListener('change', async (e) => {
                if (finalImageInput.files.length === 0) return;

                const file = finalImageInput.files[0];

                if (!file) return;

                // Validar tipo
                if (!file.type.startsWith('image/')) {
                    showMessage('error', 'Solo se permiten imágenes.');
                    finalImageInput.value = ''; // Limpiar si es inválido
                    return;
                }

                // Subir imagen
                const imageUrl = await uploadImageToCloudinary(file);

                if (imageUrl && currentRecipientId) {
                    const timestamp = new Date();

                    if (isFirebaseReady) {
                        saveMessageAndApplyCapping(currentRecipientId, imageUrl, timestamp);
                    }
                }

                // Limpiar input AL FINAL para permitir seleccionar la misma imagen después
                finalImageInput.value = '';
            });
        }

        // Listener para el botón de enviar mensaje
        const sendBtn = document.getElementById('send-message-btn');
        if (sendBtn) {
            const newSendBtn = sendBtn.cloneNode(true);
            sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);

            newSendBtn.addEventListener('click', (e) => sendMessage(e));
        }

        isChatInitialized = true;
    }



    // Listener para cerrar modal
    const closeModalBtn = document.querySelector('button[onclick="closeChatModal(\'message-modal\')"]');
    // El botón en HTML ya tiene onclick="closeChatModal...", pero si queremos manejarlo aqui:
    // Pero espera, Main.html linea 390 dice: onclick="closeChatModal('message-modal')"
    // Buttons.js tenia 'close-chat-modal-btn' pero en el HTML no veo ese ID.
    // Veo <button onclick="closeChatModal('message-modal')" ...>
    // Asi que probablemente no se necesite listener JS extra si ya hay onclick inline o si Main.js maneja modales de otra forma.
    // Buttons.js linea 35 referenciaba 'close-chat-modal-btn'.
    // En Main.html linea 390: <button onclick="closeChatModal('message-modal')" class="secondary-icon-btn p-2 rounded-full">
    // No tiene ID. Así que Buttons.js probablemente no estaba funcionando para ese boton especificamente o usaba otro selector.
    // Asique solo añadiré el de enviar.

    // ----------------------------------------------------------------------------------
    // 🚨 FUNCIÓN NUEVA: Comprobación de mensajes en segundo plano (Global)
    // ----------------------------------------------------------------------------------
    window.startBackgroundMessageCheck = async function () {
        // Asegurar que Firebase esté inicializado en este módulo, 
        // incluso si initChat aún no se ha llamado (ej. usuario en Dashboard)
        if (!isFirebaseReady) {
            try {
                await setupFirebase();
            } catch (e) { }
        }

        if (!isFirebaseReady) return;

        // Ejecutar inmediatamente
        loadUsers();

        // Configurar intervalo (cada 10 segundos)
        setInterval(() => {
            if (isFirebaseReady) {
                // Recargar usuarios y comprobar mensajes
                loadUsers();
            }
        }, 10000); // 10 segundos
    };

    // Hacer la función de inicialización global
    window.initChat = initChat;

})(); // ⬅️ FIN: Cierra la IIFE
