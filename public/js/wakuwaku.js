/**
 * ワクワク試作室 - メインロジック
 * Ideation / Development / Archive の3つのフェーズを管理
 * Google OAuth + JWT Cookie 認証対応
 */
import { checkAuth, logout as commonLogout, escapeHtml, fetchAuthUser, apiRequest } from './common.js';

// ========================================
// State
// ========================================

let currentUser = null;
let currentDraftId = null;
let allProducts = [];
let basePrompts = [];

// ========================================
// Init & Auth
// ========================================

async function init() {
    currentUser = await checkAuth(false, 'wakuwaku');
    const statusElement = document.getElementById('loginStatus');

    if (currentUser) {
        statusElement.innerHTML = `
            <span class="text-slate-300">User: <strong class="text-white font-mono">${escapeHtml(currentUser.display_name)}</strong></span>
            <button onclick="window.location.href='/profile.html#wakuwaku'" class="px-3 py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/30 hover:bg-purple-500/40 transition text-purple-300 text-xs font-medium">プロフィール</button>
            <button onclick="window.handleLogout()" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition text-slate-300 text-xs font-medium">ログアウト</button>
        `;
        loadDrafts();
    } else {
        statusElement.innerHTML = `
            <a href="/login.html#wakuwaku" class="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 transition text-white text-xs font-medium">ログイン</a>
        `;
    }

    loadArchives();
    loadBasePrompts();
    switchTab('personal');
}

window.handleLogout = () => commonLogout('/wakuwaku/index.html');

// ========================================
// Tab Switching
// ========================================

function switchTab(tab) {
    const btnPersonal = document.getElementById('btn-personal');
    const btnGallery = document.getElementById('btn-gallery');
    const viewPersonal = document.getElementById('view-personal');
    const viewGallery = document.getElementById('view-gallery');

    if (tab === 'personal') {
        btnPersonal.classList.add('bg-purple-600', 'text-white', 'shadow-md');
        btnPersonal.classList.remove('text-slate-400');
        btnGallery.classList.remove('bg-purple-600', 'bg-emerald-600', 'text-white', 'shadow-md');
        btnGallery.classList.add('text-slate-400');

        viewPersonal.classList.remove('hidden');
        viewGallery.classList.add('hidden');
    } else {
        btnGallery.classList.add('bg-emerald-600', 'text-white', 'shadow-md');
        btnGallery.classList.remove('text-slate-400');
        btnPersonal.classList.remove('bg-purple-600', 'text-white', 'shadow-md');
        btnPersonal.classList.add('text-slate-400');

        viewGallery.classList.remove('hidden');
        viewPersonal.classList.add('hidden');
    }
}
window.switchTab = switchTab;

// ========================================
// Ideation Logic
// ========================================

window.generateSeed = async () => {
    const interest = document.getElementById('input-interest').value.trim();
    if (!interest) {
        alert('興味・関心を入力してください');
        return;
    }

    // 1. Get Random Constraint
    let constraint = { content: 'なし', category: 'Default' };
    try {
        const res = await fetch('/api/wakuwaku/constraints/random', { credentials: 'same-origin' });
        if (res.ok) constraint = await res.json();
    } catch (e) { console.error(e); }

    document.getElementById('constraint-category').innerText = constraint.category || 'Constraint';
    document.getElementById('constraint-content').innerText = constraint.content;

    // 2. Get Base Prompt & Combine
    let basePromptTemplate = '';

    // 選択されたBase Promptを取得
    const tendencySelect = document.getElementById('input-tendency');
    if (tendencySelect && basePrompts.length > 0) {
        const selectedId = parseInt(tendencySelect.value);
        const found = basePrompts.find(p => p.id === selectedId);
        if (found) {
            basePromptTemplate = found.prompt;
        }
    }

    // もし選択されていない、またはロード前ならデフォルトを使う
    if (!basePromptTemplate) {
        try {
            basePromptTemplate = `以下のテーマで、尖ったWebアプリケーションの仕様とプロトタイプコードを考えてください。
    
【テーマ】
{{THEME}}

【絶対的な制約】
{{CONSTRAINT}}

【出力要件】
1. アプリのキャッチコピー
2. 詳細な仕様（プロトコル）
3. 実装するためのHTML/JSコード（単一ファイルで動作するもの）
4. 開発者の「変執的なこだわり」ポイント
`;
        } catch (e) { console.error(e); }
    }

    const seedText = basePromptTemplate
        .replace(/{{THEME}}/g, interest)
        .replace(/{{CONSTRAINT}}/g, constraint.content);

    document.getElementById('output-seed').value = seedText;

    const btnArea = document.getElementById('action-create-project');
    btnArea.classList.remove('opacity-50', 'pointer-events-none');
};

window.copySeed = () => {
    const text = document.getElementById('output-seed').value;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => alert('コピーしました！'));
};

// ========================================
// Development Logic
// ========================================

window.createProjectFromSeed = async () => {
    if (!currentUser) { alert('ログインしてください'); return; }

    const interest = document.getElementById('input-interest').value.trim();
    const constraint = document.getElementById('constraint-content').innerText;
    if (!interest || constraint === '???') {
        alert('まずはIdeationでテーマを生成してください');
        return;
    }

    const title = `${interest} × ${constraint}`;

    try {
        const data = await apiRequest('/api/wakuwaku/drafts', {
            method: 'POST',
            body: JSON.stringify({ title })
        });
        if (data.success) {
            await loadDrafts();
            document.getElementById('section-development').scrollIntoView({ behavior: 'smooth' });
            setTimeout(() => {
                const firstDraft = document.querySelector('#draft-list > div');
                if (firstDraft) firstDraft.click();
            }, 500);
        } else {
            alert('失敗しました: ' + data.message);
        }
    } catch (e) {
        console.error(e);
        alert('エラーが発生しました');
    }
};

// ========================================
// Drafts
// ========================================

async function loadDrafts() {
    if (!currentUser) return;
    try {
        const drafts = await apiRequest('/api/wakuwaku/drafts');
        const container = document.getElementById('draft-list');

        if (drafts.length === 0) {
            container.innerHTML = '<div class="text-center py-10 text-slate-600 text-sm">進行中のドラフトはありません</div>';
            return;
        }

        // data-*属性経由で安全にデータを参照する（JSON直接埋め込みを排除）
        const draftMap = new Map(drafts.map(d => [String(d.id), d]));

        container.innerHTML = drafts.map(d => `
            <div data-draft-id="${d.id}"
                 class="draft-item p-3 bg-slate-900 rounded-xl cursor-pointer hover:bg-slate-800 transition border border-transparent hover:border-slate-700 group flex items-center justify-between">
                <div class="flex-1 min-w-0 pr-2 pointer-events-none">
                   <h4 class="font-bold text-slate-300 text-sm truncate group-hover:text-white">${escapeHtml(d.title)}</h4>
                   <p class="text-[10px] text-slate-500 mt-1">${new Date(d.created_at).toLocaleDateString()}</p>
                </div>
                <button data-delete-id="${d.id}" class="draft-delete-btn p-1.5 rounded-lg hover:bg-slate-700 text-slate-600 hover:text-red-400 transition" title="下書きを削除">
                   <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        `).join('');

        // イベントリスナーでデータを安全に取得
        container.querySelectorAll('.draft-item').forEach(el => {
            el.addEventListener('click', (e) => {
                // 削除ボタンのクリックは無視
                if (e.target.closest('.draft-delete-btn')) return;
                const id = el.dataset.draftId;
                const draft = draftMap.get(id);
                if (draft) window.selectDraft(draft);
            });
        });

        container.querySelectorAll('.draft-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = Number(btn.dataset.deleteId);
                if (id) window.confirmDeleteDraft(id);
            });
        });

    } catch (e) { console.error(e); }
}

function selectDraft(draft) {
    currentDraftId = draft.id;
    document.getElementById('editor-overlay').classList.add('hidden');
    document.getElementById('edit-title').value = draft.title;
    document.getElementById('edit-url').value = draft.url || '';
    document.getElementById('edit-memo').value = draft.dev_obsession || '';
    document.getElementById('edit-protocol').value = draft.protocol_log || '';
    document.getElementById('edit-dialogue').value = draft.dialogue_log || '';
    document.getElementById('edit-catchcopy').value = draft.catch_copy || '';
}
window.selectDraft = selectDraft;

function clearEditor() {
    currentDraftId = null;
    document.getElementById('editor-overlay').classList.remove('hidden');
    document.getElementById('edit-title').value = '';
    document.getElementById('edit-url').value = '';
    document.getElementById('edit-memo').value = '';
    document.getElementById('edit-protocol').value = '';
    document.getElementById('edit-dialogue').value = '';
    document.getElementById('edit-catchcopy').value = '';
}

window.saveDraft = async () => {
    if (!currentDraftId) return;

    const url = document.getElementById('edit-url').value;
    const memo = document.getElementById('edit-memo').value;
    const protocol_log = document.getElementById('edit-protocol').value;
    const dialogue_log = document.getElementById('edit-dialogue').value;
    const catch_copy = document.getElementById('edit-catchcopy').value;

    try {
        await apiRequest('/api/wakuwaku/drafts/save', {
            method: 'POST',
            body: JSON.stringify({
                id: currentDraftId,
                url,
                dev_obsession: memo,
                protocol_log,
                dialogue_log,
                catch_copy
            })
        });
        alert('保存しました！');
        await loadDrafts();
    } catch (e) { alert('保存に失敗しました'); }
};

window.sealProduct = async () => {
    if (!currentDraftId) return;
    if (!confirm('本当に封印（提出）しますか？これにより公開され、編集できなくなります。')) return;

    const protocol_log = document.getElementById('edit-protocol').value;
    const dialogue_log = document.getElementById('edit-dialogue').value;
    const catch_copy = document.getElementById('edit-catchcopy').value;

    if (!protocol_log || !dialogue_log) {
        alert('仕様書(Protocol)と対話ログ(Dialogue Log)は必須です');
        return;
    }

    try {
        const data = await apiRequest('/api/wakuwaku/seal', {
            method: 'POST',
            body: JSON.stringify({
                id: currentDraftId,
                protocol_log,
                dialogue_log,
                catch_copy
            })
        });
        if (data.success) {
            alert('封印完了！');
            clearEditor();
            loadDrafts();
            loadArchives();

            if (confirm('封印しました。みんなの広場 (Gallery) で確認しますか？')) {
                switchTab('gallery');
            }
        } else {
            alert('エラー: ' + data.message);
        }
    } catch (e) { alert('封印エラー'); }
};

window.confirmDeleteDraft = async (id) => {
    if (!confirm('本当に削除しますか？この操作は取り消せません。')) return;
    try {
        const data = await apiRequest('/api/wakuwaku/delete-product', {
            method: 'POST',
            body: JSON.stringify({ id })
        });
        if (data.success) {
            alert('削除しました');
            if (currentDraftId == id) {
                clearEditor();
            }
            loadDrafts();
        } else {
            alert('削除失敗: ' + data.message);
        }
    } catch (e) { alert('削除エラー'); }
};

// ========================================
// Archive (Gallery) Logic
// ========================================

async function loadArchives() {
    try {
        allProducts = await apiRequest('/api/wakuwaku/products');

        // Populate Filter Dropdown
        const filterSelect = document.getElementById('filter-user');
        const users = [...new Set(allProducts.map(p => p.creator_name).filter(u => u))];
        const currentSelection = filterSelect.value || 'all';

        let optionsHtml = '<option value="all">All Users</option>';
        users.forEach(u => {
            optionsHtml += `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`;
        });
        filterSelect.innerHTML = optionsHtml;

        if (users.includes(currentSelection) || currentSelection === 'all') {
            filterSelect.value = currentSelection;
        }

        filterArchives();
    } catch (e) { console.error(e); }
}

function filterArchives() {
    const filterSelect = document.getElementById('filter-user');
    if (!filterSelect) return;

    const filterUser = filterSelect.value;
    let filtered = allProducts;
    if (filterUser !== 'all') {
        filtered = allProducts.filter(p => p.creator_name === filterUser);
    }
    renderGrid(filtered);
}
window.filterArchives = filterArchives;

function renderGrid(products) {
    const grid = document.getElementById('archive-grid');
    if (!grid) return;

    if (products.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center py-20 text-slate-600">表示するアーカイブはありません</div>';
        return;
    }

    const adminFlag = currentUser && currentUser.role === 'admin';

    grid.innerHTML = products.map(p => {
        const creatorDisplay = p.creator_name || 'Unknown';

        return `
        <div class="bg-slate-900 border border-slate-700 rounded-xl p-6 hover:border-emerald-500/50 transition group flex flex-col justify-between h-full">
            <div>
                <h3 class="font-bold text-white text-lg mb-2 line-clamp-2" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</h3>
                <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-4">
                    <span class="bg-slate-800 px-2 py-0.5 rounded text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                        ${escapeHtml(creatorDisplay)}
                    </span>
                    <span>${new Date(p.sealed_at).toLocaleDateString()}</span>
                </div>
            </div>
            
            <div class="flex gap-3 pt-4 border-t border-slate-800 mt-2">
                 <a href="detail.html?id=${p.id}" class="flex-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded text-center transition border border-slate-700 flex items-center justify-center gap-1">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    提出データ(詳細)
                </a>
                ${adminFlag ? `
                <button onclick="window.unsealProduct(${p.id})" class="px-3 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-500 text-xs rounded border border-red-500/30 flex items-center gap-1" title="下書きに戻す (管理者)">
                     <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"></path></svg>
                     Unlock
                </button>` : ''}
                ${p.url ? `
                <a href="${escapeHtml(p.url)}" target="_blank" class="px-3 py-2 bg-blue-900/20 hover:bg-blue-900/30 text-blue-400 text-xs rounded border border-blue-500/30 flex items-center gap-1" title="URLを開く">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                    URL
                </a>` : ''}
            </div>
        </div>
    `}).join('');
}

// ========================================
// Admin Actions
// ========================================

window.unsealProduct = async (id) => {
    if (!confirm('このプロダクトを下書きに戻しますか？（管理者のみ）')) return;
    try {
        const data = await apiRequest('/api/wakuwaku/unseal', {
            method: 'POST',
            body: JSON.stringify({ id })
        });
        if (data.success) {
            alert('下書きに戻しました');
            loadArchives();
        } else {
            alert('エラー: ' + data.message);
        }
    } catch (e) { alert('通信エラー'); }
};

// ========================================
// Boot
// ========================================

async function loadBasePrompts() {
    try {
        const res = await fetch('/api/wakuwaku/base-prompts', { credentials: 'same-origin' });
        const data = await res.json();
        if (data.success && data.prompts) {
            basePrompts = data.prompts;
            const select = document.getElementById('input-tendency');
            if (select) {
                if (basePrompts.length === 0) {
                    select.innerHTML = '<option value="">(設定なし)</option>';
                } else {
                    select.innerHTML = basePrompts.map(p =>
                        `<option value="${p.id}">${escapeHtml(p.label)}</option>`
                    ).join('');
                }
            }
        }
    } catch (e) { console.error('Base prompts load error', e); }
}

init();
