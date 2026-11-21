function normalizeItems(rawList) {
    return rawList.map(x => {
        if (Array.isArray(x.locs)) {
            x.ist = x.locs.reduce((s, l) => s + (l.qty || 0), 0);
            return x;
        }
        return {
            id: x.id, name: x.name, geb: x.geb, min: x.min || 1, cat: x.cat,
            ist: x.ist || 0,
            locs: [{ loc: x.loc || 'H5ET-Lager', qty: x.ist || 0 }]
        };
    });
}

let savedRaw = JSON.parse(localStorage.getItem('bb_lager_v13')) || JSON.parse(localStorage.getItem('bb_lager_v12')) || FULL_LAGER;
let items = normalizeItems(savedRaw);
let curCat = null;
let curStatus = 'all';
let scanMode = 'search';
let targetShelf = null;

const CATS = [
    { id: 'all', icon: '📦', title: 'Összes alkatrész', desc: 'Teljes H5ETL raktárkészlet áttekintése egyben.' },
    { id: 'szalag', icon: '🎞️', title: 'Szalagok & Szíjak', desc: 'Szállítószalagok, lapos- és fogasszíjak adatbázisa.' },
    { id: 'buro', icon: '🛢️', title: 'Zsírok, Spray & Büro', desc: 'Kenőanyagok, ragasztók, tisztítók és műhelyi fogyóanyagok.' },
    { id: 'alkatresz', icon: '⚙️', title: 'Alkatrészek & Motorok', desc: 'Hengerek, szelepek, szűrők, hajtóművek és gépelemek.' }
];

function isMissing(x) { return x.ist === 0 || x.ist < x.min; }
function save() {
    items.forEach(x => { x.ist = x.locs.reduce((s, l) => s + l.qty, 0); });
    localStorage.setItem('bb_lager_v13', JSON.stringify(items));
}
function openCat(catId) { curCat = catId; curStatus = 'all'; updateStBtns('stAll'); render(); }
function backToCats() { curCat = null; document.getElementById('q').value = ''; render(); }
function resetView() { document.getElementById('q').value = ''; curCat = null; cancelMode(); render(); }

function updateStBtns(activeId) {
    document.querySelectorAll('.st-btn').forEach(b => b.classList.remove('active'));
    if (document.getElementById(activeId)) document.getElementById(activeId).classList.add('active');
}
function setStatus(st, btn) {
    curStatus = st;
    document.querySelectorAll('.st-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); render();
}

function chgLocQty(id, locIdx, d) {
    const it = items.find(x => x.id === id);
    if (!it || !it.locs[locIdx]) return;
    it.locs[locIdx].qty = Math.max(0, it.locs[locIdx].qty + d);
    save(); render();
}
function removeEmptyLoc(id, locIdx) {
    const it = items.find(x => x.id === id);
    if (!it || it.locs.length <= 1) return;
    it.locs.splice(locIdx, 1);
    save(); render();
}
function chgMin(id, d) {
    const it = items.find(x => x.id === id);
    if (it) { it.min = Math.max(0, (it.min || 0) + d); save(); render(); }
}

function startRelocateMode() {
    scanMode = 'relocate'; targetShelf = null;
    const b = document.getElementById('modeBanner');
    b.style.display = 'block';
    b.innerHTML = `<strong>📦 BETÁROLÁS / ÁTHELYEZÉS MÓD:</strong><br>1. lépés: Lőj rá a <b>CÉLPOLC</b> vonalkódjára (pl. H5ETL/03-D2)! <button onclick="cancelMode()" style="margin-left:8px;padding:2px 8px;border-radius:4px;border:1px solid #fff;background:transparent;color:#fff;cursor:pointer;">Mégse</button>`;
    toggleScanner();
}
function cancelMode() {
    scanMode = 'search'; targetShelf = null;
    document.getElementById('modeBanner').style.display = 'none';
}

function handleScannedCode(raw) {
    const clean = raw.replace(/^H5ETL\//i, '').trim();
    const isItemCode = /^A\d{4}$/i.test(clean);

    if (scanMode === 'new_loc') {
        document.getElementById('n_loc').value = clean.toUpperCase();
        scanMode = 'search'; return;
    }

    if (scanMode === 'relocate') {
        const b = document.getElementById('modeBanner');
        if (!targetShelf) {
            targetShelf = clean.toUpperCase();
            b.innerHTML = `<strong>📍 Célpolc rögzítve: H5ETL/${targetShelf}</strong><br>2. lépés: Lőj rá az <b>ALKATRÉSZ</b> kódjára (pl. A0007) vagy válaszd ki a listából! <button onclick="cancelMode()" style="margin-left:8px;padding:2px 8px;border-radius:4px;border:1px solid #fff;background:transparent;color:#fff;cursor:pointer;">Kész</button>`;
            setTimeout(() => toggleScanner(), 400);
            return;
        } else if (isItemCode) {
            const it = items.find(x => x.id.toUpperCase() === clean.toUpperCase());
            if (it) {
                assignHere(it.id);
                setTimeout(() => toggleScanner(), 400);
            } else { alert(`❌ Nem található ilyen cikkszám: ${clean}`); }
            return;
        }
    }
    document.getElementById('q').value = clean;
    render();
}
function assignHere(id) {
    const it = items.find(x => x.id === id);
    if (!it || !targetShelf) return;

    const existingTarget = it.locs.find(l => l.loc.toUpperCase() === targetShelf.toUpperCase());
    const sourceLoc = it.locs.find(l => l.loc.toUpperCase() !== targetShelf.toUpperCase() && l.qty > 0);

    if (sourceLoc) {
        const ans = prompt(`📦 [${it.id}] ${it.name}\n\nHonnan: H5ETL/${sourceLoc.loc} (${sourceLoc.qty} db)\nHová: H5ETL/${targetShelf}\n\nMennyit teszel át erre a polcra? (0 = csak új készlet hozzáadása)`, "1");
        if (ans === null) return;
        const moveQty = Math.max(0, parseInt(ans, 10) || 0);
        if (moveQty > 0) {
            const actualMove = Math.min(moveQty, sourceLoc.qty);
            sourceLoc.qty -= actualMove;
            if (existingTarget) existingTarget.qty += actualMove;
            else it.locs.push({ loc: targetShelf, qty: actualMove });
        } else {
            const addNew = parseInt(prompt(`Mennyi új darabot teszel be ide: H5ETL/${targetShelf}?`, "1"), 10) || 0;
            if (existingTarget) existingTarget.qty += addNew;
            else it.locs.push({ loc: targetShelf, qty: addNew });
        }
    } else {
        const addQty = parseInt(prompt(`📥 [${it.id}] ${it.name}\nHely: H5ETL/${targetShelf}\n\nMennyi darabot teszel erre a polcra?`, "1"), 10);
        if (isNaN(addQty)) return;
        if (existingTarget) existingTarget.qty += Math.max(0, addQty);
        else it.locs.push({ loc: targetShelf, qty: Math.max(0, addQty) });
    }

    save();
    document.getElementById('q').value = targetShelf;
    render();
}

function getNextId() {
    let maxNum = 0;
    items.forEach(x => {
        const num = parseInt(String(x.id).replace(/\D/g, ''), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
    });
    return 'A' + String(maxNum + 1).padStart(4, '0');
}

function openNewModal(prefillLoc) {
    document.getElementById('n_id').value = getNextId();
    document.getElementById('n_name').value = '';
    document.getElementById('n_geb').value = 'BOX';
    document.getElementById('n_loc').value = prefillLoc || '';
    document.getElementById('n_ist').value = 1;
    document.getElementById('n_min').value = 1;
    document.getElementById('newModal').style.display = 'block';
}
function closeNewModal() { document.getElementById('newModal').style.display = 'none'; }
function scanForNewLoc() { scanMode = 'new_loc'; toggleScanner(); }

function saveNewItem() {
    const id = document.getElementById('n_id').value.trim().toUpperCase();
    const name = document.getElementById('n_name').value.trim();
    const geb = document.getElementById('n_geb').value.trim() || 'BOX';
    const cat = document.getElementById('n_cat').value;
    const loc = document.getElementById('n_loc').value.trim().toUpperCase().replace(/^H5ETL\//, '') || 'H5ET-Lager';
    const ist = parseInt(document.getElementById('n_ist').value, 10) || 0;
    const min = parseInt(document.getElementById('n_min').value, 10) || 1;

    if (!name) { alert('⚠️ Add meg az alkatrész megnevezését!'); return; }
    items.push({ id, name, geb, ist, min, cat, locs: [{ loc, qty: ist }] });
    save(); closeNewModal();
    document.getElementById('q').value = id; render();
}

function copyMissingList() {
    const q = document.getElementById('q').value.toLowerCase().trim().replace(/^h5etl\//, '');
    const activeCatObj = CATS.find(c => c.id === curCat) || CATS;
    const missing = items.filter(x => {
        if (!isMissing(x)) return false;
        if (curCat && curCat !== 'all' && x.cat !== curCat) return false;
        const locStr = x.locs.map(l => `${l.loc} H5ETL/${l.loc}`).join(' ');
        return `${x.id} ${x.name} ${locStr} ${x.geb}`.toLowerCase().includes(q);
    });
    if (!missing.length) { alert(`✅ Nincs hiányzó tétel itt: ${activeCatObj.title}!`); return; }
    const header = `BB MÜNCHINGER // BESTELLUNG – ${activeCatObj.title.toUpperCase()}\nLieferant: ??? | Rendelendő tételek: ${missing.length} db\n----------------------------------------\n`;
    const body = missing.map(x => {
        const locTxt = x.locs.map(l => `H5ETL/${l.loc} (${l.qty} db)`).join(', ');
        return `• [${x.id}] ${x.name} (${x.geb}) | Össz: ${x.ist}/${x.min} db (Rendelendő: min. ${Math.max(1, x.min - x.ist)} db) — ${locTxt}`;
    }).join('\n');
    navigator.clipboard.writeText(header + body).then(() => alert(`📋 ${missing.length} hiányzó tétel vágólapra másolva (${activeCatObj.title})!`));
}

function render() {
    const rawQ = document.getElementById('q').value.trim();
    const q = rawQ.toLowerCase().replace(/^h5etl\//, '');
    const catMenu = document.getElementById('catMenu');
    const itemSection = document.getElementById('itemSection');

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
        const locStr = x.locs.map(l => `${l.loc} H5ETL/${l.loc}`).join(' ');
        return `${x.id} ${x.name} ${locStr} ${x.geb}`.toLowerCase().includes(q);
    });

    const missC = baseList.filter(x => isMissing(x)).length;
    document.getElementById('stAll').innerText = `Összes (${baseList.length})`;
    document.getElementById('stOk').innerText = `✅ Elérhető (${baseList.length - missC})`;
    document.getElementById('stMiss').innerText = `⚠️ Hiány (${missC})`;

    const filtered = baseList.filter(x => curStatus === 'ok' ? !isMissing(x) : (curStatus === 'miss' ? isMissing(x) : true));
    const listEl = document.getElementById('list');
    const isItemId = /^A\d{4}$/i.test(cleanShelf);
    const addHereBanner = (q && !isItemId)
        ? `<div style="grid-column:1/-1; background:rgba(0,230,118,0.08); border:1px dashed var(--green); border-radius:10px; padding:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
             <span>📍 Polchely: <b>H5ETL/${cleanShelf}</b> (${baseList.length} tétel)</span>
             <button class="act-btn green" onclick="openNewModal('${cleanShelf}')">➕ Új alkatrész ide</button>
           </div>` : '';

    if (!filtered.length && q) {
        listEl.innerHTML = addHereBanner + `<div class="card" style="grid-column:1/-1; text-align:center; padding:1.5rem; color:var(--muted);">Nincs még tétel ezen a polcon.</div>`;
        return;
    }

    listEl.innerHTML = addHereBanner + filtered.map(x => {
        const isLow = isMissing(x);
        const locRows = x.locs.map((l, idx) => {
            const delBtn = (x.locs.length > 1 && l.qty === 0) ? `<button onclick="removeEmptyLoc('${x.id}',${idx})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:0.85rem;margin-left:4px;">🗑️</button>` : '';
            return `<div class="stock-row" style="background:rgba(0,0,0,0.28);padding:5px 8px;border-radius:6px;">
                <div><span class="loc-badge">📍 H5ETL/${l.loc}</span> <b style="color:#fff;margin-left:4px;">${l.qty} db</b>${delBtn}</div>
                <div class="qty-btns"><button class="q-btn" onclick="chgLocQty('${x.id}',${idx},-1)">-</button><button class="q-btn" onclick="chgLocQty('${x.id}',${idx},1)">+</button></div>
            </div>`;
        }).join('');

        const moveBtn = (scanMode === 'relocate' && targetShelf) ? `<button class="act-btn orange" style="width:100%;margin-top:6px;" onclick="assignHere('${x.id}')">📥 Betárolás / Áthelyezés ide: ${targetShelf}</button>` : '';
        return `<div class="card ${isLow ? 'missing' : ''}"><div><div class="card-top"><div style="display:flex;gap:6px;align-items:center;"><span class="id-badge">${x.id}</span>${isLow ? '<span class="miss-badge">HIÁNYZIK</span>' : '<span class="ok-badge">RENDBEN</span>'}</div><span style="font-size:0.85rem;font-weight:800;">Össz: <span class="stock-val ${isLow?'low':''}">${x.ist}</span> db</span></div><div class="art-title">${x.name}</div><div class="art-meta">Kiszerelés: <b>${x.geb}</b></div></div><div class="stock-box">${locRows}<div class="stock-row"><div>Minimum: <span class="min-val">${x.min}</span> db</div><div class="qty-btns"><button class="q-btn min-b" onclick="chgMin('${x.id}', -1)">-</button><button class="q-btn min-b" onclick="chgMin('${x.id}', 1)">+</button></div></div>${moveBtn}</div></div>`;
    }).join('');
}
render();

