// -----------------------------------------------------
// Personal Achievement Dashboard - Firebase Realtime Logic
// -----------------------------------------------------
// This version reads achievements from Firebase Firestore
// and auto-updates UI using onSnapshot realtime listener.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  getDocs,
  where,
  limit,
  updateDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// 1) Paste your Firebase project config here
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

// 2) Firestore collection name
const COLLECTION_NAME = "achievements";

const achievementList = document.getElementById("achievementList");
const errorMessage = document.getElementById("errorMessage");

const certificatesCountElement = document.getElementById("certificatesCount");
const codingCountElement = document.getElementById("codingCount");
const projectsCountElement = document.getElementById("projectsCount");
const totalAchievementsElement = document.getElementById("totalAchievements");

const filterButtons = document.querySelectorAll(".filter-btn");
const lastUpdatedAtElement = document.getElementById("lastUpdatedAt");
const refreshCountdownElement = document.getElementById("refreshCountdown");

let allAchievements = [];
let barChartInstance = null;
let pieChartInstance = null;
const AUTO_SYNC_INTERVAL_MS = 10 * 60 * 1000;
const PAGE_REFRESH_INTERVAL_MS = 120 * 1000;
let refreshRemainingSeconds = Math.floor(PAGE_REFRESH_INTERVAL_MS / 1000);
const NETLIFY_IMPORT_ENDPOINT = "/.netlify/functions/import";
const LOCAL_IMPORT_ENDPOINT = "http://localhost:3000/api/import";

// Fully automatic profile sync sources (edit these with your real profiles)
const AUTO_SYNC_SOURCES = [
  { url: "https://leetcode.com/u/Aravindh2727/" },
  // Add your HackerRank profile URL below when ready:
  // { url: "https://www.hackerrank.com/your_username" },
  // LinkedIn automatic certificate count is not reliable without OAuth partner APIs.
];

// Current selected filter (kept while live updates arrive)
let currentFilter = "All";

function isLeetCodeTotalRecord(item) {
  return item.type === "LeetCode" && item.title.toLowerCase().includes("total problems solved");
}

function isLeetCodeSplitRecord(item) {
  if (item.type !== "LeetCode") return false;
  const lower = item.title.toLowerCase();
  return (
    lower.includes("easy problems solved") ||
    lower.includes("medium problems solved") ||
    lower.includes("hard problems solved")
  );
}

function hasAnyLeetCodeTotal(data) {
  return data.some(isLeetCodeTotalRecord);
}

function getVisibleAchievements(data) {
  // Hide legacy split records when total LeetCode records are present.
  if (!hasAnyLeetCodeTotal(data)) return data;

  const splitSum = data
    .filter(isLeetCodeSplitRecord)
    .reduce((sum, item) => sum + Number(item.count || 0), 0);

  // If split records exist and total is stale, auto-correct total display count.
  return data
    .filter((item) => !isLeetCodeSplitRecord(item))
    .map((item) => {
      if (isLeetCodeTotalRecord(item) && splitSum > 0) {
        return { ...item, count: Math.max(Number(item.count || 0), splitSum) };
      }
      return item;
    });
}

function getLeetCodeCount(data) {
  const leetCodeItems = data.filter((item) => item.type === "LeetCode");
  const totalItems = leetCodeItems.filter(isLeetCodeTotalRecord);
  const source = totalItems.length > 0 ? totalItems : leetCodeItems;
  return source.reduce((sum, item) => sum + Number(item.count || 0), 0);
}

// Initialize Firebase app + Firestore
let db;
try {
  const app = initializeApp(firebaseConfig);
  // Analytics is optional. It may be unavailable in some local/dev contexts.
  try {
    getAnalytics(app);
  } catch (analyticsError) {
    console.warn("Firebase Analytics not initialized:", analyticsError);
  }
  db = getFirestore(app);
} catch (error) {
  console.error("Firebase initialization error:", error);
  errorMessage.textContent = "Firebase setup is incomplete. Please add your firebaseConfig in script.js.";
}

// Listen to Firestore changes in realtime
function startRealtimeListener() {
  if (!db) {
    return;
  }

  // Sort by title so the list is stable
  const achievementsQuery = query(collection(db, COLLECTION_NAME), orderBy("title"));

  onSnapshot(
    achievementsQuery,
    (snapshot) => {
      const data = [];

      snapshot.forEach((doc) => {
        const item = doc.data();

        // Keep structure beginner-friendly and safe defaults
        data.push({
          id: doc.id,
          type: item.type || "",
          title: item.title || "",
          difficulty: item.difficulty || "",
          count: Number(item.count || 0),
          easyCount: Number(item.easyCount || 0),
          mediumCount: Number(item.mediumCount || 0),
          hardCount: Number(item.hardCount || 0),
          link: item.link || "#",
        });
      });

      allAchievements = data;
      renderDashboard(currentFilter);
      errorMessage.textContent = "";
    },
    (error) => {
      console.error("Firestore listener error:", error);
      errorMessage.textContent =
        "Could not load Firebase data. Check Firestore rules, config, and internet connection.";
    }
  );
}

// Render everything based on selected filter type
function renderDashboard(filterType) {
  const visibleData = getVisibleAchievements(allAchievements);
  let filteredData = visibleData;
  if (filterType === "Coding") {
    filteredData = visibleData.filter((item) => {
      const link = String(item.link || "").toLowerCase();
      return item.type === "LeetCode" || link.includes("hackerrank.com");
    });
  } else if (filterType === "Project") {
    // Keep Project section focused on project platforms (exclude HackerRank rows).
    filteredData = visibleData.filter((item) => {
      const link = String(item.link || "").toLowerCase();
      return item.type === "Project" && !link.includes("hackerrank.com");
    });
  } else if (filterType !== "All") {
    filteredData = visibleData.filter((item) => item.type === filterType);
  }

  renderStats(visibleData);
  renderAchievementList(filteredData);
  renderCharts(visibleData);
  updateLastUpdatedAt();
}

// Calculate totals dynamically from data
function renderStats(data) {
  const certificates = data
    .filter((item) => item.type === "Certificate")
    .reduce((sum, item) => sum + Number(item.count || 0), 0);

  const codingProblems = getLeetCodeCount(data);

  const projects = data
    .filter((item) => item.type === "Project")
    .reduce((sum, item) => sum + Number(item.count || 0), 0);

  const totalAchievements = certificates + codingProblems + projects;

  certificatesCountElement.textContent = certificates;
  codingCountElement.textContent = codingProblems;
  projectsCountElement.textContent = projects;
  totalAchievementsElement.textContent = totalAchievements;
}

// Build achievement list items in UI
function renderAchievementList(data) {
  achievementList.innerHTML = "";

  if (data.length === 0) {
    achievementList.innerHTML = "<p>No achievements found for this filter.</p>";
    return;
  }

  data.forEach((item) => {
    const card = document.createElement("article");
    card.className = "achievement-item";

    card.innerHTML = `
      <div class="achievement-info">
        <h3>${item.title}</h3>
        <p class="achievement-meta">Type: ${item.type} | Count: ${item.count}</p>
      </div>
      <div class="achievement-actions">
        <a class="achievement-link" href="${item.link}" target="_blank" rel="noopener noreferrer">View Link</a>
      </div>
    `;

    achievementList.appendChild(card);
  });
}

// Create and refresh both chart visualizations
function renderCharts(data) {
  const certificates = data
    .filter((item) => item.type === "Certificate")
    .reduce((sum, item) => sum + Number(item.count || 0), 0);

  const codingProblems = getLeetCodeCount(data);

  const projects = data
    .filter((item) => item.type === "Project")
    .reduce((sum, item) => sum + Number(item.count || 0), 0);

  const chartLabels = ["Easy", "Medium", "Hard"];
  const totalLeetCodeRecord = data.find(isLeetCodeTotalRecord);
  const leetCodeItems = data.filter((item) => item.type === "LeetCode");

  let easyCount = 0;
  let mediumCount = 0;
  let hardCount = 0;

  if (
    totalLeetCodeRecord &&
    (totalLeetCodeRecord.easyCount > 0 ||
      totalLeetCodeRecord.mediumCount > 0 ||
      totalLeetCodeRecord.hardCount > 0)
  ) {
    easyCount = Number(totalLeetCodeRecord.easyCount || 0);
    mediumCount = Number(totalLeetCodeRecord.mediumCount || 0);
    hardCount = Number(totalLeetCodeRecord.hardCount || 0);
  } else {
    // Backward compatibility for older split-mode records.
    easyCount = leetCodeItems
      .filter((item) => (item.difficulty || item.title).toLowerCase().includes("easy"))
      .reduce((sum, item) => sum + Number(item.count || 0), 0);
    mediumCount = leetCodeItems
      .filter((item) => (item.difficulty || item.title).toLowerCase().includes("medium"))
      .reduce((sum, item) => sum + Number(item.count || 0), 0);
    hardCount = leetCodeItems
      .filter((item) => (item.difficulty || item.title).toLowerCase().includes("hard"))
      .reduce((sum, item) => sum + Number(item.count || 0), 0);
  }
  const chartValues = [easyCount, mediumCount, hardCount];

  if (barChartInstance) {
    barChartInstance.destroy();
  }

  if (pieChartInstance) {
    pieChartInstance.destroy();
  }

  const barContext = document.getElementById("barChart");
  const pieContext = document.getElementById("pieChart");

  barChartInstance = new Chart(barContext, {
    type: "bar",
    data: {
      labels: chartLabels,
      datasets: [
        {
          label: "Count",
          data: chartValues,
          backgroundColor: ["#3f9a70", "#e67e22", "#c0392b"],
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = Number(context.parsed.y || 0);
              const total = chartValues.reduce((sum, item) => sum + Number(item || 0), 0);
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
              return `${context.label}: ${value} (${percentage}%)`;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
        },
      },
    },
  });

  const platformCounts = {};
  data.forEach((item) => {
    const link = String(item.link || "").toLowerCase();
    let platform = "Other";

    if (link.includes("linkedin.com")) platform = "LinkedIn";
    else if (link.includes("leetcode.com")) platform = "LeetCode";
    else if (link.includes("github.com")) platform = "GitHub";
    else if (link.includes("hackerrank.com")) platform = "HackerRank";

    platformCounts[platform] = (platformCounts[platform] || 0) + Number(item.count || 0);
  });

  const platformLabels = Object.keys(platformCounts);
  const platformValues = Object.values(platformCounts);
  const platformColors = {
    LinkedIn: "#0a66c2",
    LeetCode: "#f89f1b",
    GitHub: "#24292f",
    HackerRank: "#2ec866",
    Other: "#6b7280",
  };
  const pieColors = platformLabels.map((label) => platformColors[label] || "#6b7280");

  pieChartInstance = new Chart(pieContext, {
    type: "pie",
    data: {
      labels: platformLabels,
      datasets: [
        {
          data: platformValues,
          backgroundColor: pieColors,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = context.label || "";
              const value = Number(context.parsed || 0);
              const values = context.dataset.data || [];
              const total = values.reduce((sum, item) => sum + Number(item || 0), 0);
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
              return `${label}: ${value} (${percentage}%)`;
            },
          },
        },
      },
    },
  });
}

// Filter button click handlers
filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    filterButtons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");

    currentFilter = button.getAttribute("data-filter") || "All";
    renderDashboard(currentFilter);
  });
});

function normalizeAchievement(rawItem) {
  return {
    type: String(rawItem.type || "").trim(),
    title: String(rawItem.title || "").trim(),
    difficulty: String(rawItem.difficulty || "").trim(),
    count: Number(rawItem.count || 0),
    easyCount: Number(rawItem.easyCount || 0),
    mediumCount: Number(rawItem.mediumCount || 0),
    hardCount: Number(rawItem.hardCount || 0),
    link: String(rawItem.link || "").trim(),
  };
}

function isValidAchievement(item) {
  return (
    item.type &&
    item.title &&
    item.link &&
    Number.isFinite(item.count) &&
    item.count >= 0
  );
}

async function sha256Hex(text) {
  // Preferred path: Web Crypto API (secure contexts like localhost/https)
  if (window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  // Fallback for insecure contexts (http + LAN IP):
  // deterministic non-crypto hash to avoid runtime failure.
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `fallback_${(hash >>> 0).toString(16)}`;
}

async function buildLinkKey(item) {
  // Stable key for dedupe/upsert queries, avoids Firestore index length issues.
  const raw = `${String(item.title || "").trim()}|${String(item.link || "").trim()}`;
  return sha256Hex(raw);
}

// Create or update by link+title to avoid duplicates during auto sync/import
async function upsertAchievement(item) {
  const achievementsRef = collection(db, COLLECTION_NAME);
  const linkKey = await buildLinkKey(item);
  const payload = { ...item, linkKey };

  // Primary query: short hash key (safe for very long links).
  const keyQuery = query(achievementsRef, where("linkKey", "==", linkKey), limit(1));
  let snapshot = await getDocs(keyQuery);

  // Backward compatibility for old documents without linkKey.
  if (snapshot.empty && String(item.link || "").length <= 900) {
    const legacyQuery = query(
      achievementsRef,
      where("link", "==", item.link),
      where("title", "==", item.title),
      limit(1)
    );
    snapshot = await getDocs(legacyQuery);
  }

  if (snapshot.empty) {
    await addDoc(achievementsRef, payload);
    return;
  }

  const existingDoc = snapshot.docs[0];
  await updateDoc(doc(db, COLLECTION_NAME, existingDoc.id), payload);
}

async function syncSource(source) {
  const isLocalHost =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const primaryEndpoint = isLocalHost ? LOCAL_IMPORT_ENDPOINT : NETLIFY_IMPORT_ENDPOINT;
  const fallbackEndpoint = isLocalHost ? NETLIFY_IMPORT_ENDPOINT : null;
  let response;

  try {
    response = await fetch(primaryEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: source.url,
        overrideCount: source.overrideCount ?? null,
      }),
    });
  } catch (error) {
    if (!fallbackEndpoint) {
      throw error;
    }

    response = await fetch(fallbackEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: source.url,
        overrideCount: source.overrideCount ?? null,
      }),
    });
  }

  if (!response.ok && fallbackEndpoint && primaryEndpoint !== fallbackEndpoint) {
    response = await fetch(fallbackEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: source.url,
        overrideCount: source.overrideCount ?? null,
      }),
    });
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Auto sync failed for ${source.url}`);
  }

  const result = await response.json();
  const items = (result.achievements || []).map(normalizeAchievement).filter(isValidAchievement);
  for (const item of items) {
    await upsertAchievement(item);
  }
}

async function runAutoSync() {
  if (!db) {
    return;
  }

  for (const source of AUTO_SYNC_SOURCES) {
    try {
      await syncSource(source);
    } catch (error) {
      console.warn("Auto sync warning:", error.message || error);
    }
  }
}

function startAutoSync() {
  // Run once on load, then periodically.
  runAutoSync();
  setInterval(runAutoSync, AUTO_SYNC_INTERVAL_MS);
}

function startPageAutoRefresh() {
  setInterval(() => {
    window.location.reload();
  }, PAGE_REFRESH_INTERVAL_MS);
}

function updateLastUpdatedAt() {
  if (!lastUpdatedAtElement) return;
  const now = new Date();
  lastUpdatedAtElement.textContent = now.toLocaleString();
}

function startRefreshCountdown() {
  if (!refreshCountdownElement) return;
  refreshCountdownElement.textContent = String(refreshRemainingSeconds);
  setInterval(() => {
    refreshRemainingSeconds -= 1;
    if (refreshRemainingSeconds < 0) {
      refreshRemainingSeconds = Math.floor(PAGE_REFRESH_INTERVAL_MS / 1000);
    }
    refreshCountdownElement.textContent = String(refreshRemainingSeconds);
  }, 1000);
}

// Initial app load
startRealtimeListener();
startAutoSync();
startPageAutoRefresh();
startRefreshCountdown();
