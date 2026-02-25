import { injectWakuwakuBackground } from '../js/theme.js';
injectWakuwakuBackground();

import { checkAuth, apiRequest, validateRequired } from '../js/common.js';

let currentUser = null;
let basePrompts = [];

async function initPage() {
    currentUser = await checkAuth(true, 'wakuwaku');
    await loadBasePrompt();
}

// ベースプロンプトを取得
async function loadBasePrompt() {
    try {
        const res = await apiRequest('/api/wakuwaku/base-prompts');
        if (res.success && res.prompts) {
            basePrompts = res.prompts;
            const select = document.getElementById('basePromptSelect');
            if (basePrompts.length === 0) {
                select.innerHTML = '<option value="">(設定なし)</option>';
                document.getElementById('basePrompt').textContent = '設定がありません';
                return;
            }

            // Populate select
            select.innerHTML = basePrompts.map((p, index) =>
                `<option value="${index}">${escapeHtml(p.label)}</option>`
            ).join('');

            // Show first one
            updatePromptDisplay();
        }
    } catch (err) {
        console.error(err);
        document.getElementById('basePrompt').textContent = 'プロンプトの読み込みに失敗しました';
    }
}

function updatePromptDisplay() {
    const select = document.getElementById('basePromptSelect');
    const index = select.value;
    if (basePrompts[index]) {
        document.getElementById('basePrompt').textContent = basePrompts[index].prompt;
    }
}
window.updatePromptDisplay = updatePromptDisplay;

function copyPrompt() {
    const prompt = document.getElementById('basePrompt').textContent;
    navigator.clipboard.writeText(prompt).then(() => {
        alert('プロンプトをコピーしました！\nAIとの対話を楽しんでください。');
    });
}
window.copyPrompt = copyPrompt;

async function submitProduct() {
    const title = document.getElementById('title').value.trim();
    const url = document.getElementById('url').value.trim();
    const initialPromptLog = document.getElementById('initialPromptLog').value.trim();
    const devObsession = document.getElementById('devObsession').value.trim();

    if (!validateRequired(title, 'アプリ名') || !validateRequired(url, '作品URL（WEBアプリ）') || !validateRequired(initialPromptLog, 'AIとの格闘記録')) {
        return;
    }

    if (!confirm('本当に投稿しますか？\n\nAIとの履歴は投稿後に編集できなくなります。')) {
        return;
    }

    try {
        const data = await apiRequest('/api/wakuwaku/post-product', {
            method: 'POST',
            body: JSON.stringify({
                title,
                url,
                initial_prompt_log: initialPromptLog,
                dev_obsession: devObsession || null
            })
        });

        if (data.success) {
            alert('投稿完了しました！\nあなたの初期衝動が永久保存されました。');
            location.href = 'index.html';
        } else {
            alert('エラー: ' + (data.message || 'サーバーエラーが発生しました'));
        }
    } catch (err) {
        console.error('投稿エラー:', err);
        alert('投稿に失敗しました。しばらく待ってからもう一度お試しください。');
    }
}
window.submitProduct = submitProduct;

// 初期化
initPage();