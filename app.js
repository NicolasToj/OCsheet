// =========================================================
// OCsheets — app.js
// =========================================================
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let session = null;
let profile = null;
let groups = [];
let characters = [];
let charGroups = []; // [{character_id, group_id}]
let stories = [];
let charStories = []; // [{character_id, story_id}]
let isSignup = false;
let activeTab = "personajes"; // 'inicio' | 'personajes' | 'historias' | 'imagenes'
let activeNav = "all"; // 'all' | 'none' | group id (dentro de Personajes)
let activeCharId = null;
let activeStoryId = null;
let groupsCollapsed = false;
let saveTimers = {};
let expandedStatsIds = new Set(); // ids de personajes con "OC Expansión" abierto (solo en memoria)
let expandedGroupsPickerIds = new Set(); // ids de personajes con el picker de "Grupos" abierto
let expandedStoriesPickerIds = new Set(); // ids de personajes con el picker de "Historias" abierto
let expandedCharPickerIds = new Set(); // ids de historias con el picker de "Personajes vinculados" abierto

const DEFAULT_STATS = ["Fuerza", "Destreza", "Constitución", "Inteligencia", "Sabiduría", "Carisma"];
const STAT_COLORS = ["#ff6b6b", "#feca57", "#1dd1a1", "#54a0ff", "#c56cf0", "#ff9ff3", "#00d2d3", "#f368e0", "#ff9f43", "#5f27cd"];

const $ = (sel, root = document) => root.querySelector(sel);
const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ---------------- BOOT ----------------
function hideBoot() { $("#boot-loading").classList.add("hidden"); }
function showAuth() { hideBoot(); $("#auth-screen").classList.remove("hidden"); $("#app-screen").classList.add("hidden"); }
function showApp() { hideBoot(); $("#auth-screen").classList.add("hidden"); $("#app-screen").classList.remove("hidden"); }

sb.auth.onAuthStateChange((event, s) => {
  if (event === "PASSWORD_RECOVERY") {
    session = s;
    showApp();
    openSetNewPasswordModal();
    return;
  }
  session = s;
  if (session) { showApp(); loadAll(); } else { showAuth(); }
});
sb.auth.getSession().then(({ data }) => {
  session = data.session;
  if (session) { showApp(); loadAll(); } else { showAuth(); }
}).catch((err) => {
  console.error("No se pudo verificar la sesión:", err);
  showAuth();
});

// Red de seguridad: si nada responde en 8s, no dejamos la pantalla de
// carga pegada para siempre — mostramos el login igual.
setTimeout(() => {
  if ($("#boot-loading").classList.contains("hidden")) return;
  console.warn("El arranque tardó demasiado — mostrando login de todos modos.");
  showAuth();
}, 8000);

// ---------------- AUTH UI ----------------
$("#auth-toggle-btn").addEventListener("click", () => {
  isSignup = !isSignup;
  $("#auth-sub").textContent = isSignup ? "Crea tu cuenta" : "Inicia sesión para ver tus personajes";
  $("#auth-submit").textContent = isSignup ? "Crear cuenta" : "Entrar";
  $("#auth-toggle-text").textContent = isSignup ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?";
  $("#auth-toggle-btn").textContent = isSignup ? "Entrar" : "Crear una";
  $("#auth-error").textContent = "";
});

$("#auth-submit").addEventListener("click", async () => {
  const email = $("#auth-email").value.trim();
  const password = $("#auth-password").value;
  $("#auth-error").textContent = "";
  if (!email || !password) { $("#auth-error").textContent = "Completa correo y contraseña."; return; }
  const fn = isSignup ? sb.auth.signUp({ email, password }) : sb.auth.signInWithPassword({ email, password });
  const { error } = await fn;
  if (error) { $("#auth-error").textContent = error.message; return; }
  if (isSignup) $("#auth-error").textContent = "Cuenta creada. Si pide confirmación, revisa tu correo y luego inicia sesión.";
});

$("#logout-btn").addEventListener("click", () => sb.auth.signOut());

// ---------------- RECUPERAR CONTRASEÑA ----------------
$("#forgot-password-btn").addEventListener("click", async () => {
  const email = $("#auth-email").value.trim();
  $("#auth-error").textContent = "";
  if (!email) { $("#auth-error").textContent = "Escribe tu correo arriba primero, luego dale clic aquí."; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  $("#auth-error").textContent = error ? error.message : "Listo — revisa tu correo para el link de recuperación.";
});

function openSetNewPasswordModal() {
  openModal(`
    <h3>Elige una nueva contraseña</h3>
    <p>Vienes desde un link de recuperación. Escribe tu nueva contraseña para continuar.</p>
    <input type="password" id="new-pw-input" placeholder="Nueva contraseña (mínimo 6 caracteres)" />
    <div class="auth-error" id="new-pw-error"></div>
    <div class="modal-actions"><button class="btn-confirm" id="new-pw-save">Guardar</button></div>
  `, { mandatory: true });
  $("#new-pw-input").focus();
  $("#new-pw-save").addEventListener("click", async () => {
    const pw = $("#new-pw-input").value;
    if (!pw || pw.length < 6) { $("#new-pw-error").textContent = "Mínimo 6 caracteres."; return; }
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) { $("#new-pw-error").textContent = error.message; return; }
    closeModal();
    loadAll();
  });
}

// ---------------- OAUTH (Google / Facebook) ----------------
$("#oauth-google-btn").addEventListener("click", () => {
  sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + window.location.pathname } });
});
$("#oauth-facebook-btn").addEventListener("click", () => {
  sb.auth.signInWithOAuth({ provider: "facebook", options: { redirectTo: window.location.origin + window.location.pathname } });
});

// ---------------- LIGHTBOX (ver imagen en grande + zoom + flechas) ----------------
let lightboxSet = [];
let lightboxIndex = 0;
function openLightbox(urls, index) {
  const arr = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
  if (arr.length === 0) return;
  lightboxSet = arr;
  lightboxIndex = index || 0;
  showLightboxImage();
  $("#lightbox-overlay").classList.remove("hidden");
}
function showLightboxImage() {
  $("#lightbox-img").src = lightboxSet[lightboxIndex];
  $("#lightbox-img").classList.remove("zoomed");
  const multi = lightboxSet.length > 1;
  $("#lightbox-prev").classList.toggle("hidden", !multi);
  $("#lightbox-next").classList.toggle("hidden", !multi);
}
function closeLightbox() { $("#lightbox-overlay").classList.add("hidden"); }
function lightboxPrev() { lightboxIndex = (lightboxIndex - 1 + lightboxSet.length) % lightboxSet.length; showLightboxImage(); }
function lightboxNext() { lightboxIndex = (lightboxIndex + 1) % lightboxSet.length; showLightboxImage(); }
$("#lightbox-close").addEventListener("click", closeLightbox);
$("#lightbox-prev").addEventListener("click", lightboxPrev);
$("#lightbox-next").addEventListener("click", lightboxNext);
$("#lightbox-overlay").addEventListener("click", (e) => { if (e.target.id === "lightbox-overlay") closeLightbox(); });
$("#lightbox-img").addEventListener("click", (e) => { e.target.classList.toggle("zoomed"); });
document.addEventListener("keydown", (e) => {
  if ($("#lightbox-overlay").classList.contains("hidden")) return;
  if (e.key === "ArrowLeft") lightboxPrev();
  if (e.key === "ArrowRight") lightboxNext();
  if (e.key === "Escape") closeLightbox();
});

$("#menu-btn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
function closeMobileNav() { $("#sidebar").classList.remove("open"); }

// ---------------- BRAND / HOME + PESTAÑAS ----------------
function goHome() { activeTab = "inicio"; activeCharId = null; activeStoryId = null; renderAll(); closeMobileNav(); }
$("#brand-home").addEventListener("click", goHome);
$("#account-bubble").addEventListener("click", goHome);

function renderAccountBubble() {
  const btn = $("#account-bubble-inner");
  if (!btn || !profile) return;
  btn.innerHTML = profile.avatar_url
    ? `<img src="${profile.avatar_url}" />`
    : `<span>${escapeHtml((profile.display_name || "?").trim().charAt(0).toUpperCase() || "?")}</span>`;
}

$all(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    activeTab = btn.dataset.tab;
    activeCharId = null;
    activeStoryId = null;
    renderAll();
    closeMobileNav();
  });
});

function fadeMain() {
  const m = $("#main");
  m.classList.remove("fade-in");
  void m.offsetWidth;
  m.classList.add("fade-in");
}

// ---------------- SAVE INDICATOR ----------------
function setSaving(state) {
  const el = $("#save-indicator");
  if (!el) return;
  el.className = state;
  el.textContent = state === "saving" ? "Guardando…" : state === "saved" ? "Guardado" : state === "error" ? "Error" : "";
}

// ---------------- LOAD DATA ----------------
async function loadAll() {
  const uidUser = session.user.id;
  try {
    let { data: prof } = await sb.from("profile").select("*").eq("user_id", uidUser).maybeSingle();
    if (!prof) {
      const { data: created } = await sb.from("profile").insert({ user_id: uidUser, display_name: "Mi perfil" }).select().single();
      prof = created;
    }
    profile = prof;

    const [{ data: g }, { data: c }, { data: cg }, { data: st }, { data: cs }] = await Promise.all([
      sb.from("groups").select("*").order("created_at", { ascending: true }),
      sb.from("characters").select("*").eq("user_id", uidUser).order("created_at", { ascending: true }),
      sb.from("character_groups").select("*"),
      sb.from("stories").select("*").eq("user_id", uidUser).order("created_at", { ascending: true }),
      sb.from("character_stories").select("*"),
    ]);
    groups = g || [];
    characters = c || [];
    charGroups = cg || [];
    stories = st || [];
    charStories = cs || [];

    renderAll();
    subscribeRealtime();
    ensureHandle();
  } catch (err) {
    console.error("Error cargando tus datos:", err);
    $("#main").innerHTML = `
      <div class="empty-state">
        <p>No se pudo cargar tu información. Puede ser tu conexión, o que el proyecto de Supabase esté pausado/mal configurado.</p>
        <button id="retry-load-btn">Reintentar</button>
      </div>`;
    const retryBtn = $("#retry-load-btn");
    if (retryBtn) retryBtn.addEventListener("click", loadAll);
  }
}

function ensureHandle() {
  if (profile && !profile.handle) openHandleModal();
}

function openHandleModal() {
  openModal(`
    <h3>Elige tu @usuario</h3>
    <p>Así es como otras personas te van a encontrar más adelante — nunca se muestra tu correo, solo esto.</p>
    <input id="handle-input" placeholder="tu_usuario" />
    <div class="auth-error" id="handle-error"></div>
    <div class="modal-actions">
      <button class="btn-confirm" id="handle-save-btn">Guardar</button>
    </div>
  `, { mandatory: true });
  $("#handle-input").focus();
  $("#handle-save-btn").addEventListener("click", async () => {
    let v = $("#handle-input").value.trim().replace(/^@/, "").replace(/\s+/g, "_");
    if (!v) { $("#handle-error").textContent = "Escribe algo, aunque sea corto."; return; }
    await saveProfile({ handle: v });
    closeModal();
    renderAll();
  });
}

let realtimeChannel = null;
function subscribeRealtime() {
  if (realtimeChannel) return;
  realtimeChannel = sb
    .channel("ocsheets-changes")
    .on("postgres_changes", { event: "*", schema: "public" }, () => loadAllQuiet())
    .subscribe();
}
async function loadAllQuiet() {
  const uidUser = session.user.id;
  const [{ data: g }, { data: c }, { data: cg }, { data: st }, { data: cs }, { data: prof }] = await Promise.all([
    sb.from("groups").select("*").order("created_at", { ascending: true }),
    sb.from("characters").select("*").eq("user_id", uidUser).order("created_at", { ascending: true }),
    sb.from("character_groups").select("*"),
    sb.from("stories").select("*").eq("user_id", uidUser).order("created_at", { ascending: true }),
    sb.from("character_stories").select("*"),
    sb.from("profile").select("*").eq("user_id", uidUser).maybeSingle(),
  ]);
  groups = g || []; characters = c || []; charGroups = cg || []; stories = st || []; charStories = cs || [];
  if (prof) profile = prof;
  renderAll();
}

// ---------------- RENDER ROOT ----------------
function renderAll() {
  renderAccountBubble();
  renderSidebar();

  if (activeCharId && characters.find((c) => c.id === activeCharId)) {
    renderDetail(characters.find((c) => c.id === activeCharId));
    return;
  }
  activeCharId = null;

  if (activeStoryId && stories.find((s) => s.id === activeStoryId)) {
    renderStoryDetail(stories.find((s) => s.id === activeStoryId));
    return;
  }
  activeStoryId = null;

  switch (activeTab) {
    case "inicio": renderInicioView(); break;
    case "historias": renderStoriesGridView(); break;
    case "imagenes": renderImagesView(); break;
    default: renderGridView();
  }
}

// ---------------- SIDEBAR (contenido según pestaña) ----------------
function renderSidebar() {
  $all(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === activeTab));
  const ctx = $("#sidebar-context");
  if (activeTab === "personajes") {
    ctx.innerHTML = personajesSidebarHtml();
    wirePersonajesSidebar();
  } else if (activeTab === "historias") {
    ctx.innerHTML = historiasSidebarHtml();
    wireHistoriasSidebar();
  } else {
    ctx.innerHTML = "";
  }
}

function personajesSidebarHtml() {
  const noGroupCount = characters.filter((c) => !charGroups.some((cg) => cg.character_id === c.id)).length;
  return `
    <button class="sidebar-new-btn" id="new-char-btn">+ Nuevo personaje</button>
    <div class="nav-row ${activeNav === "all" ? "active" : ""}" id="nav-all"><span>Todos</span><span class="count">${characters.length}</span></div>
    <div class="nav-row ${activeNav === "none" ? "active" : ""}" id="nav-none"><span>Sin grupo</span><span class="count">${noGroupCount}</span></div>
    <button class="collapsible-head ${groupsCollapsed ? "" : "open"}" id="groups-collapse-toggle">
      <span>Grupos</span><span class="chev">›</span>
    </button>
    <div id="groups-collapse-body" class="${groupsCollapsed ? "hidden" : ""}">
      <div id="groups-list"></div>
      <div id="new-group-row">
        <input type="text" id="new-group-input" placeholder="Nombre del grupo" />
        <button id="new-group-save" title="Crear grupo">💾</button>
      </div>
    </div>
  `;
}

function wirePersonajesSidebar() {
  $("#new-char-btn").addEventListener("click", openNewCharacterModal);
  $("#nav-all").addEventListener("click", () => { activeNav = "all"; activeCharId = null; renderAll(); closeMobileNav(); });
  $("#nav-none").addEventListener("click", () => { activeNav = "none"; activeCharId = null; renderAll(); closeMobileNav(); });
  $("#groups-collapse-toggle").addEventListener("click", () => { groupsCollapsed = !groupsCollapsed; renderSidebar(); });
  renderGroupsList();
  $("#new-group-save").addEventListener("click", createGroupFromInput);
  $("#new-group-input").addEventListener("keydown", (e) => { if (e.key === "Enter") createGroupFromInput(); });
}

function renderGroupsList() {
  const list = $("#groups-list");
  if (!list) return;
  list.innerHTML = "";
  groups.forEach((g) => {
    const count = charGroups.filter((cg) => cg.group_id === g.id).length;
    const row = document.createElement("div");
    row.className = "group-row";
    row.innerHTML = `
      <div class="nav-row ${activeNav === g.id ? "active" : ""}" data-nav="${g.id}">
        <span class="gname">${escapeHtml(g.name)}</span><span class="count">${count}</span>
      </div>
      <button class="group-del" data-del-group="${g.id}" title="Eliminar grupo">✕</button>
    `;
    const navRow = row.querySelector(".nav-row");
    navRow.addEventListener("click", () => { activeNav = g.id; activeCharId = null; renderAll(); closeMobileNav(); });
    navRow.addEventListener("dragover", (e) => { e.preventDefault(); navRow.classList.add("droptarget"); });
    navRow.addEventListener("dragleave", () => navRow.classList.remove("droptarget"));
    navRow.addEventListener("drop", async (e) => {
      e.preventDefault();
      navRow.classList.remove("droptarget");
      const charId = e.dataTransfer.getData("text/character-id");
      if (charId) await addCharacterToGroup(charId, g.id);
    });
    row.querySelector("[data-del-group]").addEventListener("click", (e) => {
      e.stopPropagation();
      openConfirmModal({
        title: "¿Eliminar grupo?",
        text: `Se eliminará el grupo "${g.name}". Los personajes no se borran, solo dejan de pertenecer a él.`,
        confirmLabel: "Eliminar",
        danger: true,
        onConfirm: async () => { await sb.from("groups").delete().eq("id", g.id); await loadAllQuiet(); },
      });
    });
    list.appendChild(row);
  });
}

async function createGroupFromInput() {
  const input = $("#new-group-input");
  const name = input.value.trim();
  if (!name) return;
  setSaving("saving");
  const { error } = await sb.from("groups").insert({ user_id: session.user.id, name });
  input.value = "";
  if (error) { setSaving("error"); return; }
  setSaving("saved");
  await loadAllQuiet();
}

async function addCharacterToGroup(characterId, groupId) {
  setSaving("saving");
  const { error } = await sb.from("character_groups").insert({ user_id: session.user.id, character_id: characterId, group_id: groupId });
  setSaving(error && error.code !== "23505" ? "error" : "saved");
  await loadAllQuiet();
}
async function removeCharacterFromGroup(characterId, groupId) {
  setSaving("saving");
  await sb.from("character_groups").delete().eq("character_id", characterId).eq("group_id", groupId);
  setSaving("saved");
  await loadAllQuiet();
}

// ---------------- HISTORIAS: sidebar ----------------
function historiasSidebarHtml() {
  return `
    <button class="sidebar-new-btn" id="new-story-btn">+ Nueva historia</button>
    <div class="nav-row ${!activeStoryId ? "active" : ""}" id="story-nav-all"><span>Todas</span><span class="count">${stories.length}</span></div>
    <div id="stories-list" style="margin-top:8px"></div>
  `;
}
function wireHistoriasSidebar() {
  $("#new-story-btn").addEventListener("click", openNewStoryModal);
  $("#story-nav-all").addEventListener("click", () => { activeStoryId = null; renderAll(); closeMobileNav(); });
  renderStoriesSidebarList();
}
function renderStoriesSidebarList() {
  const list = $("#stories-list");
  if (!list) return;
  list.innerHTML = "";
  stories.forEach((s) => {
    const row = document.createElement("div");
    row.className = "group-row";
    row.innerHTML = `
      <div class="nav-row ${activeStoryId === s.id ? "active" : ""}">${escapeHtml(s.title)}</div>
      <button class="group-del" title="Eliminar">✕</button>
    `;
    row.querySelector(".nav-row").addEventListener("click", () => { activeStoryId = s.id; renderAll(); closeMobileNav(); });
    row.querySelector(".group-del").addEventListener("click", (e) => {
      e.stopPropagation();
      openConfirmModal({
        title: "¿Eliminar historia?",
        text: `Se eliminará "${s.title}" para siempre.`,
        confirmLabel: "Eliminar",
        danger: true,
        onConfirm: async () => { await sb.from("stories").delete().eq("id", s.id); if (activeStoryId === s.id) activeStoryId = null; await loadAllQuiet(); },
      });
    });
    list.appendChild(row);
  });
}

$("#export-btn").addEventListener("click", downloadBackup);
function downloadBackup() {
  const blob = new Blob([JSON.stringify({ profile, groups, characters, charGroups, stories, charStories }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "ocsheets-backup.json"; a.click();
  URL.revokeObjectURL(url);
}

// ---------------- MAIN: GRID VIEW (Personajes) ----------------
function renderGridView() {
  const main = $("#main");
  const visible = activeNav === "all"
    ? characters
    : activeNav === "none"
    ? characters.filter((c) => !charGroups.some((cg) => cg.character_id === c.id))
    : characters.filter((c) => charGroups.some((cg) => cg.character_id === c.id && cg.group_id === activeNav));

  const title = activeNav === "all" ? "Todos los personajes" : activeNav === "none" ? "Sin grupo" : (groups.find((g) => g.id === activeNav)?.name || "Grupo");

  main.innerHTML = `
    <div class="view-title">${escapeHtml(title)}</div>
    <div class="view-sub">${visible.length} ${visible.length === 1 ? "personaje" : "personajes"}</div>
    ${visible.length === 0
      ? `<div class="empty-state"><p>Todavía no hay personajes aquí.</p><button id="empty-new-char">+ Crear el primero</button></div>`
      : `<div id="char-grid"></div>`}
  `;

  if (visible.length === 0) {
    $("#empty-new-char").addEventListener("click", openNewCharacterModal);
    fadeMain();
    return;
  }

  const grid = $("#char-grid");
  visible.forEach((c) => {
    const card = document.createElement("div");
    card.className = "char-card";
    card.draggable = true;
    card.innerHTML = `
      <div class="thumb">${c.avatar_url ? `<img src="${c.avatar_url}" />` : "Sin imagen"}</div>
      <div class="meta">
        <div class="cname">${escapeHtml(c.name)}</div>
        <div class="cspecies">${escapeHtml(c.species || "—")}</div>
      </div>
      ${activeNav !== "all" && activeNav !== "none" ? `<button class="remove-from-group">Quitar de este grupo</button>` : ""}
    `;
    card.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/character-id", c.id));
    card.addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-from-group")) return;
      activeCharId = c.id; renderAll();
    });
    const rmBtn = card.querySelector(".remove-from-group");
    if (rmBtn) rmBtn.addEventListener("click", (e) => { e.stopPropagation(); removeCharacterFromGroup(c.id, activeNav); });
    grid.appendChild(card);
  });
  fadeMain();
}

function profileHeaderHtml() {
  return `
  <div class="profile-header">
    <div class="profile-avatar" id="profile-avatar-box">
      ${profile.avatar_url ? `<img src="${profile.avatar_url}" id="profile-avatar-img" />` : `<span class="hint">Subir foto</span>`}
    </div>
    <div class="profile-info">
      <div class="name-row">
        <div style="flex:1">
          <input class="pname" id="profile-name" value="${escapeAttr(profile.display_name)}" placeholder="Nombre" />
          <input class="phandle" id="profile-handle" value="${escapeAttr(profile.handle)}" placeholder="@usuario" />
        </div>
        <button class="manual-save-btn" id="save-profile-btn" title="Guardar ahora">💾</button>
      </div>
      <div class="pabout-label">Acerca de</div>
      <textarea class="pabout" id="profile-about" rows="2" placeholder="Cuéntanos de ti...">${escapeHtml(profile.about)}</textarea>
      <input class="plinks" id="profile-links" value="${escapeAttr(profile.links)}" placeholder="Enlaces separados por coma" />
    </div>
  </div>`;
}

// ---------------- INICIO ----------------
function renderInicioView() {
  const main = $("#main");
  const recentChars = [...characters].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 4);
  const recentStories = [...stories].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 4);

  main.innerHTML = `
    ${profileHeaderHtml()}
    <div class="view-sub" style="margin-top:-8px;margin-bottom:22px">${characters.length} ${characters.length === 1 ? "personaje" : "personajes"} en total</div>

    <div class="inicio-section">
      <div class="section-label" style="margin-bottom:10px">Últimos personajes editados</div>
      ${recentChars.length === 0 ? `<div class="gp-empty">Todavía no tienes personajes.</div>` : `<div id="inicio-chars-row" class="inicio-mini-row"></div>`}
    </div>

    <div class="inicio-section">
      <div class="section-label" style="margin-bottom:10px">Últimas historias</div>
      ${recentStories.length === 0 ? `<div class="gp-empty">Todavía no tienes historias.</div>` : `<div id="inicio-stories-row" class="inicio-mini-row"></div>`}
    </div>

    <div class="inicio-section">
      <div class="section-label" style="margin-bottom:10px">⚙ Ajustes</div>
      <div class="settings-box">
        <button id="settings-change-pw">Cambiar contraseña</button>
        <button id="settings-backup">⬇ Descargar backup</button>
        <button id="settings-logout" style="color:var(--danger)">Cerrar sesión</button>
      </div>
    </div>
  `;
  bindProfileHeader();
  if (profile.avatar_url) $("#profile-avatar-img").addEventListener("click", (e) => { e.stopPropagation(); openLightbox([profile.avatar_url], 0); });

  if (recentChars.length) {
    const row = $("#inicio-chars-row");
    recentChars.forEach((c) => {
      const card = document.createElement("div");
      card.className = "inicio-mini-card";
      card.innerHTML = `
        <div class="inicio-mini-thumb">${c.avatar_url ? `<img src="${c.avatar_url}" />` : "🧑‍🎨"}</div>
        <div class="inicio-mini-name">${escapeHtml(c.name)}</div>
      `;
      card.addEventListener("click", () => { activeTab = "personajes"; activeCharId = c.id; renderAll(); });
      row.appendChild(card);
    });
  }
  if (recentStories.length) {
    const row = $("#inicio-stories-row");
    recentStories.forEach((s) => {
      const card = document.createElement("div");
      card.className = "inicio-mini-card";
      card.innerHTML = `
        <div class="inicio-mini-thumb">📖</div>
        <div class="inicio-mini-name">${escapeHtml(s.title)}</div>
      `;
      card.addEventListener("click", () => { activeTab = "historias"; activeStoryId = s.id; renderAll(); });
      row.appendChild(card);
    });
  }

  $("#settings-change-pw").addEventListener("click", openChangePasswordModal);
  $("#settings-backup").addEventListener("click", downloadBackup);
  $("#settings-logout").addEventListener("click", () => sb.auth.signOut());

  fadeMain();
}

function openChangePasswordModal() {
  openModal(`
    <h3>Cambiar contraseña</h3>
    <input type="password" id="cp-input" placeholder="Nueva contraseña (mínimo 6 caracteres)" />
    <div class="auth-error" id="cp-error"></div>
    <div class="modal-actions">
      <button class="btn-cancel" data-close>Cancelar</button>
      <button class="btn-confirm" id="cp-save">Guardar</button>
    </div>
  `);
  $("#cp-input").focus();
  $("#cp-save").addEventListener("click", async () => {
    const pw = $("#cp-input").value;
    if (!pw || pw.length < 6) { $("#cp-error").textContent = "Mínimo 6 caracteres."; return; }
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) { $("#cp-error").textContent = error.message; return; }
    closeModal();
  });
}

function bindProfileHeader() {
  $("#profile-avatar-box").addEventListener("click", () => $("#profile-avatar-input").click());
  $("#profile-name").addEventListener("input", debounce(() => saveProfile({ display_name: $("#profile-name").value })));
  $("#profile-handle").addEventListener("input", debounce(() => saveProfile({ handle: $("#profile-handle").value })));
  $("#profile-about").addEventListener("input", debounce(() => saveProfile({ about: $("#profile-about").value })));
  $("#profile-links").addEventListener("input", debounce(() => saveProfile({ links: $("#profile-links").value })));
  $("#save-profile-btn").addEventListener("click", () => flashSave(saveProfile({
    display_name: $("#profile-name").value,
    handle: $("#profile-handle").value,
    about: $("#profile-about").value,
    links: $("#profile-links").value,
  }), "#save-profile-btn"));
}

async function saveProfile(patch) {
  setSaving("saving");
  const { error } = await sb.from("profile").update(patch).eq("user_id", session.user.id);
  setSaving(error ? "error" : "saved");
  Object.assign(profile, patch);
}

$("#profile-avatar-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  const url = await uploadImage(file, `${session.user.id}/profile.jpg`, 640, 0.82);
  if (url) { await saveProfile({ avatar_url: url }); renderAll(); }
});

// ---------------- IMÁGENES: solo tus propias fotos ----------------
function renderImagesView() {
  const main = $("#main");
  const tiles = [];
  characters.forEach((c) => {
    if (c.avatar_url) tiles.push({ src: c.avatar_url, label: c.name + " · avatar" });
    if (c.banner_url) tiles.push({ src: c.banner_url, label: c.name + " · banner" });
    (c.gallery || []).forEach((g) => tiles.push({ src: g.src, label: c.name }));
  });

  main.innerHTML = `
    <div class="view-title">Imágenes</div>
    <div class="view-sub">${tiles.length} ${tiles.length === 1 ? "imagen" : "imágenes"} en total · solo tuyas</div>
    ${tiles.length === 0
      ? `<div class="empty-state"><p>Todavía no has subido ninguna imagen.</p></div>`
      : `<div id="images-grid"></div>`}
  `;
  if (tiles.length === 0) { fadeMain(); return; }
  const urls = tiles.map((t) => t.src);
  const grid = $("#images-grid");
  tiles.forEach((t, i) => {
    const tile = document.createElement("div");
    tile.className = "img-tile";
    tile.innerHTML = `<img src="${t.src}" /><div class="img-tile-label">${escapeHtml(t.label)}</div>`;
    tile.addEventListener("click", () => openLightbox(urls, i));
    grid.appendChild(tile);
  });
  fadeMain();
}

// ---------------- NEW CHARACTER MODAL ----------------
function openNewCharacterModal() {
  openModal(`
    <h3>Nuevo personaje</h3>
    <label style="font-size:11px;color:var(--text-mute)">Nombre</label>
    <input id="nc-name" placeholder="Nombre del personaje" />
    <label style="font-size:11px;color:var(--text-mute);margin-top:10px;display:block">Especie</label>
    <input id="nc-species" placeholder="Homo sapiens, Kitsune..." />
    <div class="modal-actions">
      <button class="btn-cancel" data-close>Cancelar</button>
      <button class="btn-confirm" id="nc-create">Crear</button>
    </div>
  `);
  $("#nc-name").focus();
  $("#nc-create").addEventListener("click", async () => {
    const name = $("#nc-name").value.trim();
    if (!name) return;
    const species = $("#nc-species").value.trim();
    setSaving("saving");
    const { data, error } = await sb.from("characters").insert({
      user_id: session.user.id, name, species,
      fields: [
        { id: uid(), label: "Género", value: "" },
        { id: uid(), label: "Altura / Peso", value: "" },
      ],
    }).select().single();
    closeModal();
    if (error) { setSaving("error"); return; }
    setSaving("saved");
    await loadAllQuiet();
    activeCharId = data.id;
    renderAll();
  });
}

// ---------------- HISTORIAS: nueva / detalle ----------------
function openNewStoryModal() {
  openModal(`
    <h3>Nueva historia</h3>
    <input id="ns-title" placeholder="Título de la historia" />
    <div class="modal-actions">
      <button class="btn-cancel" data-close>Cancelar</button>
      <button class="btn-confirm" id="ns-create">Crear</button>
    </div>
  `);
  $("#ns-title").focus();
  $("#ns-create").addEventListener("click", async () => {
    const title = $("#ns-title").value.trim();
    if (!title) return;
    setSaving("saving");
    const { data, error } = await sb.from("stories").insert({ user_id: session.user.id, title }).select().single();
    closeModal();
    if (error) { setSaving("error"); return; }
    setSaving("saved");
    await loadAllQuiet();
    activeStoryId = data.id;
    renderAll();
  });
}

function renderStoriesGridView() {
  const main = $("#main");
  main.innerHTML = `
    <div class="view-title">Historias</div>
    <div class="view-sub">${stories.length} ${stories.length === 1 ? "historia" : "historias"}</div>
    ${stories.length === 0
      ? `<div class="empty-state"><p>Todavía no has escrito ninguna historia.</p><button id="empty-new-story">+ Crear la primera</button></div>`
      : `<div id="story-grid"></div>`}
  `;
  if (stories.length === 0) { $("#empty-new-story").addEventListener("click", openNewStoryModal); fadeMain(); return; }
  const grid = $("#story-grid");
  stories.forEach((s) => {
    const linkedCount = charStories.filter((cs) => cs.story_id === s.id).length;
    const card = document.createElement("div");
    card.className = "story-card";
    card.innerHTML = `
      <div class="sname">${escapeHtml(s.title)}</div>
      <div class="ssnippet">${escapeHtml((s.content || "").slice(0, 140)) || "Sin contenido todavía."}</div>
      <div class="scount">${linkedCount} personaje${linkedCount === 1 ? "" : "s"} vinculado${linkedCount === 1 ? "" : "s"}</div>
    `;
    card.addEventListener("click", () => { activeStoryId = s.id; renderAll(); });
    grid.appendChild(card);
  });
  fadeMain();
}

function renderStoryDetail(s) {
  const main = $("#main");
  const linkedCharIds = new Set(charStories.filter((cs) => cs.story_id === s.id).map((cs) => cs.character_id));
  const charPickerOpen = expandedCharPickerIds.has(s.id);

  main.innerHTML = `
    <div class="detail-top">
      <button class="back-btn" id="back-story-btn">← Volver</button>
      <button class="delete-char-btn" id="del-story-btn">🗑 Eliminar historia</button>
    </div>
    <div class="detail-card" style="padding:18px">
      <div class="name-row">
        <input class="story-title-input" id="s-title" value="${escapeAttr(s.title)}" />
        <button class="manual-save-btn" id="save-story-title-btn" title="Guardar ahora">💾</button>
      </div>
      <button class="stats-toggle-btn" id="char-picker-toggle-btn">${charPickerOpen ? "▾" : "▸"} Personajes vinculados <span class="hint-inline">(${linkedCharIds.size} seleccionado${linkedCharIds.size === 1 ? "" : "s"})</span></button>
      <div class="story-link-picker collapsible-panel ${charPickerOpen ? "open" : ""}" id="story-link-picker">
        ${characters.length === 0 ? `<div class="gp-empty">Aún no tienes personajes.</div>` :
          characters.map((c) => `
            <label class="gp-item">
              <input type="checkbox" data-cid="${c.id}" ${linkedCharIds.has(c.id) ? "checked" : ""} />
              ${escapeHtml(c.name)}
            </label>
          `).join("")}
      </div>
      ${richTextBlockHtml("content", "Historia", s.content, "Escribe la historia de tu personaje aquí...")}
    </div>
  `;

  $("#back-story-btn").addEventListener("click", () => { activeStoryId = null; renderAll(); });
  $("#del-story-btn").addEventListener("click", () => {
    openConfirmModal({
      title: "¿Eliminar historia?",
      text: `Se eliminará "${s.title}" para siempre.`,
      confirmLabel: "Eliminar",
      danger: true,
      onConfirm: async () => { await sb.from("stories").delete().eq("id", s.id); activeStoryId = null; await loadAllQuiet(); },
    });
  });

  $("#s-title").addEventListener("input", debounce(() => patchStory(s.id, { title: $("#s-title").value }), s.id + "title"));
  $("#save-story-title-btn").addEventListener("click", () => flashSave(patchStory(s.id, { title: $("#s-title").value }), "#save-story-title-btn"));

  $("#char-picker-toggle-btn").addEventListener("click", () => {
    if (expandedCharPickerIds.has(s.id)) expandedCharPickerIds.delete(s.id); else expandedCharPickerIds.add(s.id);
    renderStoryDetail(s);
  });

  $all("#story-link-picker input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const cid = cb.dataset.cid;
      setSaving("saving");
      if (cb.checked) await sb.from("character_stories").insert({ user_id: session.user.id, character_id: cid, story_id: s.id });
      else await sb.from("character_stories").delete().eq("character_id", cid).eq("story_id", s.id);
      setSaving("saved");
      await loadAllQuiet();
    });
  });

  wireRichTextBlock(s, "content", (patch) => patchStory(s.id, patch));
  fadeMain();
}

async function patchStory(id, patch) {
  setSaving("saving");
  const { error } = await sb.from("stories").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  setSaving(error ? "error" : "saved");
  const s = stories.find((x) => x.id === id);
  if (s) Object.assign(s, patch);
}

// ---------------- DETAIL VIEW (personaje propio, editable) ----------------
function renderDetail(c) {
  const main = $("#main");
  const memberGroupIds = new Set(charGroups.filter((cg) => cg.character_id === c.id).map((cg) => cg.group_id));
  const memberStoryIds = new Set(charStories.filter((cs) => cs.character_id === c.id).map((cs) => cs.story_id));
  const statsOpen = expandedStatsIds.has(c.id);
  const groupsPickerOpen = expandedGroupsPickerIds.has(c.id);
  const storiesPickerOpen = expandedStoriesPickerIds.has(c.id);

  main.innerHTML = `
    <div class="detail-top">
      <button class="back-btn" id="back-btn">← Volver</button>
      <button class="delete-char-btn" id="del-char-btn">🗑 Eliminar personaje</button>
    </div>

    <div class="banner-box" id="banner-box">
      ${c.banner_url ? `<img src="${c.banner_url}" id="banner-img" /><button class="img-replace-btn" id="banner-replace-btn" title="Cambiar banner">📷</button>` : `<div class="banner-placeholder" id="banner-empty">🖼 Subir banner de fondo</div>`}
    </div>

    <div class="detail-card">
      <div class="detail-grid">
        <div class="detail-left">
          <div class="name-row">
            <div style="flex:1">
              <input class="name-input" id="d-name" value="${escapeAttr(c.name)}" />
              <input class="species-input" id="d-species" value="${escapeAttr(c.species)}" placeholder="Especie" />
            </div>
            <button class="manual-save-btn" id="save-name-btn" title="Guardar ahora">💾</button>
          </div>

          <div class="section-label">Grupos</div>
          <button class="stats-toggle-btn" id="groups-toggle-btn">${groupsPickerOpen ? "▾" : "▸"} Grupos <span class="hint-inline">(${memberGroupIds.size} seleccionado${memberGroupIds.size === 1 ? "" : "s"})</span></button>
          <div class="group-picker collapsible-panel ${groupsPickerOpen ? "open" : ""}" id="group-picker">
            ${groups.length === 0 ? `<div class="gp-empty">Aún no tienes grupos. Créalos desde la pestaña Personajes.</div>` :
              groups.map((g) => `
                <label class="gp-item">
                  <input type="checkbox" data-gid="${g.id}" ${memberGroupIds.has(g.id) ? "checked" : ""} />
                  ${escapeHtml(g.name)}
                </label>
              `).join("")}
          </div>

          <button class="stats-toggle-btn" id="stories-toggle-btn">${storiesPickerOpen ? "▾" : "▸"} Historias <span class="hint-inline">(${memberStoryIds.size} seleccionada${memberStoryIds.size === 1 ? "" : "s"})</span></button>
          <div class="group-picker collapsible-panel ${storiesPickerOpen ? "open" : ""}" id="story-picker">
            ${stories.length === 0 ? `<div class="gp-empty">Aún no tienes historias. Créalas desde la pestaña Historias.</div>` :
              stories.map((s) => `
                <label class="gp-item">
                  <input type="checkbox" data-sid="${s.id}" ${memberStoryIds.has(s.id) ? "checked" : ""} />
                  ${escapeHtml(s.title)}
                </label>
              `).join("")}
          </div>

          <div class="field-box" id="field-box"></div>

          <button class="stats-toggle-btn" id="stats-toggle-btn">${statsOpen ? "▾" : "▸"} OC Expansión <span class="hint-inline">(fuerza, inteligencia, y más atributos)</span></button>
          <div class="field-box stats-box collapsible-panel ${statsOpen ? "open" : ""}" id="stats-box"></div>

          <div class="section-head-row">
            <div class="section-label" style="margin:0">Paleta de colores</div>
          </div>
          <div class="colors-box" id="colors-box"></div>

          ${richTextBlockHtml("notes", "Notas importantes", c.notes, "Habilidades, historia, cambios de diseño...")}
          ${richTextBlockHtml("about", "Sobre este personaje", c.about, "Personalidad, trasfondo...")}
          <div class="two-col">
            ${richTextBlockHtml("likes", "♥ Le gusta", c.likes, "Un gusto por línea")}
            ${richTextBlockHtml("dislikes", "✕ Le disgusta", c.dislikes, "Un disgusto por línea")}
          </div>
        </div>

        <div class="detail-right">
          <div class="avatar-box" id="avatar-box">
            ${c.avatar_url ? `<img src="${c.avatar_url}" id="avatar-img" /><button class="img-replace-btn" id="avatar-replace-btn" title="Cambiar foto">📷</button>` : `<div class="placeholder" id="avatar-empty">📷<br/>Subir foto de perfil</div>`}
          </div>
          <div class="detail-right-pad">
            <div class="avatar-hint">Toca la imagen para hacer zoom · usa el ícono 📷 para cambiarla</div>

            <div class="gallery-head">
              <div class="section-label" style="margin:0">Galería</div>
              <button id="gallery-add-btn" style="color:var(--accent)">⬆ Subir</button>
            </div>
            <div id="gallery-grid"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  $("#back-btn").addEventListener("click", () => { activeCharId = null; renderAll(); });
  $("#del-char-btn").addEventListener("click", () => {
    openConfirmModal({
      title: "¿Eliminar personaje?",
      text: `Se eliminará "${c.name}" y sus datos. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      danger: true,
      onConfirm: async () => {
        await sb.from("characters").delete().eq("id", c.id);
        activeCharId = null;
        await loadAllQuiet();
      },
    });
  });

  $("#d-name").addEventListener("input", debounce(() => patchCharacter(c.id, { name: $("#d-name").value }), c.id + "name"));
  $("#d-species").addEventListener("input", debounce(() => patchCharacter(c.id, { species: $("#d-species").value }), c.id + "species"));

  wireRichTextBlock(c, "notes", (patch) => patchCharacter(c.id, patch));
  wireRichTextBlock(c, "about", (patch) => patchCharacter(c.id, patch));
  wireRichTextBlock(c, "likes", (patch) => patchCharacter(c.id, patch));
  wireRichTextBlock(c, "dislikes", (patch) => patchCharacter(c.id, patch));

  $("#save-name-btn").addEventListener("click", () => flashSave(patchCharacter(c.id, { name: $("#d-name").value, species: $("#d-species").value }), "#save-name-btn"));

  $("#groups-toggle-btn").addEventListener("click", () => {
    if (expandedGroupsPickerIds.has(c.id)) expandedGroupsPickerIds.delete(c.id); else expandedGroupsPickerIds.add(c.id);
    renderDetail(c);
  });
  $("#stories-toggle-btn").addEventListener("click", () => {
    if (expandedStoriesPickerIds.has(c.id)) expandedStoriesPickerIds.delete(c.id); else expandedStoriesPickerIds.add(c.id);
    renderDetail(c);
  });

  $all("#group-picker input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const gid = cb.dataset.gid;
      if (cb.checked) await addCharacterToGroup(c.id, gid);
      else await removeCharacterFromGroup(c.id, gid);
    });
  });

  $all("#story-picker input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const sid = cb.dataset.sid;
      setSaving("saving");
      if (cb.checked) await sb.from("character_stories").insert({ user_id: session.user.id, character_id: c.id, story_id: sid });
      else await sb.from("character_stories").delete().eq("character_id", c.id).eq("story_id", sid);
      setSaving("saved");
      await loadAllQuiet();
    });
  });

  renderFieldBox(c);
  renderColorsBox(c);

  $("#stats-toggle-btn").addEventListener("click", async () => {
    if (expandedStatsIds.has(c.id)) {
      expandedStatsIds.delete(c.id);
    } else {
      expandedStatsIds.add(c.id);
      if (!c.stats || c.stats.length === 0) {
        const stats = DEFAULT_STATS.map((label) => ({ id: uid(), label, value: "" }));
        c.stats = stats;
        await patchCharacter(c.id, { stats });
      }
    }
    renderDetail(c);
  });
  if (statsOpen) renderStatsBox(c);

  if (c.avatar_url) {
    $("#avatar-img").addEventListener("click", () => openLightbox([c.avatar_url], 0));
    $("#avatar-replace-btn").addEventListener("click", (e) => { e.stopPropagation(); window._avatarTargetId = c.id; $("#avatar-input").click(); });
  } else {
    $("#avatar-empty").addEventListener("click", () => { window._avatarTargetId = c.id; $("#avatar-input").click(); });
  }
  if (c.banner_url) {
    $("#banner-img").addEventListener("click", () => openLightbox([c.banner_url], 0));
    $("#banner-replace-btn").addEventListener("click", (e) => { e.stopPropagation(); window._bannerTargetId = c.id; $("#banner-input").click(); });
  } else {
    $("#banner-empty").addEventListener("click", () => { window._bannerTargetId = c.id; $("#banner-input").click(); });
  }
  $("#gallery-add-btn").addEventListener("click", () => { window._galleryTargetId = c.id; $("#gallery-input").click(); });

  renderGallery(c);
  fadeMain();
}

function flashSave(promise, selector) {
  const btn = $(selector);
  if (btn) { btn.textContent = "…"; }
  Promise.resolve(promise).then(() => {
    if (!btn) return;
    btn.textContent = "✓";
    setTimeout(() => { if (document.body.contains(btn)) btn.textContent = "💾"; }, 1200);
  });
}

function renderFieldBox(c) {
  const box = $("#field-box");
  box.innerHTML = "";
  (c.fields || []).forEach((f) => {
    const row = document.createElement("div");
    row.className = "field-row";
    row.innerHTML = `
      <input class="flabel" value="${escapeAttr(f.label)}" />
      <input class="fvalue" value="${escapeAttr(f.value)}" />
      <button class="rm-field">✕</button>
    `;
    const [labelInput, valueInput] = row.querySelectorAll("input");
    labelInput.addEventListener("input", debounce(() => updateField(c, f.id, { label: labelInput.value }), c.id + f.id + "l"));
    valueInput.addEventListener("input", debounce(() => updateField(c, f.id, { value: valueInput.value }), c.id + f.id + "v"));
    row.querySelector(".rm-field").addEventListener("click", async () => {
      const fields = c.fields.filter((x) => x.id !== f.id);
      await patchCharacter(c.id, { fields });
      c.fields = fields;
      renderFieldBox(c);
    });
    box.appendChild(row);
  });
  const addBtn = document.createElement("button");
  addBtn.className = "add-field-btn";
  addBtn.textContent = "+ Añadir dato";
  addBtn.addEventListener("click", async () => {
    const fields = [...(c.fields || []), { id: uid(), label: "Nuevo dato", value: "" }];
    await patchCharacter(c.id, { fields });
    c.fields = fields;
    renderFieldBox(c);
  });
  box.appendChild(addBtn);
}

async function updateField(c, fieldId, patch) {
  const fields = c.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f));
  c.fields = fields;
  await patchCharacter(c.id, { fields });
}

// ---------------- OC EXPANSIÓN (atributos tipo ficha de rol, en bloques de color) ----------------
function renderStatsBox(c) {
  const box = $("#stats-box");
  if (!box) return;
  box.innerHTML = `<div class="stats-grid" id="stats-grid"></div>`;
  const grid = $("#stats-grid", box);
  (c.stats || []).forEach((f, i) => {
    const color = STAT_COLORS[i % STAT_COLORS.length];
    const card = document.createElement("div");
    card.className = "stat-card";
    card.style.borderColor = color + "66";
    card.style.background = color + "17";
    card.innerHTML = `
      <button class="stat-rm">✕</button>
      <input class="stat-label" style="color:${color}" value="${escapeAttr(f.label)}" />
      <input class="stat-value" value="${escapeAttr(f.value)}" placeholder="—" />
    `;
    const labelInput = card.querySelector(".stat-label");
    const valueInput = card.querySelector(".stat-value");
    labelInput.addEventListener("input", debounce(() => updateStat(c, f.id, { label: labelInput.value }), c.id + f.id + "sl"));
    valueInput.addEventListener("input", debounce(() => updateStat(c, f.id, { value: valueInput.value }), c.id + f.id + "sv"));
    card.querySelector(".stat-rm").addEventListener("click", async () => {
      const stats = c.stats.filter((x) => x.id !== f.id);
      await patchCharacter(c.id, { stats });
      c.stats = stats;
      renderStatsBox(c);
    });
    grid.appendChild(card);
  });
  const addBtn = document.createElement("button");
  addBtn.className = "add-field-btn";
  addBtn.textContent = "+ Añadir atributo";
  addBtn.addEventListener("click", async () => {
    const stats = [...(c.stats || []), { id: uid(), label: "Nuevo atributo", value: "" }];
    await patchCharacter(c.id, { stats });
    c.stats = stats;
    renderStatsBox(c);
  });
  box.appendChild(addBtn);
}

async function updateStat(c, statId, patch) {
  const stats = c.stats.map((f) => (f.id === statId ? { ...f, ...patch } : f));
  c.stats = stats;
  await patchCharacter(c.id, { stats });
}

// ---------------- PALETA DE COLORES ----------------
function renderColorsBox(c) {
  const box = $("#colors-box");
  if (!box) return;
  box.innerHTML = "";
  (c.colors || []).forEach((col) => {
    const row = document.createElement("div");
    row.className = "color-row";
    row.innerHTML = `
      <input type="color" class="swatch-input" value="${escapeAttr(col.hex || "#3ecf9e")}" />
      <input class="color-name" value="${escapeAttr(col.name)}" placeholder="Nombre del color" />
      <input class="color-hex" value="${escapeAttr(col.hex || "")}" placeholder="#hex" />
      <button class="rm-field">✕</button>
    `;
    const swatch = row.querySelector(".swatch-input");
    const nameInput = row.querySelector(".color-name");
    const hexInput = row.querySelector(".color-hex");
    swatch.addEventListener("input", () => { hexInput.value = swatch.value; debounce(() => updateColor(c, col.id, { hex: swatch.value }), c.id + col.id + "ch")(); });
    hexInput.addEventListener("input", debounce(() => { swatch.value = /^#[0-9a-fA-F]{6}$/.test(hexInput.value) ? hexInput.value : swatch.value; updateColor(c, col.id, { hex: hexInput.value }); }, c.id + col.id + "chx"));
    nameInput.addEventListener("input", debounce(() => updateColor(c, col.id, { name: nameInput.value }), c.id + col.id + "cn"));
    row.querySelector(".rm-field").addEventListener("click", async () => {
      const colors = c.colors.filter((x) => x.id !== col.id);
      await patchCharacter(c.id, { colors });
      c.colors = colors;
      renderColorsBox(c);
    });
    box.appendChild(row);
  });
  const addBtn = document.createElement("button");
  addBtn.className = "add-field-btn";
  addBtn.textContent = "+ Añadir color";
  addBtn.addEventListener("click", async () => {
    const colors = [...(c.colors || []), { id: uid(), name: "", hex: "#3ecf9e" }];
    await patchCharacter(c.id, { colors });
    c.colors = colors;
    renderColorsBox(c);
  });
  box.appendChild(addBtn);
}

async function updateColor(c, colorId, patch) {
  const colors = c.colors.map((x) => (x.id === colorId ? { ...x, ...patch } : x));
  c.colors = colors;
  await patchCharacter(c.id, { colors });
}

// ---------------- BLOQUES DE TEXTO CON VIÑETAS (notas, sobre, gustos, disgustos, historia) ----------------
const RICH_FIELD_LABELS = {
  notes: "Habilidades, historia, cambios de diseño...",
  about: "Personalidad, trasfondo...",
  likes: "Un gusto por línea",
  dislikes: "Un disgusto por línea",
  content: "Escribe la historia de tu personaje aquí...",
};

function linesToBulletHtml(text, placeholder) {
  const rawLines = String(text || "").split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (rawLines.length === 0) return `<div class="rt-placeholder">${escapeHtml(placeholder)}</div>`;
  let html = "";
  let ulOpen = false;
  rawLines.forEach((line) => {
    const isBullet = /^[-•*]\s*/.test(line);
    if (isBullet) {
      if (!ulOpen) { html += `<ul class="rt-list">`; ulOpen = true; }
      html += `<li>${escapeHtml(line.replace(/^[-•*]\s*/, ""))}</li>`;
    } else {
      if (ulOpen) { html += `</ul>`; ulOpen = false; }
      html += `<p class="rt-line">${escapeHtml(line)}</p>`;
    }
  });
  if (ulOpen) html += `</ul>`;
  return html;
}

function richTextBlockHtml(key, label, value, placeholder) {
  return `
    <div class="section-block rt-block" id="rt-block-${key}">
      <div class="section-head-row">
        <div class="section-label" style="margin:0">${label}</div>
        <div style="display:flex;gap:6px">
          <button class="rt-edit-btn" id="rt-edit-${key}" title="Editar">✎</button>
          <button class="manual-save-btn" id="save-${key}-btn" title="Guardar ahora">💾</button>
        </div>
      </div>
      <div class="rt-view" id="rt-view-${key}">${linesToBulletHtml(value, placeholder)}</div>
      <textarea class="rt-textarea hidden" id="d-${key}" placeholder="${escapeAttr(placeholder)}">${escapeHtml(value)}</textarea>
    </div>
  `;
}

function autosize(textarea) {
  const scroller = document.getElementById("main");
  const prevMainScroll = scroller ? scroller.scrollTop : null;
  const prevWinScroll = window.scrollY;
  textarea.style.height = "auto";
  textarea.style.height = textarea.scrollHeight + 2 + "px";
  if (scroller && prevMainScroll !== null) scroller.scrollTop = prevMainScroll;
  window.scrollTo(window.scrollX, prevWinScroll);
}

function wireRichTextBlock(entity, key, patchFn) {
  const view = $(`#rt-view-${key}`);
  const textarea = $(`#d-${key}`);
  const editBtn = $(`#rt-edit-${key}`);
  const placeholder = RICH_FIELD_LABELS[key] || "";

  function enterEdit() {
    view.classList.add("hidden");
    textarea.classList.remove("hidden");
    autosize(textarea);
    textarea.focus();
    editBtn.textContent = "✓";
  }
  function exitEdit() {
    view.innerHTML = linesToBulletHtml(textarea.value, placeholder);
    textarea.classList.add("hidden");
    view.classList.remove("hidden");
    editBtn.textContent = "✎";
  }

  editBtn.addEventListener("mousedown", (e) => e.preventDefault());
  editBtn.addEventListener("click", () => {
    if (textarea.classList.contains("hidden")) enterEdit();
    else exitEdit();
  });
  view.addEventListener("click", enterEdit);
  textarea.addEventListener("input", () => {
    autosize(textarea);
    debounce(() => patchFn({ [key]: textarea.value }), entity.id + key)();
  });
  textarea.addEventListener("blur", exitEdit);
  $(`#save-${key}-btn`).addEventListener("click", () => flashSave(patchFn({ [key]: textarea.value }), `#save-${key}-btn`));
}

function renderGallery(c) {
  const grid = $("#gallery-grid");
  grid.innerHTML = "";
  const gallery = c.gallery || [];
  if (gallery.length === 0) {
    grid.innerHTML = `<div class="gallery-empty">Sin imágenes aún</div>`;
    return;
  }
  const urls = gallery.map((g) => g.src);
  gallery.forEach((img, i) => {
    const div = document.createElement("div");
    div.className = "gallery-thumb";
    div.innerHTML = `<img src="${img.src}" /><button data-gid="${img.id}">✕</button>`;
    div.querySelector("img").addEventListener("click", () => openLightbox(urls, i));
    div.querySelector("button").addEventListener("click", async (e) => {
      e.stopPropagation();
      const newGallery = c.gallery.filter((g) => g.id !== img.id);
      c.gallery = newGallery;
      await patchCharacter(c.id, { gallery: newGallery });
      renderGallery(c);
    });
    grid.appendChild(div);
  });
}

$("#avatar-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  const charId = window._avatarTargetId;
  e.target.value = "";
  if (!file || !charId) return;
  const box = $("#avatar-box");
  box.insertAdjacentHTML("beforeend", `<div class="spinner-overlay">⏳</div>`);
  const url = await uploadImage(file, `${session.user.id}/avatars/${charId}.jpg`, 700, 0.82);
  if (url) await patchCharacter(charId, { avatar_url: url });
  await loadAllQuiet();
});

$("#banner-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  const charId = window._bannerTargetId;
  e.target.value = "";
  if (!file || !charId) return;
  const box = $("#banner-box");
  if (box) box.insertAdjacentHTML("beforeend", `<div class="spinner-overlay">⏳</div>`);
  const url = await uploadImage(file, `${session.user.id}/banners/${charId}.jpg`, 1400, 0.8);
  if (url) await patchCharacter(charId, { banner_url: url });
  await loadAllQuiet();
});

$("#gallery-input").addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  const charId = window._galleryTargetId;
  e.target.value = "";
  if (!files.length || !charId) return;
  const c = characters.find((x) => x.id === charId);
  const uploaded = [];
  for (const f of files) {
    const url = await uploadImage(f, `${session.user.id}/gallery/${charId}/${uid()}.jpg`, 1000, 0.78);
    if (url) uploaded.push({ id: uid(), src: url });
  }
  const gallery = [...(c.gallery || []), ...uploaded];
  await patchCharacter(charId, { gallery });
  await loadAllQuiet();
});

async function patchCharacter(id, patch) {
  setSaving("saving");
  const { error } = await sb.from("characters").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  setSaving(error ? "error" : "saved");
  const c = characters.find((x) => x.id === id);
  if (c) Object.assign(c, patch);
}

// ---------------- IMAGE UPLOAD (resize + upload to storage) ----------------
function resizeImageFile(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read error"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode error"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
          else { width = Math.round((width * maxDim) / height); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadImage(file, path, maxDim, quality) {
  try {
    setSaving("saving");
    const blob = await resizeImageFile(file, maxDim, quality);
    const { error } = await sb.storage.from("character-images").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (error) { setSaving("error"); return null; }
    const { data } = sb.storage.from("character-images").getPublicUrl(path);
    setSaving("saved");
    return `${data.publicUrl}?t=${Date.now()}`;
  } catch (e) {
    setSaving("error");
    return null;
  }
}

// ---------------- MODAL HELPERS ----------------
function openModal(innerHtml, opts = {}) {
  const root = $("#modal-root");
  const boxClass = opts.boxClassExtra ? `modal-box ${opts.boxClassExtra}` : "modal-box";
  root.innerHTML = `<div class="modal-overlay" id="modal-overlay"><div class="${boxClass}">${innerHtml}</div></div>`;
  if (!opts.mandatory) {
    $("#modal-overlay").addEventListener("click", (e) => { if (e.target.id === "modal-overlay") closeModal(); });
  }
  $all("[data-close]", root).forEach((b) => b.addEventListener("click", closeModal));
}
function closeModal() { $("#modal-root").innerHTML = ""; }
function openConfirmModal({ title, text, confirmLabel, danger, onConfirm }) {
  openModal(`
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(text)}</p>
    <div class="modal-actions">
      <button class="btn-cancel" data-close>Cancelar</button>
      <button class="${danger ? "btn-danger" : "btn-confirm"}" id="confirm-btn">${escapeHtml(confirmLabel)}</button>
    </div>
  `);
  $("#confirm-btn").addEventListener("click", async () => { closeModal(); await onConfirm(); });
}

// ---------------- UTIL ----------------
function debounce(fn, key = "default", wait = 700) {
  return (...args) => {
    clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(() => fn(...args), wait);
  };
}
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function escapeAttr(str) { return escapeHtml(str); }
