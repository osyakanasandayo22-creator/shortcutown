const API_KEY = "AIzaSyClvR2WW0PKeFsifRgG2N7Vo1CYbloT4fQ";
const STORAGE_KEY = "savedChannels";
const PLAYED_KEY = "playedVideos";


/* ===== DOM ===== */
const channelInput = document.getElementById("channelInput");
const addChannelBtn = document.getElementById("addChannelBtn");
const channelList = document.getElementById("channelList");

const totalTimeSpan = document.getElementById("totalTime");
const targetTimeInput = document.getElementById("targetTimeInput");
const diffTimeSpan = document.getElementById("diffTime");

const autoSelectBtn = document.getElementById("autoSelectBtn");
const confirmBtn = document.getElementById("confirmBtn");
const playBtn = document.getElementById("playBtn");

const selectView = document.getElementById("selectView");
const playOrderView = document.getElementById("playOrderView");
const playOrderList = document.getElementById("playOrderList");
const backBtn = document.getElementById("backBtn");
const resetPlayedBtn = document.getElementById("resetPlayedBtn");


/* ===== 追加済みチャンネル管理 ===== */
const addedChannelIds = new Set();

/* ===== localStorage 保存 ===== */
function saveChannels() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([...addedChannelIds])
  );
}

/* ===== localStorage 復元 ===== */
async function loadChannels() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

  for (const channelId of saved) {
    try {
      const name = await getChannelName(channelId);
      const videos = await getVideos(channelId);
      addChannel(channelId, name, videos);
      addedChannelIds.add(channelId);
    } catch (e) {
      console.error("復元失敗:", channelId);
    }
  }

  updateTotalTime();
}

/* ===== チャンネルID解決 ===== */
async function resolveChannelId(input) {
  input = input.trim();

  if (input.includes("/channel/")) {
    return input.split("/channel/")[1].split(/[/?]/)[0];
  }

  if (input.includes("@")) {
    const username = input.split("@")[1].split(/[/?]/)[0];
    const url =
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet&type=channel&q=${username}&maxResults=1&key=${API_KEY}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.items?.length) {
      return data.items[0].snippet.channelId;
    }
    throw new Error("チャンネルが見つかりません");
  }

  return input;
}

/* ===== チャンネル名取得 ===== */
async function getChannelName(channelId) {
  const url =
    `https://www.googleapis.com/youtube/v3/channels` +
    `?part=snippet&id=${channelId}&key=${API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();
  return data.items[0].snippet.title;
}

/* ===== 動画取得（最新3本 / Shorts除外） ===== */
/* ===== 動画取得（最新10本 / Shorts除外 / 3分以上） ===== */
async function getVideos(channelId) {
  const played = getPlayedVideos()[channelId] || [];

  const searchUrl =
    `https://www.googleapis.com/youtube/v3/search` +
    `?part=snippet&channelId=${channelId}` +
    `&maxResults=20&order=date&type=video&key=${API_KEY}`;

  const res = await fetch(searchUrl);
  const data = await res.json();

  // 再生済みを除外 & Shorts除外 (動画IDが "shorts" を含む場合)
  const freshIds = data.items
    .map(v => v.id.videoId)
    .filter(id => id && !played.includes(id));

  if (!freshIds.length) return [];

  const detailUrl =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=contentDetails,snippet&id=${freshIds.join(",")}&key=${API_KEY}`;

  const detailRes = await fetch(detailUrl);
  const detailData = await detailRes.json();

  return detailData.items
    .map(v => ({
      id: v.id,
      title: v.snippet.title,
      duration: parseISODuration(v.contentDetails.duration),
      thumb: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`
    }))
    // 3分以上 & Shorts除外
    .filter(v => v.duration >= 3 && !v.title.toLowerCase().includes("short"))
    .slice(0, 3); // 必要に応じて取得数を増やす
}


/* ===== ISO8601 → 分 ===== */
function parseISODuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return Math.ceil(
    (Number(m[1] || 0) * 60) +
    Number(m[2] || 0) +
    Number(m[3] || 0) / 60
  );
}

/* ===== チャンネル追加 ===== */
addChannelBtn.addEventListener("click", async () => {
  const value = channelInput.value.trim();
  if (!value) return;

  try {
    const channelId = await resolveChannelId(value);

    if (addedChannelIds.has(channelId)) {
      alert("このチャンネルは既に追加されています");
      return;
    }

    const name = await getChannelName(channelId);
    const videos = await getVideos(channelId);

    addChannel(channelId, name, videos);
    addedChannelIds.add(channelId);
    saveChannels();

    channelInput.value = "";
  } catch (e) {
    alert(e.message);
  }
});

/* ===== チャンネル表示 ===== */
function addChannel(channelId, name, videos) {
  const section = document.createElement("div");
  section.dataset.channelId = channelId; // ← 追加

  const header = document.createElement("div");
  header.style.cursor = "pointer";

  const title = document.createElement("h2");
  title.textContent = "▼ " + name;
  title.style.display = "inline-block";
  title.style.marginRight = "12px";

  const delBtn = document.createElement("button");
  delBtn.textContent = "削除";
  delBtn.onclick = () => {
    section.remove();
    addedChannelIds.delete(channelId);
    saveChannels();
    updateTotalTime();
  };

  header.append(title, delBtn);
  section.appendChild(header);

  const ul = document.createElement("ul");

  videos.forEach(v => {
    const li = document.createElement("li");
    li.style.display = "flex";
    li.style.alignItems = "center";
    li.style.gap = "8px";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.duration = v.duration;
    cb.dataset.videoId = v.id;
    cb.dataset.title = v.title;
    cb.addEventListener("change", updateTotalTime);

    const img = document.createElement("img");
    img.src = v.thumb;
    img.width = 120;

    const text = document.createElement("span");
    text.textContent = `${v.title}（${v.duration}分）`;

    li.append(cb, img, text);
    ul.appendChild(li);

    li.addEventListener("click", () => {
      cb.checked = !cb.checked;
      updateTotalTime();
    });

    [cb, img, text].forEach(el => {
      el.addEventListener("click", e => {
        e.stopPropagation();
        li.click();
      });
    });
  });

  section.appendChild(ul);
  channelList.appendChild(section);

  let open = true;
  header.onclick = () => {
    open = !open;
    ul.style.display = open ? "block" : "none";
    title.textContent = (open ? "▼ " : "▶ ") + name;
  };
}

/* ===== 合計時間 ===== */
function updateTotalTime() {
  const checked = document.querySelectorAll("input[type=checkbox]:checked");
  let total = 0;
  checked.forEach(c => total += Number(c.dataset.duration));
  totalTimeSpan.textContent = total;

  const target = Number(targetTimeInput.value);
  const diff = target - total;

  diffTimeSpan.textContent =
    diff === 0 ? "ぴったり" :
    diff > 0 ? `あと +${diff}` :
    `${diff} オーバー`;
}

targetTimeInput.addEventListener("input", updateTotalTime);

/* ===== 自動選択 ===== */
autoSelectBtn.addEventListener("click", () => {
  const target = Number(targetTimeInput.value);
  const boxes = [...document.querySelectorAll("input[type=checkbox]")];
  boxes.forEach(b => b.checked = false);

  let total = 0;
  for (const cb of boxes.sort(() => Math.random() - 0.5)) {
    const d = Number(cb.dataset.duration);
    if (total + d <= target) {
      cb.checked = true;
      total += d;
    }
  }
  updateTotalTime();
});

/* ===== 再生順 ===== */
confirmBtn.addEventListener("click", () => {
  const checked = [...document.querySelectorAll("input[type=checkbox]:checked")];
  if (!checked.length) {
    alert("動画を1つ以上選択してください");
    return;
  }

  playOrderList.innerHTML = "";

  checked
    .map(c => ({
      id: c.dataset.videoId,
      title: c.dataset.title,
      duration: c.dataset.duration
    }))
    .sort((a, b) => b.duration - a.duration)
    .forEach(v => {
      const li = document.createElement("li");
      li.textContent = `${v.title}（${v.duration}分）`;
      li.dataset.videoId = v.id;
      li.draggable = true;
      enableDrag(li);
      playOrderList.appendChild(li);
    });

  selectView.style.display = "none";
  document.getElementById("controlPanel").style.display = "none";
  playOrderView.style.display = "block";
});

/* ===== 戻る ===== */
backBtn.addEventListener("click", () => {
  playOrderView.style.display = "none";
  selectView.style.display = "block";
  document.getElementById("controlPanel").style.display = "flex";
});

/* ===== ドラッグ ===== */
let dragged = null;
function enableDrag(li) {
  li.addEventListener("dragstart", () => dragged = li);
  li.addEventListener("dragover", e => {
    e.preventDefault();
    if (!dragged || dragged === li) return;
    playOrderList.insertBefore(dragged, li);
  });
}

/* ===== 再生 ===== */
playBtn.addEventListener("click", () => {
  const items = [...playOrderList.children];

  if (!items.length) return;

  items.forEach(li => {
    const videoId = li.dataset.videoId;

    document.querySelectorAll("input[type=checkbox]").forEach(cb => {
      if (cb.dataset.videoId === videoId) {
        const section = cb.closest("div");
        const channelId = section.dataset.channelId; // ← dataset から直接取得
        if (channelId) {
          savePlayedVideo(channelId, videoId);
        }
      }
    });
  });

  const ids = items.map(li => li.dataset.videoId);
  window.open(
    "https://www.youtube.com/watch_videos?video_ids=" + ids.join(","),
    "_blank"
  );
});

// 再生済み動画の保存・取得関数
function getPlayedVideos() {
  return JSON.parse(localStorage.getItem(PLAYED_KEY) || "{}");
}
function savePlayedVideo(channelId, videoId) {
  const data = getPlayedVideos();
  if (!data[channelId]) data[channelId] = [];
  if (!data[channelId].includes(videoId)) {
    data[channelId].push(videoId);
  }
  localStorage.setItem(PLAYED_KEY, JSON.stringify(data));
}
// 視聴済みリセットボタン
resetPlayedBtn.addEventListener("click", () => {
  if (!confirm("視聴済み動画をすべてリセットしますか？")) return;

  localStorage.removeItem("playedVideos");

  alert("視聴履歴をリセットしました。\nページを再読み込みしてください。");
});



/* ===== 初期化 ===== */
window.addEventListener("DOMContentLoaded", loadChannels);
updateTotalTime();
