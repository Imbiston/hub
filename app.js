"use strict";
const APP = "OpenTune";
function esc(s){ return String(s ?? "").replace(/[<>&"]/g, c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c])); }
const PLAY_SVG = '<svg role="img" height="24" width="24" viewBox="0 0 24 24"><path d="M7.05 3.606l13.49 7.788a.7.7 0 010 1.212L7.05 20.394A.7.7 0 016 19.788V4.212a.7.7 0 011.05-.606z"></path></svg>';
const PAUSE_SVG = '<svg role="img" height="24" width="24" viewBox="0 0 24 24"><path d="M5.7 3a.7.7 0 00-.7.7v16.6a.7.7 0 00.7.7h2.6a.7.7 0 00.7-.7V3.7a.7.7 0 00-.7-.7H5.7zm10 0a.7.7 0 00-.7.7v16.6a.7.7 0 00.7.7h2.6a.7.7 0 00.7-.7V3.7a.7.7 0 00-.7-.7h-2.6z"></path></svg>';

/* ================= État ================= */
let queue = [], current = -1;
let favs = JSON.parse(localStorage.getItem("ot_favs_v1") || "[]");
let files = JSON.parse(localStorage.getItem("ot_files_v1") || "[]");
let searchResults = [], trend = [], history = [];
const audio = new Audio();
audio.volume = 0.9;
function saveFavs(){ localStorage.setItem("ot_favs_v1", JSON.stringify(favs)); }
function saveFiles(){ localStorage.setItem("ot_files_v1", JSON.stringify(files)); }
function favKey(t){ return t.title + "|" + t.artist; }
function isFav(t){ return favs.some(f=>favKey(f) === favKey(t)); }

/* ================= Audius ================= */
let audiusHost = null;
async function initAudius(){
  try{
    const r = await fetch("https://api.audius.co");
    const j = await r.json();
    const hosts = j.data || [];
    audiusHost = hosts.length ? hosts[Math.floor(Math.random()*Math.min(hosts.length,5))] : "https://discoveryprovider.audius.co";
  }catch(e){
    audiusHost = "https://discoveryprovider.audius.co";
  }
  loadTrending();
}
function mapAudius(t){
  return {
    id: t.id, title: t.title,
    artist: (t.user && t.user.name) || "Artiste Audius",
    art: (t.artwork && (t.artwork["480x480"] || t.artwork["150x150"] || t.artwork["1000x1000"])) || "./assets/favicon.png",
    src: audiusHost + "/v1/tracks/" + t.id + "/stream?app_name=" + APP,
    local: false, full: true
  };
}
function mapItunes(t){
  return { id:"it-"+t.trackId, title:t.trackName, artist:t.artistName,
           art:(t.artworkUrl100||"").replace("100x100","300x300") || "./assets/favicon.png", src:t.previewUrl,
           local:false, full:false };
}
async function fetchAudius(path){
  const r = await fetch(audiusHost + path + (path.includes("?") ? "&" : "?") + "app_name=" + APP);
  if(!r.ok) throw new Error("Audius " + r.status);
  return r.json();
}

/* ================= Cartes (li du template) ================= */
function liTrack(t, ctx, idx){
  const faved = isFav(t);
  return `<li data-ctx="${ctx}" data-idx="${idx}">
    <img src="${esc(t.art)}" loading="lazy" onerror="this.src='./assets/favicon.png'">
    <button type="button" class="btn me-3" title="Écouter" onclick="playFrom('${ctx}',${idx})">${PLAY_SVG}</button>
    <button type="button" class="btn me-3 heart ${faved ? "faved" : ""}" title="Favori" onclick="toggleFav('${ctx}',${idx})" style="${faved ? "opacity:1" : ""}">♥</button>
    <span>${esc(t.title)}</span>
    <p><br>${esc(t.artist)} · ${t.local ? "📁 local" : t.full ? "🎧 complet" : "extrait 30 s"}</p>
  </li>`;
}
function renderList(id, tracks, ctx, emptyMsg, emptyImg){
  const el = document.getElementById(id);
  if(!el) return;
  el.innerHTML = tracks.length
    ? tracks.map((t,i)=>liTrack(t, ctx, i)).join("")
    : `<li><img src="${emptyImg}"><span>${esc(emptyMsg)}</span><p><br>&nbsp;</p></li>`;
}
function getStore(ctx){
  if(ctx === "search") return searchResults;
  if(ctx === "trending") return trend;
  if(ctx === "favs") return favs;
  if(ctx === "files") return files;
  if(ctx === "queue") return queue;
  if(ctx === "history") return history;
  return [];
}
window.playFrom = (ctx, idx)=>{
  const t = getStore(ctx)[idx];
  if(!t) return;
  if(ctx === "queue"){ playIndex(idx); return; }
  queue.push({...t});
  playIndex(queue.length - 1);
  renderAll();
};
window.toggleFav = (ctx, idx)=>{
  const t = getStore(ctx)[idx];
  if(!t) return;
  const k = favKey(t);
  const i = favs.findIndex(f=>favKey(f) === k);
  if(i >= 0) favs.splice(i,1); else favs.push({...t});
  saveFavs(); renderAll();
};
function renderAll(){
  renderList("trendList", trend, "trending", "Chargement…", "./assets/7.jpeg");
  renderList("favList", favs, "favs", "Aucun favori — clique ♥ sur un titre", "./assets/8.jpeg");
  renderList("fileList", files, "files", "Aucun fichier — « Ajouter mes fichiers » à gauche", "./assets/9.jpeg");
  renderList("queueList", queue, "queue", "File vide — ajoute des titres avec ▶", "./assets/10.jpeg");
  renderList("searchList", searchResults, "search", "Aucun résultat", "./assets/11.jpeg");
  renderList("playlistsRecentes", history.slice(0,6), "history", "Rien pour l'instant", "./assets/1.jpeg");
}

/* ================= Recherche ================= */
async function doSearch(){
  const term = document.getElementById("searchInput").value.trim();
  if(!term) return;
  document.getElementById("secSearch").style.display = "";
  searchResults = [];
  renderList("searchList", [], "search", "Recherche…", "./assets/11.jpeg");
  document.getElementById("secSearch").scrollIntoView({behavior:"smooth"});
  if(audiusHost){
    try{
      const j = await fetchAudius("/v1/tracks/search?query=" + encodeURIComponent(term));
      searchResults = (j.data || []).filter(t=>t.is_streamable !== false).map(mapAudius);
      if(searchResults.length){ renderAll(); return; }
    }catch(e){}
  }
  try{
    const r = await fetch("https://itunes.apple.com/search?term=" + encodeURIComponent(term) + "&media=music&limit=30");
    const j = await r.json();
    searchResults = (j.results || []).filter(t=>t.previewUrl).map(mapItunes);
    renderAll();
  }catch(e){
    renderList("searchList", [], "search", "Erreur : " + e.message, "./assets/11.jpeg");
  }
}

/* ================= Tendances ================= */
async function loadTrending(){
  try{
    const j = await fetchAudius("/v1/tracks/trending?limit=30");
    trend = (j.data || []).map(mapAudius);
  }catch(e){
    trend = [];
  }
  renderAll();
}

/* ================= Fichiers locaux ================= */
const fileInput = document.getElementById("fileInput");
document.getElementById("fileBtnTop").onclick = ()=>fileInput.click();
fileInput.onchange = e=>{
  for(const f of e.target.files){
    files.push({ id:"f"+Date.now()+Math.random(), title:f.name.replace(/\.[^.]+$/,""), artist:"Fichier local",
                 art:"./assets/favicon.png", src:URL.createObjectURL(f), local:true, full:true });
  }
  saveFiles(); renderAll();
  e.target.value = "";
};

/* ================= File d'attente ================= */
document.getElementById("qClearBtn").onclick = (e)=>{
  e.preventDefault();
  audio.pause(); queue = []; current = -1; stopAll(); renderAll();
};

/* ================= Lecture ================= */
const playBtn = document.querySelector(".playPause");
function fmt(s){
  if(!isFinite(s)) return "00:00";
  const m = Math.floor(s/60), sec = Math.floor(s%60);
  return String(m).padStart(2,"0") + ":" + String(sec).padStart(2,"0");
}
function playIndex(i){
  if(i < 0 || i >= queue.length) return;
  current = i;
  const t = queue[i];
  audio.src = t.src;
  audio.play().catch(()=>{});
  document.getElementById("musicaPlay").innerHTML = `
    <div class="d-flex align-items-center gap-2" style="min-width:0">
      <img src="${esc(t.art)}" style="width:48px;height:48px;border-radius:6px;object-fit:cover" onerror="this.src='./assets/favicon.png'">
      <div style="min-width:0">
        <div style="font-size:.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px">${esc(t.title)}</div>
        <div style="font-size:.72rem;color:#8a8a8a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px">${esc(t.artist)}</div>
      </div>
    </div>`;
  history = [{...t}, ...history.filter(h=>favKey(h) !== favKey(t))].slice(0,6);
  renderAll();
}
function stopAll(){
  document.getElementById("musicaPlay").innerHTML = '<span style="color:#8a8a8a; font-size:.8rem;">—</span>';
  playBtn.innerHTML = PLAY_SVG;
}
playBtn.onclick = ()=>{
  if(!audio.src){ if(queue.length) playIndex(0); return; }
  if(audio.paused) audio.play().catch(()=>{}); else audio.pause();
};
document.querySelector(".proximo").onclick = ()=>playIndex((current+1) % Math.max(queue.length,1));
document.querySelector(".anterior").onclick = ()=>{
  if(audio.currentTime > 3){ audio.currentTime = 0; return; }
  playIndex((current-1+queue.length) % Math.max(queue.length,1));
};
audio.onplay = ()=>{ playBtn.innerHTML = PAUSE_SVG; };
audio.onpause = ()=>{ playBtn.innerHTML = PLAY_SVG; };
audio.onended = ()=>{ if(queue.length) playIndex((current+1) % queue.length); };
audio.ontimeupdate = ()=>{
  document.getElementById("tCur").textContent = fmt(audio.currentTime);
  if(audio.duration && isFinite(audio.duration)){
    document.getElementById("tDur").textContent = fmt(audio.duration);
    document.getElementById("seekRange").value = Math.round(audio.currentTime / audio.duration * 1000);
  }
};
document.getElementById("seekRange").oninput = e=>{
  if(audio.duration && isFinite(audio.duration)) audio.currentTime = e.target.value / 1000 * audio.duration;
};
document.getElementById("volRange").oninput = e=>{ audio.volume = e.target.value / 100; };
document.addEventListener("keydown", e=>{
  if(e.code === "Space" && !["INPUT","TEXTAREA"].includes(document.activeElement.tagName)){
    e.preventDefault(); playBtn.click();
  }
});

/* ================= Navigation ================= */
document.getElementById("navSearch").onclick = (e)=>{
  e.preventDefault();
  document.getElementById("searchInput").focus();
};
document.getElementById("botomSearch").onclick = (e)=>{
  e.preventDefault();
  document.getElementById("searchInput").focus();
};
document.getElementById("searchInput").addEventListener("keydown", e=>{
  if(e.key === "Enter") doSearch();
});

/* ================= Salutation (du template) ================= */
(function(){
  const greeting = document.getElementById("greeting");
  const hour = new Date().getHours();
  greeting.innerHTML = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
})();

/* Scroll observer (du template) */
(function(){
  const nav = document.querySelector("#topNav");
  const sectionOne = document.querySelector(".fw-bold");
  if(!nav || !sectionOne) return;
  const observer = new IntersectionObserver(function(entries){
    entries.forEach(entry=>{
      nav.style.backgroundColor = entry.isIntersecting ? "transparent" : "black";
    });
  }, {});
  observer.observe(sectionOne);
})();

/* ================= Init ================= */
renderAll();
initAudius();
