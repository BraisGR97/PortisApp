// ----- Configura Firebase -----
// Sustituye con tu propia configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyD_tC3KaK3UVyNOPiSsnI0s5k8Cd_qFJpg",
  authDomain: "portisapp.firebaseapp.com",
  projectId: "portisapp",
  storageBucket: "portisapp.firebasestorage.app",
  messagingSenderId: "38313359657",
  appId: "1:38313359657:web:ae73a0f8f7556bed92df38"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Usuario actual
const username = localStorage.getItem('currentUser'); 
if(!username) window.location.href = 'index.html'; // seguridad

const userCollection = db.collection('users').doc(username).collection('items');

// DOM
const backBtn = document.getElementById('backBtn');
const addBtn = document.getElementById('addBtn');
const addModal = document.getElementById('addModal');
const closeModal = document.getElementById('closeModal');
const confirmAdd = document.getElementById('confirmAdd');
const newItemInput = document.getElementById('newItem');
const itemList = document.getElementById('itemList');

// Eventos
backBtn.addEventListener('click', () => window.location.href = 'main.html');
addBtn.addEventListener('click', () => addModal.style.display = 'flex');
closeModal.addEventListener('click', () => addModal.style.display = 'none');
window.addEventListener('click', e => { if(e.target===addModal) addModal.style.display='none'; });

// Renderizar lista
function renderList() {
  itemList.innerHTML = '';
  userCollection.get().then(snapshot => {
    snapshot.forEach(doc => {
      const li = document.createElement('li');
      li.textContent = doc.data().name;
      itemList.appendChild(li);
    });
  });
}

// Añadir item
confirmAdd.addEventListener('click', () => {
  const value = newItemInput.value.trim();
  if(!value) return;

  userCollection.add({ name: value }).then(() => {
    newItemInput.value='';
    addModal.style.display='none';
    renderList();
  });
});

// Cargar al iniciar
renderList();
