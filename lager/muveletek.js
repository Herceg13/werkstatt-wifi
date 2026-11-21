const FB_BASE = ['https://bb-werkstatt', '-default-rtdb.europe-west1.', 'firebasedatabase.app/werkstatt_lager'].join('');
const ADMIN_PIN = "1234";

function normalizeItems(rawList) {
    return (rawList || []).map(x => {
        if (Array.isArray(x.locs)) { x.ist = x.locs.reduce((s, l) => s + (l.qty || 0), 0); return x; }
        return { id: x.id, name: x.name, geb: x.geb, min: x.min || 1, cat: x.cat, ist: x.ist || 0, locs: [{ loc: x.loc || 'H5ET-Lager', qty: x.ist || 0 }] };
    });
}

let items = normalizeItems(JSON.parse(localStorage.getItem('bb_lager_v13')) || FULL_LAGER);
let logs = [];
let isAdmin = sessionStorage.getItem('bb_admin') === '1';
let curCat = null, curStatus = 'all', scanMode = 'search', targetShelf = null;

const CATS = [
    { id: 'all', icon: '📦', title: 'Összes alkatrész', desc: 'Teljes H5ETL raktárkészlet áttekintése egyben.' },
    { id: 'szalag', icon: '🎞️', title: 'Szalagok & Szíjak', desc: 'Szállítószalagok, lapos- és fogasszíjak adatbázisa.' },
    { id: 'buro', icon: '🛢️', title: 'Zsírok, Spray & Büro', desc: 'Kenőanyagok, ragasztók, tisztítók és műhelyi fogyóanyagok.' },
    { id: 'alkatresz', icon: '⚙️', title: 'Alkatrészek & Motorok', desc: 'Hengerek, szelepek, szűrők, hajtóművek és gépelemek.' }
];

function updateAdminUI() {
    const btn = document.getElementById('adminToggleBtn');
    if (btn) {
        btn.innerText = isAdmin ? '👑 Admin (AKTÍV)' : '🔒 Dolgozó';
        btn.style.borderColor = isAdmin ? 'var(--green)' : 'var(--orange)';
        btn.style.color = isAdmin ? 'var(--green)' : 'var(--orange)';
    }
    document.querySelectorAll('.admin-only').forEach(el => { el.style.display = isAdmin ? 'block' : 'none'; });
}

function toggleAdmin() {
    if (isAdmin) { isAdmin = false; sessionStorage.removeItem('bb_admin'); cancelMode(); updateAdminUI(); render(); return; }
    const pin = prompt("🔑 Add meg a Rendszergazda PIN-kódot:");
    if (pin === ADMIN_PIN) { isAdmin = true; sessionStorage.setItem('bb_admin', '1'); updateAdminUI(); render(); }
    else if (pin !== null) alert("❌ Hibás PIN-kód!");
}

async function syncFromCloud() {
    try {
        const res = await fetch(FB_BASE + '.json');
        const data = await res.json();
        if (data && Array.isArray(data.items) && data.items.length > 0) {
            items = normalizeItems(data.items);
            logs = Array.isArray(data.logs) ? data.logs : [];
            localStorage.setItem('bb_lager_v13', JSON.stringify(items));
            render();
        } else { await pushToCloud("Rendszer inicializálva"); }
        document.getElementById('syncDot').innerText = '● ÉLŐ FELHŐ';
        document.getElementById('syncDot').style.color = 'var(--green)';
    } catch (e) {
        document.getElementById('syncDot').innerText = '● OFFLINE';
        document.getElementById('syncDot').style.color = 'var(--orange)';
    }
}

async function pushToCloud(actionText) {
    items.forEach(x => { x.ist = x.locs.reduce((s, l) => s + l.qty, 0); });
    localStorage.setItem('bb_lager_v13', JSON.stringify(items));
    if (actionText) {
        const now = new Date();
        const ts = `${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        logs.unshift(`${ts} [${isAdmin ? '👑 Admin' : '👷 Dolgozó'}] — ${actionText}`);
        if (logs.length > 25) logs = logs.slice(0, 25);
    }
    try {
        document.getElementById('syncDot').innerText = '⏳ MENTÉS...';
        await fetch(FB_BASE + '.json', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, logs }) });
        document.getElementById('syncDot').innerText = '● ÉLŐ FELHŐ';
    } catch (e) { document.getElementById('syncDot').innerText = '● HELYI MENTÉS'; }
}
function isMissing(x) { return x.ist === 0 || x.ist < x.min; }
function openCat(catId) { curCat = catId; curStatus = 'all'; updateStBtns('stAll'); render(); }
function backToCats() { curCat = null; document.getElementById('q').value = ''; render(); }
function resetView() { document.getElementById('q').value = ''; curCat = null; cancelMode(); render(); }
function updateStBtns(activeId) { document.querySelectorAll('.st-btn').forEach(b => b.classList.remove('active')); if (document.getElementById(activeId)) document.getElementById(activeId).classList.add('active'); }
function setStatus(st, btn) { curStatus = st; document.querySelectorAll('.st-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); render(); }

function chgLocQty(id, locIdx, d) {
    const it = items.find(x => x.id === id);
    if (!it || !it.locs[locIdx]) return;
    const oldQ = it.locs[locIdx].qty;
    it.locs[locIdx].qty = Math.max(0, oldQ + d);
    if (it.locs[locIdx].qty !== oldQ) pushToCloud(`${it.id} (${it.name}): ${d > 0 ? '+1' : '-1'} db [H5ETL/${it.locs[locIdx].loc}]`);
    render();
}
function removeEmptyLoc(id, locIdx) {
    if (!isAdmin) return;
    const it = items.find(x => x.id === id);
    if (!it || it.locs.length <= 1) return;
    const remLoc = it.locs[locIdx].loc;
    it.locs.splice(locIdx, 1);
    pushToCloud(`${it.id} üres polchely törölve: H5ETL/${remLoc}`); render();
}
function chgMin(id, d) {
    if (!isAdmin) return;
    const it = items.find(x => x.id === id);
    if (it) { it.min = Math.max(0, (it.min || 0) + d); pushToCloud(`${it.id} minimum módosítva: ${it.min} db`); render(); }
}
function deleteItem(id) {
    if (!isAdmin) return;
    const it = items.find(x => x.id === id);
    if (it && confirm(`🗑️ Kifutott tétel végleges törlése?\n\n[${it.id}] ${it.name}`)) {
        items = items.filter(x => x.id !== id);
        pushToCloud(`Kifutott tétel törölve: [${it.id}] ${it.name}`); render();
    }
}

function startRelocateMode() {
    if (!isAdmin) return;
    scanMode = 'relocate'; targetShelf = null;
    const b = document.getElementById('modeBanner');
    b.style.display = 'block';
    b.innerHTML = `<strong>📦 BETÁROLÁS / ÁTHELYEZÉS MÓD:</strong><br>1. lépés: Lőj rá a <b>CÉLPOLC</b> vonalkódjára! <button onclick="cancelMode()" style="margin-left:8px;padding:2px 8px;border-radius:4px;border:1px solid #fff;background:transparent;color:#fff;cursor:pointer;">Mégse</button>`;
    toggleScanner();
}
function cancelMode() { scanMode = 'search'; targetShelf = null; document.getElementById('modeBanner').style.display = 'none'; }

function handleScannedCode(raw) {
    const clean = raw.replace(/^H5ETL\//i, '').trim(), isItemCode = /^A\d{4}$/i.test(clean);
    if (scanMode === 'new_loc') { document.getElementById('n_loc').value = clean.toUpperCase(); scanMode = 'search'; return; }
    if (scanMode === 'relocate' && isAdmin) {
        const b = document.getElementById('modeBanner');
        if (!targetShelf) {
            targetShelf = clean.toUpperCase();
            b.innerHTML = `<strong>📍 Célpolc rögzítve: H5ETL/${targetShelf}</strong><br>2. lépés: Lőj rá az <b>ALKATRÉSZ</b> kódjára! <button onclick="cancelMode()" style="margin-left:8px;padding:2px 8px;border-radius:4px;border:1px solid #fff;background:transparent;color:#fff;cursor:pointer;">Mégse</button>`;
            setTimeout(() => toggleScanner(), 350); return;
        } else if (isItemCode) {
            const it = items.find(x => x.id.toUpperCase() === clean.toUpperCase());
            if (it) assignHere(it.id); else { alert(`❌ Nem található: ${clean}`); cancelMode(); }
            return;
        }
    }
    document.getElementById('q').value = clean; render();
}

function assignHere(id) {
    if (!isAdmin) return;
    const it = items.find(x => x.id === id);
    if (!it || !targetShelf) return;
    const dest = targetShelf, existingTarget = it.locs.find(l => l.loc.toUpperCase() === dest.toUpperCase());
    const sourceLoc = it.locs.find(l => l.loc.toUpperCase() !== dest.toUpperCase() && l.qty > 0);
    if (sourceLoc) {
        const ans = prompt(`📦 [${it.id}] ${it.name}\nHonnan: H5ETL/${sourceLoc.loc} (${sourceLoc.qty} db) -> Hová: H5ETL/${dest}\n\nMennyit teszel át? (0 = csak új készlet)`, "1");
        if (ans === null) { cancelMode(); render(); return; }
        const moveQty = Math.max(0, parseInt(ans, 10) || 0);
        if (moveQty > 0) {
            const actualMove = Math.min(moveQty, sourceLoc.qty);
            sourceLoc.qty -= actualMove;
            if (existingTarget) existingTarget.qty += actualMove; else it.locs.push({ loc: dest, qty: actualMove });
            pushToCloud(`${it.id} áthelyezve (${actualMove} db): ${sourceLoc.loc} -> ${dest}`);
        } else {
            const addNew = parseInt(prompt(`Mennyi új darabot teszel be ide: H5ETL/${dest}?`, "1"), 10) || 0;
            if (existingTarget) existingTarget.qty += addNew; else it.locs.push({ loc: dest, qty: addNew });
            pushToCloud(`${it.id} új betárolás (+${addNew} db) -> H5ETL/${dest}`);
        }
    } else {
        const addQty = parseInt(prompt(`📥 [${it.id}] ${it.name}\nHely: H5ETL/${dest}\n\nMennyi darabot teszel erre a polcra?`, "1"), 10);
        if (isNaN(addQty)) { cancelMode(); render(); return; }
        if (existingTarget) existingTarget.qty += Math.max(0, addQty); else it.locs.push({ loc: dest, qty: Math.max(0, addQty) });
        pushToCloud(`${it.id} betárolva (+${addQty} db) -> H5ETL/${dest}`);
    }
    cancelMode(); document.getElementById('q').value = dest; render();
}

function getNextId() {
    const usedNums = new Set();
    items.forEach(x => { const n = parseInt(String(x.id).replace(/\D/g, ''), 10); if (!isNaN(n) && n > 0) usedNums.add(n); });
    let c = 1; while (usedNums.has(c)) c++;
    return 'A' + String(c).padStart(4, '0');
}
function openNewModal(prefillLoc) {
    if (!isAdmin) return;
    document.getElementById('n_id').value = getNextId(); document.getElementById('n_name').value = '';
    document.getElementById('n_geb').value = 'BOX'; document.getElementById('n_loc').value = prefillLoc || '';
    document.getElementById('n_ist').value = 1; document.getElementById('n_min').value = 1;
    document.getElementById('newModal').style.display = 'block';
}
function closeNewModal() { document.getElementById('newModal').style.display = 'none'; }
function scanForNewLoc() { scanMode = 'new_loc'; toggleScanner(); }
function saveNewItem() {
    if (!isAdmin) return;
    const id = document.getElementById('n_id').value.trim().toUpperCase(), name = document.getElementById('n_name').value.trim();
    const geb = document.getElementById('n_geb').value.trim() || 'BOX', cat = document.getElementById('n_cat').value;
    const loc = document.getElementById('n_loc').value.trim().toUpperCase().replace(/^H5ETL\//, '') || 'H5ET-Lager';
    const ist = parseInt(document.getElementById('n_ist').value, 10) || 0, min = parseInt(document.getElementById('n_min').value, 10) || 1;
    if (!name) { alert('⚠️ Add meg a megnevezést!'); return; }
    items.push({ id, name, geb, ist, min, cat, locs: [{ loc, qty: ist }] });
    pushToCloud(`Új anyag felvéve: [${id}] ${name} (${ist} db) -> H5ETL/${loc}`);
    closeNewModal(); document.getElementById('q').value = id; render();
}
function copyMissingList() {
    const q = document.getElementById('q').value.toLowerCase().trim().replace(/^h5etl\//, '');
    const activeCatObj = CATS.find(c => c.id === curCat) || CATS;
    const missing = items.filter(x => {
        if (!isMissing(x)) return false;
        if (curCat && curCat !== 'all' && x.cat !== curCat) return false;
        return `${x.id} ${x.name} ${x.locs.map(l=>l.loc).join(' ')} ${x.geb}`.toLowerCase().includes(q);
    });
    if (!missing.length) { alert(`✅ Nincs hiányzó tétel itt: ${activeCatObj.title}!`); return; }
    const header = `BB MÜNCHINGER // BESTELLUNG – ${activeCatObj.title.toUpperCase()}\nLieferant: ??? | Rendelendő tételek: ${missing.length} db\n----------------------------------------\n`;
    const body = missing.map(x => `• [${x.id}] ${x.name} (${x.geb}) | Össz: ${x.ist}/${x.min} db (Rendelendő: min. ${Math.max(1, x.min - x.ist)} db) — ${x.locs.map(l=>`H5ETL/${l.loc} (${l.qty} db)`).join(', ')}`).join('\n');
    navigator.clipboard.writeText(header + body).then(() => alert(`📋 ${missing.length} hiányzó tétel vágólapra másolva!`));
}

function render() {
    updateAdminUI();
    const logEl = document.getElementById('logList');
    if (logEl) logEl.innerHTML = logs.length ? logs.slice(0, 8).map(l => `<div>• ${l}</div>`).join('') : 'Még nincs rögzített mozgás.';

    const rawQ = document.getElementById('q').value.trim(), q = rawQ.toLowerCase().replace(/^h5etl\//, '');
    const catMenu = document.getElementById('catMenu'), itemSection = document.getElementById('itemSection');
    if (!curCat && !q) {
        catMenu.style.display = 'grid'; itemSection.style.display = 'none';
        catMenu.innerHTML = CATS.map(c => {
            const sub = c.id === 'all' ? items : items.filter(x => x.cat === c.id);
            const missCount = sub.filter(x => isMissing(x)).length;
            return `<div class="cat-card" onclick="openCat('${c.id}')"><div><div class="cat-card-top"><span style="font-size:1.6rem;">${c.icon}</span><span style="font-size:0.75rem; font-weight:800; color:var(--cyan);">${sub.length} TÉTEL</span></div><h3>${c.title}</h3><p>${c.desc}</p></div><div class="cat-stats"><span style="color:var(--green);">✅ ${sub.length - missCount} OK</span><span style="color:var(--red);">⚠️ ${missCount} HIÁNY</span></div></div>`;
        }).join('');
        return;
    }
    catMenu.style.display = 'none'; itemSection.style.display = 'block';
    const activeCatObj = CATS.find(c => c.id === curCat) || CATS;
    const cleanShelf = rawQ.toUpperCase().replace(/^H5ETL\//, '');
    document.getElementById('curCatTitle').innerText = q ? `Találatok: "${cleanShelf}"` : activeCatObj.title;

    const baseList = items.filter(x => {
        if (curCat && curCat !== 'all' && x.cat !== curCat) return false;
        return `${x.id} ${x.name} ${x.locs.map(l=>`${l.loc} H5ETL/${l.loc}`).join(' ')} ${x.geb}`.toLowerCase().includes(q);
    });
    const missC = baseList.filter(x => isMissing(x)).length;
    document.getElementById('stAll').innerText = `Összes (${baseList.length})`;
    document.getElementById('stOk').innerText = `✅ Elérhető (${baseList.length - missC})`;
    document.getElementById('stMiss').innerText = `⚠️ Hiány (${missC})`;

    const filtered = baseList.filter(x => curStatus === 'ok' ? !isMissing(x) : (curStatus === 'miss' ? isMissing(x) : true));
    const listEl = document.getElementById('list'), isItemId = /^A\d{4}$/i.test(cleanShelf);
    const addHereBanner = (isAdmin && q && !isItemId)
        ? `<div style="grid-column:1/-1; background:rgba(0,230,118,0.08); border:1px dashed var(--green); border-radius:10px; padding:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;"><span>📍 Polchely: <b>H5ETL/${cleanShelf}</b> (${baseList.length} tétel)</span><button class="act-btn green" onclick="openNewModal('${cleanShelf}')">➕ Új alkatrész ide</button></div>` : '';

    if (!filtered.length && q) {
        listEl.innerHTML = addHereBanner + `<div class="card" style="grid-column:1/-1; text-align:center; padding:1.5rem; color:var(--muted);">Nincs találat erre: "${cleanShelf}".</div>`;
        return;
    }

    listEl.innerHTML = addHereBanner + filtered.map(x => {
        const isLow = isMissing(x), needQty = Math.max(1, x.min - x.ist);
        const statusBadge = isLow ? `<span class="miss-badge">HIÁNYZIK: ${needQty} db</span>` : `<span class="ok-badge">RENDBEN</span>`;
        const stockColor = x.ist === 0 ? 'var(--red)' : (isLow ? 'var(--orange)' : 'var(--green)');
        const locRows = x.locs.map((l, idx) => {
            const delBtn = (isAdmin && x.locs.length > 1 && l.qty === 0) ? `<button onclick="removeEmptyLoc('${x.id}',${idx})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:0.85rem;margin-left:4px;">🗑️</button>` : '';
            return `<div class="stock-row" style="background:rgba(0,0,0,0.28);padding:5px 8px;border-radius:6px;"><div><span class="loc-badge">📍 H5ETL/${l.loc}</span> <b style="color:#fff;margin-left:4px;">${l.qty} db</b>${delBtn}</div><div class="qty-btns"><button class="q-btn" onclick="chgLocQty('${x.id}',${idx},-1)">-</button><button class="q-btn" onclick="chgLocQty('${x.id}',${idx},1)">+</button></div></div>`;
        }).join('');

        const minCtrl = isAdmin
            ? `<div class="qty-btns"><button class="q-btn min-b" onclick="chgMin('${x.id}', -1)">-</button><button class="q-btn min-b" onclick="chgMin('${x.id}', 1)">+</button></div>`
            : `<span style="font-size:0.75rem;color:var(--muted);">🔒 Admin</span>`;
        const delItemRow = isAdmin ? `<div style="text-align:right;margin-top:4px;"><button onclick="deleteItem('${x.id}')" style="background:none;border:none;color:var(--muted);font-size:0.75rem;cursor:pointer;">🗑️ Kifutott (törlés)</button></div>` : '';
        const moveBtn = (isAdmin && scanMode === 'relocate' && targetShelf) ? `<button class="act-btn orange" style="width:100%;margin-top:6px;" onclick="assignHere('${x.id}')">📥 Betárolás / Áthelyezés ide: ${targetShelf}</button>` : '';

        return `<div class="card ${isLow ? 'missing' : ''}"><div><div class="card-top"><div style="display:flex;gap:6px;align-items:center;"><span class="id-badge">${x.id}</span>${statusBadge}</div><span style="font-size:0.85rem;font-weight:800;color:var(--muted);">Készleten: <b style="color:${stockColor};font-size:1.1rem;">${x.ist} db</b></span></div><div class="art-title">${x.name}</div><div class="art-meta">Kiszerelés: <b>${x.geb}</b></div></div><div class="stock-box">${locRows}<div class="stock-row"><div>Minimum: <span class="min-val">${x.min}</span> db</div>${minCtrl}</div>${delItemRow}${moveBtn}</div></div>`;
    }).join('');
}

render();
syncFromCloud();
setInterval(syncFromCloud, 15000);
