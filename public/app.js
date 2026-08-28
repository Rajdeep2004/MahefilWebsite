const API = "/api";
const form = document.querySelector("#postForm");
const feedGrid = document.querySelector("#feedGrid");
const mediaInput = document.querySelector("#media");
const preview = document.querySelector("#preview");
const recordBtn = document.querySelector("#recordBtn");
const recordTime = document.querySelector("#recordTime");
let recorder = null;
let audioChunks = [];
let voiceBlob = null;
let timer = null;
let seconds = 0;

async function checkAPI() {
  try {
    const r = await fetch(`${API}/health`);
    document.querySelector("#apiStatus").textContent = r.ok ? "● API online" : "API offline";
  } catch {
    document.querySelector("#apiStatus").textContent = "● Start the server";
  }
}

function escapeHTML(value = "") {
  return value.replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function formatDate(date) {
  return new Date(date).toLocaleString([], { day:"numeric", month:"short", year:"numeric" });
}

function renderPost(p) {
  const media = p.mediaUrl
    ? (p.mediaType?.startsWith("video")
      ? `<video class="post-media" controls src="${p.mediaUrl}"></video>`
      : `<img class="post-media" src="${p.mediaUrl}" alt="Post media">`)
    : "";

  const voice = p.voiceUrl ? `<audio class="voice" controls src="${p.voiceUrl}"></audio>` : "";

  return `<article class="post">
    ${media}
    <div class="post-body">
      <div class="post-meta"><span>${escapeHTML(p.category)}</span><span>${formatDate(p.createdAt)}</span></div>
      <h3>${escapeHTML(p.author)}</h3>
      ${p.text ? `<p>${escapeHTML(p.text)}</p>` : ""}
      ${voice}
      <div class="actions">
        <button class="like" data-id="${p._id}">♡ ${p.likes || 0}</button>
        <button class="delete" data-id="${p._id}">Delete</button>
      </div>
    </div>
  </article>`;
}

async function loadPosts() {
  feedGrid.innerHTML = `<div class="empty">Loading the mehfil…</div>`;
  try {
    const r = await fetch(`${API}/posts`);
    const posts = await r.json();
    feedGrid.innerHTML = posts.length ? posts.map(renderPost).join("") :
      `<div class="empty">No posts yet. Be the first to share something ✨</div>`;
  } catch {
    feedGrid.innerHTML = `<div class="empty">Could not load posts. Make sure MongoDB and the server are running.</div>`;
  }
}

mediaInput.addEventListener("change", () => {
  const file = mediaInput.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  preview.classList.remove("hidden");
  preview.innerHTML = file.type.startsWith("video")
    ? `<video controls src="${url}"></video>`
    : `<img src="${url}" alt="Preview">`;
});

recordBtn.addEventListener("click", async () => {
  if (recorder?.state === "recording") {
    recorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    voiceBlob = null;
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => audioChunks.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      voiceBlob = new Blob(audioChunks, { type: "audio/webm" });
      recordBtn.textContent = "🎙️ Re-record voice";
      recordBtn.classList.remove("recording");
      clearInterval(timer);
      recordTime.textContent = `Voice recorded: ${seconds}s`;
      seconds = 0;
    };
    recorder.start();
    recordBtn.textContent = "⏹ Stop recording";
    recordBtn.classList.add("recording");
    seconds = 0;
    recordTime.textContent = "00:00";
    timer = setInterval(() => {
      seconds++;
      recordTime.textContent = `Recording ${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
    }, 1000);
  } catch {
    alert("Microphone permission is required to record voice.");
  }
});

form.addEventListener("submit", async e => {
  e.preventDefault();
  const text = document.querySelector("#text").value.trim();
  if (!text && !mediaInput.files[0] && !voiceBlob) {
    alert("Add text, media or voice first.");
    return;
  }

  const btn = document.querySelector("#submitBtn");
  btn.disabled = true;
  btn.textContent = "Publishing…";

  const data = new FormData();
  data.append("author", document.querySelector("#author").value.trim());
  data.append("category", document.querySelector("#category").value);
  data.append("text", text);
  if (mediaInput.files[0]) data.append("media", mediaInput.files[0]);
  if (voiceBlob) data.append("voice", voiceBlob, "voice-note.webm");

  try {
    const r = await fetch(`${API}/posts`, { method:"POST", body:data });
    if (!r.ok) throw new Error();
    form.reset();
    preview.classList.add("hidden");
    preview.innerHTML = "";
    voiceBlob = null;
    recordTime.textContent = "";
    await loadPosts();
    location.hash = "feed";
  } catch {
    alert("Post failed. Check the server and MongoDB connection.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Publish to Mehfil ✨";
  }
});

feedGrid.addEventListener("click", async e => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains("like")) {
    const r = await fetch(`${API}/posts/${id}/like`, { method:"POST" });
    const data = await r.json();
    e.target.textContent = `♥ ${data.likes}`;
  }

  if (e.target.classList.contains("delete")) {
    if (!confirm("Delete this post?")) return;
    await fetch(`${API}/posts/${id}`, { method:"DELETE" });
    loadPosts();
  }
});

document.querySelector("#refreshBtn").addEventListener("click", loadPosts);
document.querySelector("#themeBtn").addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("mehfil-theme", document.body.classList.contains("dark") ? "dark" : "light");
});
if (localStorage.getItem("mehfil-theme") === "dark") document.body.classList.add("dark");

checkAPI();
loadPosts();
