// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Конфиг из Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyD8sQkXuuQl3FN05-GVqVQ_6wg6TCQ_WuU",
    authDomain: "trainer-calendar-601cc.firebaseapp.com",
    projectId: "trainer-calendar-601cc",
    storageBucket: "trainer-calendar-601cc.appspot.com", // ✅ исправлено
    messagingSenderId: "658574673709",
    appId: "1:658574673709:web:d4454197751972ce7275a4",
    measurementId: "G-X66J83Z7SY"
};

// Инициализация Firebase
const app = initializeApp(firebaseConfig);

// Экспорт Firestore
export const db = getFirestore(app);