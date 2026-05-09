import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB_ALYzUPs0k6hxTkAHntF89WOcwQ2v3q4",
  authDomain: "personal-dashboard-5b598.firebaseapp.com",
  databaseURL: "https://personal-dashboard-5b598-default-rtdb.firebaseio.com",
  projectId: "personal-dashboard-5b598",
  storageBucket: "personal-dashboard-5b598.firebasestorage.app",
  messagingSenderId: "161561995069",
  appId: "1:161561995069:web:a53e9899079ce3e43b0754",
  measurementId: "G-6S7KCWS122",
};

// Add your admin emails here
const ALLOWED_ADMIN_EMAILS = [
  "aravindhvinayagam2007@gmail.com",
];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const loginSection = document.getElementById("loginSection");
const adminSection = document.getElementById("adminSection");
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const logoutBtn = document.getElementById("logoutBtn");
const adminAddForm = document.getElementById("adminAddForm");
const adminMessage = document.getElementById("adminMessage");
const adminList = document.getElementById("adminList");

const adminEmail = document.getElementById("adminEmail");
const adminPassword = document.getElementById("adminPassword");
const adminType = document.getElementById("adminType");
const adminTitle = document.getElementById("adminTitle");
const adminCount = document.getElementById("adminCount");
const adminLink = document.getElementById("adminLink");

let unsubscribeAchievements = null;

function isAllowedAdmin(user) {
  const allowed = ALLOWED_ADMIN_EMAILS.map((email) => String(email).trim().toLowerCase());
  return user?.email && allowed.includes(String(user.email).trim().toLowerCase());
}

function showLogin(message = "") {
  loginSection.style.display = "block";
  adminSection.style.display = "none";
  if (message) loginMessage.textContent = message;

  if (unsubscribeAchievements) {
    unsubscribeAchievements();
    unsubscribeAchievements = null;
  }
}

function showAdmin() {
  loginSection.style.display = "none";
  adminSection.style.display = "block";
  loginMessage.textContent = "";
  subscribeAchievements();
}

function subscribeAchievements() {
  if (unsubscribeAchievements) {
    unsubscribeAchievements();
  }

  unsubscribeAchievements = onSnapshot(collection(db, "achievements"), (snapshot) => {
    const items = [];
    snapshot.forEach((itemDoc) => {
      items.push({ id: itemDoc.id, ...itemDoc.data() });
    });

    items.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));

    adminList.innerHTML = "";
    if (items.length === 0) {
      adminList.innerHTML = "<p>No achievements found.</p>";
      return;
    }

    items.forEach((item) => {
      const row = document.createElement("article");
      row.className = "achievement-item";
      row.innerHTML = `
        <div class="achievement-info">
          <h3>${item.title || "Untitled"}</h3>
          <p class="achievement-meta">Type: ${item.type || "-"} | Count: ${Number(item.count || 0)}</p>
        </div>
        <div class="achievement-actions">
          <a class="achievement-link" href="${item.link || "#"}" target="_blank" rel="noopener noreferrer">View Link</a>
          <button class="submit-btn edit-btn" type="button" data-id="${item.id}">Edit</button>
          <button class="delete-btn" type="button" data-id="${item.id}">Delete</button>
        </div>
      `;
      adminList.appendChild(row);
    });

    const editButtons = adminList.querySelectorAll(".edit-btn");
    editButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-id");
        if (!id) return;

        const current = items.find((item) => item.id === id);
        if (!current) return;

        const nextType = window.prompt(
          "Type (Certificate / LeetCode / Project)",
          String(current.type || "")
        );
        if (nextType === null) return;

        const nextTitle = window.prompt("Title", String(current.title || ""));
        if (nextTitle === null) return;

        const nextCountRaw = window.prompt("Count (0 or more)", String(Number(current.count || 0)));
        if (nextCountRaw === null) return;
        const nextCount = Number(nextCountRaw);
        if (!Number.isFinite(nextCount) || nextCount < 0) {
          adminMessage.textContent = "Count must be 0 or more.";
          return;
        }

        const nextLink = window.prompt("Link (https://...)", String(current.link || ""));
        if (nextLink === null) return;

        const normalizedType = String(nextType).trim();
        const normalizedTitle = String(nextTitle).trim();
        const normalizedLink = String(nextLink).trim();

        if (!normalizedType || !normalizedTitle || !normalizedLink) {
          adminMessage.textContent = "Type, title, and link are required.";
          return;
        }

        try {
          await updateDoc(doc(db, "achievements", id), {
            type: normalizedType,
            title: normalizedTitle,
            count: nextCount,
            link: normalizedLink,
          });
          adminMessage.textContent = "Achievement updated.";
        } catch (error) {
          adminMessage.textContent = "Update failed. Check Firestore rules.";
          console.error(error);
        }
      });
    });

    const deleteButtons = adminList.querySelectorAll(".delete-btn");
    deleteButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-id");
        if (!id) return;
        const ok = window.confirm("Delete this achievement?");
        if (!ok) return;

        try {
          await deleteDoc(doc(db, "achievements", id));
          adminMessage.textContent = "Achievement deleted.";
        } catch (error) {
          adminMessage.textContent = "Delete failed. Check Firestore rules.";
          console.error(error);
        }
      });
    });
  });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "";

  try {
    const email = adminEmail.value.trim();
    const password = adminPassword.value;
    const cred = await signInWithEmailAndPassword(auth, email, password);

    if (!isAllowedAdmin(cred.user)) {
      await signOut(auth);
      showLogin("Access denied: not an allowed admin account.");
      return;
    }

    showAdmin();
  } catch (error) {
    loginMessage.textContent = "Login failed. Check email/password.";
    console.error(error);
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  showLogin("Logged out.");
});

adminAddForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminMessage.textContent = "";

  try {
    const count = Number(adminCount.value);
    if (!Number.isFinite(count) || count < 0) {
      adminMessage.textContent = "Count must be 0 or more.";
      return;
    }

    await addDoc(collection(db, "achievements"), {
      type: adminType.value.trim(),
      title: adminTitle.value.trim(),
      count,
      link: adminLink.value.trim(),
    });

    adminAddForm.reset();
    adminMessage.textContent = "Achievement added.";
  } catch (error) {
    adminMessage.textContent = "Add failed. Check Firestore rules.";
    console.error(error);
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showLogin();
    return;
  }

  if (!isAllowedAdmin(user)) {
    await signOut(auth);
    showLogin("Access denied: not an allowed admin account.");
    return;
  }

  showAdmin();
});
