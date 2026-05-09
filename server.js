const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

function extractUsernameFromUrl(urlString) {
  let url;
  let rawInput = String(urlString || "").trim();

  // Support plain usernames like "Aravindh2727" by treating them as GitHub usernames.
  if (
    rawInput &&
    !rawInput.includes("://") &&
    !rawInput.includes("/") &&
    /^[A-Za-z0-9-]+$/.test(rawInput)
  ) {
    return rawInput;
  }

  // If scheme is missing (e.g. github.com/user), add https://
  if (rawInput && !rawInput.includes("://")) {
    rawInput = `https://${rawInput}`;
  }

  try {
    url = new URL(rawInput);
  } catch (_error) {
    return "";
  }

  const parts = url.pathname.split("/").filter(Boolean);

  if (url.hostname.includes("leetcode.com")) {
    const uIndex = parts.findIndex((part) => part === "u");
    if (uIndex !== -1 && parts[uIndex + 1]) {
      return parts[uIndex + 1];
    }
    return parts[0] || "";
  }

  if (url.hostname.includes("hackerrank.com")) {
    return parts[0] || "";
  }

  if (url.hostname.includes("github.com")) {
    // Supports:
    // https://github.com/username
    // https://github.com/username/
    // https://github.com/username?tab=repositories
    return parts[0] || "";
  }

  if (url.hostname.includes("linkedin.com")) {
    return parts[parts.length - 1] || "";
  }

  return "";
}

async function importFromLeetCode(urlString) {
  const username = extractUsernameFromUrl(urlString);
  if (!username) {
    throw new Error("Could not detect LeetCode username from URL.");
  }

  const graphqlQuery = {
    query: `
      query getUserProfile($username: String!) {
        matchedUser(username: $username) {
          submitStats {
            acSubmissionNum {
              difficulty
              count
            }
          }
        }
      }
    `,
    variables: { username },
  };

  const response = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: `https://leetcode.com/u/${username}/`,
    },
    body: JSON.stringify(graphqlQuery),
  });

  if (!response.ok) {
    throw new Error(`LeetCode request failed: HTTP ${response.status}`);
  }

  const result = await response.json();
  const stats = result?.data?.matchedUser?.submitStats?.acSubmissionNum || [];

  const totalSolved = Number(stats.find((entry) => entry.difficulty === "All")?.count || 0);
  const easySolved = Number(stats.find((entry) => entry.difficulty === "Easy")?.count || 0);
  const mediumSolved = Number(stats.find((entry) => entry.difficulty === "Medium")?.count || 0);
  const hardSolved = Number(stats.find((entry) => entry.difficulty === "Hard")?.count || 0);

  return [
    {
      type: "LeetCode",
      title: `${username} Total Problems Solved`,
      count: totalSolved,
      easyCount: easySolved,
      mediumCount: mediumSolved,
      hardCount: hardSolved,
      link: `https://leetcode.com/u/${username}/`,
    },
  ];
}

async function importFromHackerRank(urlString) {
  const username = extractUsernameFromUrl(urlString);
  if (!username) {
    throw new Error("Could not detect HackerRank username from URL.");
  }

  const profileApi = `https://www.hackerrank.com/rest/hackers/${username}/profile`;
  const response = await fetch(profileApi, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return [
        {
          type: "Project",
          title: `HackerRank Profile - ${username}`,
          count: 1,
          link: `https://www.hackerrank.com/${username}`,
        },
      ];
    }
    throw new Error(`HackerRank request failed: HTTP ${response.status}`);
  }

  const result = await response.json();
  const model = result?.model || {};

  return [
    {
      type: "Project",
      title: `HackerRank Profile - ${model.username || username}`,
      count: 1,
      link: `https://www.hackerrank.com/${username}`,
    },
  ];
}

async function importFromGitHub(urlString) {
  const username = extractUsernameFromUrl(urlString);
  if (!username) {
    throw new Error("Could not detect GitHub username from URL.");
  }

  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "personal-achievement-dashboard",
  };

  // Count repositories via repos API (owner repos) instead of relying only on
  // profile.public_repos snapshot, which can lag or differ in some cases.
  let page = 1;
  let totalRepos = 0;

  while (true) {
    const reposUrl = `https://api.github.com/users/${username}/repos?per_page=100&type=owner&page=${page}`;
    const reposResponse = await fetch(reposUrl, { headers });

    if (!reposResponse.ok) {
      throw new Error(`GitHub request failed: HTTP ${reposResponse.status}`);
    }

    const repos = await reposResponse.json();
    if (!Array.isArray(repos) || repos.length === 0) {
      break;
    }

    totalRepos += repos.length;
    if (repos.length < 100) {
      break;
    }
    page += 1;
  }

  return [
    {
      type: "Project",
      title: `GitHub Public Repositories - ${username}`,
      count: totalRepos,
      link: `https://github.com/${username}`,
    },
  ];
}

function importFromLinkedIn(urlString, overrideCount) {
  const username = extractUsernameFromUrl(urlString);

  // LinkedIn blocks scraping/API without OAuth-approved app permissions.
  // We add a safe profile reference entry so user can still track it.
  return [
    {
      type: "Certificate",
      title: `LinkedIn Profile - ${username || "User"}`,
      count: Number.isFinite(overrideCount) && overrideCount >= 0 ? overrideCount : 1,
      link: urlString,
    },
  ];
}

function normalizeAchievement(rawItem) {
  return {
    type: String(rawItem.type || "").trim(),
    title: String(rawItem.title || "").trim(),
    count: Number(rawItem.count || 0),
    link: String(rawItem.link || "").trim(),
  };
}

function isValidAchievement(item) {
  return item.type && item.title && item.link && Number.isFinite(item.count) && item.count >= 0;
}

async function importFromJsonUrl(urlString) {
  const response = await fetch(urlString);
  if (!response.ok) {
    throw new Error(`JSON URL request failed: HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Provided URL did not return JSON data.");
  }

  const rawData = await response.json();
  const list = Array.isArray(rawData) ? rawData : [rawData];
  const valid = list.map(normalizeAchievement).filter(isValidAchievement);

  if (valid.length === 0) {
    throw new Error("JSON did not contain valid achievement records.");
  }

  return valid;
}

function importAsGenericLink(urlString, overrideCount) {
  const parsed = new URL(urlString);
  const host = parsed.hostname.replace(/^www\./, "");
  return [
    {
      type: "Project",
      title: `Profile Link - ${host}`,
      count: Number.isFinite(overrideCount) && overrideCount >= 0 ? overrideCount : 1,
      link: urlString,
    },
  ];
}

app.post("/api/import", async (req, res) => {
  try {
    const inputUrl = String(req.body.url || "").trim();
    const rawOverrideCount = req.body.overrideCount;
    const overrideCount =
      rawOverrideCount === null || rawOverrideCount === undefined || rawOverrideCount === ""
        ? null
        : Number(rawOverrideCount);

    if (!inputUrl) {
      return res.status(400).json({ error: "URL is required." });
    }

    const url = new URL(inputUrl);
    const host = url.hostname.toLowerCase();

    let achievements = [];

    if (host.includes("leetcode.com")) {
      achievements = await importFromLeetCode(inputUrl);
    } else if (host.includes("github.com")) {
      achievements = await importFromGitHub(inputUrl);
    } else if (host.includes("hackerrank.com")) {
      achievements = await importFromHackerRank(inputUrl);
    } else if (host.includes("linkedin.com")) {
      achievements = importFromLinkedIn(inputUrl, overrideCount);
    } else {
      // Try JSON import first. If the URL is not JSON (HTML/profile pages),
      // fall back to a generic link entry instead of failing with 500.
      try {
        achievements = await importFromJsonUrl(inputUrl);
      } catch (_jsonError) {
        achievements = importAsGenericLink(inputUrl, overrideCount);
      }
    }

    // Apply override count to all imported records when provided.
    if (overrideCount !== null && Number.isFinite(overrideCount) && overrideCount >= 0) {
      achievements = achievements.map((item) => ({ ...item, count: overrideCount }));
    }

    return res.json({ achievements });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Import failed." });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Importer API running on http://localhost:${PORT}`);
});
