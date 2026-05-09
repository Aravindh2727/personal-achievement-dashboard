function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(payload),
  };
}

function extractUsernameFromUrl(urlString) {
  let url;
  let rawInput = String(urlString || "").trim();

  if (rawInput && !rawInput.includes("://") && !rawInput.includes("/") && /^[A-Za-z0-9-]+$/.test(rawInput)) {
    return rawInput;
  }

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
    if (uIndex !== -1 && parts[uIndex + 1]) return parts[uIndex + 1];
    return parts[0] || "";
  }

  if (url.hostname.includes("hackerrank.com")) return parts[0] || "";
  if (url.hostname.includes("github.com")) return parts[0] || "";
  if (url.hostname.includes("linkedin.com")) return parts[parts.length - 1] || "";

  return "";
}

function pickNumber(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num >= 0) {
      return num;
    }
  }
  return 0;
}

async function importFromLeetCode(urlString) {
  const username = extractUsernameFromUrl(urlString);
  if (!username) throw new Error("Could not detect LeetCode username from URL.");

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
          submitStatsGlobal {
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

  if (!response.ok) throw new Error(`LeetCode request failed: HTTP ${response.status}`);

  const result = await response.json();
  const stats = result?.data?.matchedUser?.submitStats?.acSubmissionNum || [];
  const globalStats = result?.data?.matchedUser?.submitStatsGlobal?.acSubmissionNum || [];

  const totalFromStats = Number(stats.find((entry) => entry.difficulty === "All")?.count || 0);
  const totalFromGlobal = Number(
    globalStats.find((entry) => entry.difficulty === "All")?.count || 0
  );
  const easySolved = Number(
    globalStats.find((entry) => entry.difficulty === "Easy")?.count ||
      stats.find((entry) => entry.difficulty === "Easy")?.count ||
      0
  );
  const mediumSolved = Number(
    globalStats.find((entry) => entry.difficulty === "Medium")?.count ||
      stats.find((entry) => entry.difficulty === "Medium")?.count ||
      0
  );
  const hardSolved = Number(
    globalStats.find((entry) => entry.difficulty === "Hard")?.count ||
      stats.find((entry) => entry.difficulty === "Hard")?.count ||
      0
  );

  const totalFromDifficultySplit = easySolved + mediumSolved + hardSolved;
  const totalSolved = Math.max(totalFromStats, totalFromGlobal, totalFromDifficultySplit);

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
  if (!username) throw new Error("Could not detect HackerRank username from URL.");

  const response = await fetch(`https://www.hackerrank.com/rest/hackers/${username}/profile`, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return [{ type: "Project", title: `HackerRank Profile - ${username}`, count: 1, link: `https://www.hackerrank.com/${username}` }];
    }
    throw new Error(`HackerRank request failed: HTTP ${response.status}`);
  }

  const result = await response.json();
  const model = result?.model || {};
  const solvedCount = pickNumber(
    model.total_solved_challenges,
    model.solved_challenges,
    model.solvedChallenges,
    model.badges_count,
    model.badgesCount,
    1
  );

  return [{ type: "Project", title: `HackerRank Profile - ${model.username || username}`, count: solvedCount, link: `https://www.hackerrank.com/${username}` }];
}

async function importFromGitHub(urlString) {
  const username = extractUsernameFromUrl(urlString);
  if (!username) throw new Error("Could not detect GitHub username from URL.");

  const headers = { Accept: "application/vnd.github+json", "User-Agent": "personal-achievement-dashboard" };
  let page = 1;
  let totalRepos = 0;

  while (true) {
    const reposUrl = `https://api.github.com/users/${username}/repos?per_page=100&type=owner&page=${page}`;
    const reposResponse = await fetch(reposUrl, { headers });
    if (!reposResponse.ok) throw new Error(`GitHub request failed: HTTP ${reposResponse.status}`);

    const repos = await reposResponse.json();
    if (!Array.isArray(repos) || repos.length === 0) break;

    totalRepos += repos.length;
    if (repos.length < 100) break;
    page += 1;
  }

  if (totalRepos === 0) {
    const profileResponse = await fetch(`https://api.github.com/users/${username}`, { headers });
    if (profileResponse.ok) {
      const profile = await profileResponse.json();
      totalRepos = pickNumber(profile.public_repos, totalRepos);
    }
  }

  return [{ type: "Project", title: `GitHub Public Repositories - ${username}`, count: totalRepos, link: `https://github.com/${username}` }];
}

function importFromLinkedIn(urlString, overrideCount) {
  const username = extractUsernameFromUrl(urlString);
  return [{
    type: "Certificate",
    title: `LinkedIn Profile - ${username || "User"}`,
    count: Number.isFinite(overrideCount) && overrideCount >= 0 ? overrideCount : 1,
    link: urlString,
  }];
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
  if (!response.ok) throw new Error(`JSON URL request failed: HTTP ${response.status}`);

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) throw new Error("Provided URL did not return JSON data.");

  const rawData = await response.json();
  const list = Array.isArray(rawData) ? rawData : [rawData];
  const valid = list.map(normalizeAchievement).filter(isValidAchievement);

  if (valid.length === 0) throw new Error("JSON did not contain valid achievement records.");
  return valid;
}

function importAsGenericLink(urlString, overrideCount) {
  const parsed = new URL(urlString);
  const host = parsed.hostname.replace(/^www\./, "");
  return [{
    type: "Project",
    title: `Profile Link - ${host}`,
    count: Number.isFinite(overrideCount) && overrideCount >= 0 ? overrideCount : 1,
    link: urlString,
  }];
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const inputUrl = String(body.url || "").trim();
    const rawOverrideCount = body.overrideCount;
    const overrideCount = rawOverrideCount === null || rawOverrideCount === undefined || rawOverrideCount === "" ? null : Number(rawOverrideCount);

    if (!inputUrl) return json(400, { error: "URL is required." });

    const url = new URL(inputUrl);
    const host = url.hostname.toLowerCase();
    let achievements = [];

    if (host.includes("leetcode.com")) achievements = await importFromLeetCode(inputUrl);
    else if (host.includes("github.com")) achievements = await importFromGitHub(inputUrl);
    else if (host.includes("hackerrank.com")) achievements = await importFromHackerRank(inputUrl);
    else if (host.includes("linkedin.com")) achievements = importFromLinkedIn(inputUrl, overrideCount);
    else {
      try {
        achievements = await importFromJsonUrl(inputUrl);
      } catch (_jsonError) {
        achievements = importAsGenericLink(inputUrl, overrideCount);
      }
    }

    if (overrideCount !== null && Number.isFinite(overrideCount) && overrideCount >= 0) {
      achievements = achievements.map((item) => ({ ...item, count: overrideCount }));
    }

    return json(200, { achievements });
  } catch (error) {
    return json(500, { error: error.message || "Import failed." });
  }
};

