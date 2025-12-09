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
        return sessionStorage.getItem('portis-user-identifier') || (auth && auth.currentUser ? auth.currentUser.uid : null);
    }

    // const userId removed to avoid stale values

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
                    const isCurrentUser = data.senderId === getUserId();

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
            showMessage('error', 'Error de conexión en tiempo real con el chat.');
            // Intentar desuscribirse en caso de error
            if (unsubscribeFromChat) {
                unsubscribeFromChat();
                unsubscribeFromChat = null;
            }
        });
    }

    // ... (renderMessage remains same) ... 

    async function loadUsers() {
        const userListContainer = document.getElementById('user-list-container');
        // NOTA: userListContainer puede ser null si no estamos en la vista chat, 
        // pero necesitamos cargar usuarios para checkUnreadMessages incluso en background.
        // if (!userListContainer) return; <-- REMOVED check to allow background logic

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
                showMessage('error', 'Error al cargar la lista de contactos. (Verifique permisos)');
                return;
            }
        }

        // Renderizado inicial de usuarios (sin indicadores aún)
        // Solo renderizar si el contenedor existe (estamos en chat view)
        if (userListContainer) {
            renderUserList(users, {});
        }

        // Comprobar mensajes no leídos para cada usuario
        checkUnreadMessages(users);
    }

    // ... (renderUserList remains same) ...

    async function checkUnreadMessages(users) {
        if (!db || !getUserId()) return;

        let totalUnread = 0;
        const unreadStatusMap = {};

        for (const user of users) {
            const chatId = [getUserId(), user.id].sort().join('_'); // Use getUserId explicitly or getChatId helper
            // Using getChatId(user.id) is safer but let's inline for clarity if helper is updated

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
                            totalUnread++;
                        }
                    }
                }
            } catch (e) {
                // console.error("Error checking unread for", user.id, e);
            }
        }

        renderUserList(users, unreadStatusMap);
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
    }

    // Listener para el botón de enviar mensaje
    const sendBtn = document.getElementById('send-message-btn');
    if (sendBtn) {
        sendBtn.addEventListener('click', (e) => sendMessage(e));
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
            await setupFirebase();
        }

        if (!isFirebaseReady) return;

        // Ejecutar inmediatamente
        loadUsers();

        // Configurar intervalo (cada 60 segundos)
        setInterval(() => {
            if (isFirebaseReady) {
                // Recargar usuarios y comprobar mensajes
                // Nota: loadUsers llama a checkUnreadMessages internamente
                loadUsers();
            }
        }, 60000); // 1 minuto
    };

    // Hacer la función de inicialización global
    window.initChat = initChat;

})(); // ⬅️ FIN: Cierra la IIFE
