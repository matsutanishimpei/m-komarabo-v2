import { escapeHtml, checkAuth, logout as commonLogout, apiRequest } from '../js/common.js';

const API_BASE = '/api';
const urlParams = new URLSearchParams(window.location.search);
const issueId = urlParams.get('id');

let currentUser = null;

if (!issueId) window.location.href = 'index.html';

async function initPage() {
    currentUser = await checkAuth(true, 'komarabo');
    document.getElementById('display-user-name').textContent = currentUser.display_name;
    await fetchIssueDetail();
}

async function fetchIssueDetail() {
    try {
        const data = await apiRequest(`${API_BASE}/issues/detail?id=${issueId}`);
        renderDetail(data);
        scrollToBottom();
    } catch (err) {
        console.error(err);
        alert("データの取得に失敗しました");
    }
}

function scrollToBottom() {
    const timeline = document.getElementById('comment-timeline');
    timeline.scrollTop = timeline.scrollHeight;
}

function renderDetail(data) {
    const { issue, comments } = data;

    document.getElementById('issue-title').textContent = issue.title;
    document.getElementById('issue-description').textContent = issue.description;
    document.getElementById('issue-requester').textContent = issue.requester_name || '--';
    document.getElementById('issue-developer').textContent = issue.developer_name || '未着手';
    document.getElementById('issue-date').textContent = new Date(issue.created_at).toLocaleString();

    // グローバルに保存して編集時に使う
    window.currentIssueData = issue;

    const statusEl = document.getElementById('issue-status');
    statusEl.textContent = issue.status;
    statusEl.className = `text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${issue.status === 'open' ? 'bg-blue-100 text-blue-600' :
        issue.status === 'progress' ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-500'
        }`;

    const actions = document.getElementById('issue-actions');
    actions.innerHTML = '';

    const isRequester = currentUser.id === issue.requester_id;
    const isDeveloper = currentUser.id === issue.developer_id;

    if (isRequester && issue.status !== 'closed') {
        actions.innerHTML += `<button onclick="updateStatus('closed')" class="px-4 py-2 border-2 border-slate-900 text-slate-900 text-[10px] font-black rounded-lg hover:bg-slate-900 hover:text-white transition">解決を承認する</button>`;
    }
    if (isDeveloper && issue.status === 'progress') {
        actions.innerHTML += `
                    <button onclick="postResolutionReport()" class="px-4 py-2 bg-blue-600 text-white text-[10px] font-black rounded-lg hover:bg-blue-700 shadow-md shadow-blue-100 transition">解決報告を送る</button>
                    <button onclick="unassignIssue()" class="px-4 py-2 text-slate-400 text-[10px] font-bold hover:text-red-500 transition">挙手を下ろす</button>
                `;
    }
    if (isRequester && issue.status === 'progress' && issue.developer_id) {
        actions.innerHTML += `
                    <button onclick="releaseDeveloper()" class="px-4 py-2 text-amber-500 border border-amber-300 text-[10px] font-bold rounded-lg hover:bg-amber-50 transition">担当者を解除する</button>
                `;
    }

    // 要件定義ログの表示 (常に最新を表示)
    renderRequirementLog(issue.requirement_log, isRequester || isDeveloper);

    const timeline = document.getElementById('comment-timeline');
    timeline.innerHTML = comments.map(c => {
        const isMine = c.user_id === currentUser.id;
        return `
                    <div class="flex ${isMine ? 'justify-end' : 'justify-start'}">
                        <div class="max-w-[75%]">
                            <div class="flex items-center gap-2 mb-1 px-1 ${isMine ? 'justify-end' : ''}">
                                <span class="text-[9px] font-bold text-slate-400">${escapeHtml(c.user_name || c.display_name || '')}</span>
                                <span class="text-[9px] text-slate-300 font-medium">${new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div class="p-4 rounded-2xl text-[13px] shadow-sm ${isMine ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-slate-50 text-slate-700 rounded-tl-none border border-slate-100'
            }">
                                ${escapeHtml(c.content).replace(/\n/g, '<br>')}
                            </div>
                        </div>
                    </div>
                `;
    }).join('') || '<div class="h-full flex items-center justify-center text-slate-300 text-xs italic">やり取りはまだありません</div>';
}

function renderRequirementLog(logText, canEdit) {
    const container = document.getElementById('gemini-logs');

    const contentHtml = logText
        ? `<div class="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm leading-relaxed text-sm text-slate-600 whitespace-pre-wrap">${escapeHtml(logText)}</div>`
        : `<div class="p-4 bg-white rounded-2xl border border-slate-100 text-xs italic text-slate-400">現在、要件定義ログの履歴はありません。<br>開発者が相談者と対話しながら詳細要件をここにまとめていきます。</div>`;

    let editButtonHtml = '';
    if (canEdit) {
        editButtonHtml = `<button onclick="editRequirement()" class="ml-auto text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded font-bold transition">編集する</button>`;
    }

    const section = container.parentElement;
    const h3 = section.querySelector('h3');

    const existingBtn = h3.querySelector('button');
    if (existingBtn) existingBtn.remove();

    if (canEdit) {
        h3.innerHTML = `
                    <div class="flex items-center gap-2">
                        <span class="w-1 h-3 bg-blue-400 rounded-full"></span>
                        要件定義
                    </div>
                    ${editButtonHtml}
                 `;
        h3.className = "text-[10px] uppercase font-black text-slate-400 mb-4 flex items-center justify-between";
    }

    container.innerHTML = contentHtml;
}

window.editRequirement = function () {
    const issue = window.currentIssueData;
    const currentText = issue.requirement_log || '';
    const container = document.getElementById('gemini-logs');

    container.innerHTML = `
                <div class="relative">
                    <textarea id="req-editor" class="w-full p-4 bg-white border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm text-slate-700 leading-relaxed mb-3 font-mono" rows="15" placeholder="ここに要件定義やAIとの対話ログを貼り付けて整理してください...">${escapeHtml(currentText)}</textarea>
                    <div class="flex gap-2 justify-end">
                        <button onclick="cancelEditReq()" class="px-4 py-2 text-slate-500 font-bold text-xs hover:bg-slate-100 rounded-lg transition">キャンセル</button>
                        <button onclick="saveRequirement()" class="px-6 py-2 bg-blue-600 text-white font-bold text-xs rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-200 transition">保存して更新</button>
                    </div>
                </div>
            `;

    const section = container.parentElement;
    const btn = section.querySelector('h3 button');
    if (btn) btn.style.display = 'none';
};

window.cancelEditReq = function () {
    renderRequirementLog(window.currentIssueData.requirement_log, true);
};

window.saveRequirement = async function () {
    const newText = document.getElementById('req-editor').value;
    try {
        const res = await apiRequest(`${API_BASE}/issues/update-requirement`, {
            method: 'POST',
            body: JSON.stringify({
                id: issueId,
                requirement_log: newText
            })
        });

        if (res.success) {
            await fetchIssueDetail();
            alert('要件定義ログを更新しました');
        } else {
            alert('更新エラー: ' + (res.message || '不明なエラー'));
        }
    } catch (e) {
        console.error(e);
        alert('通信エラーが発生しました');
    }
};

async function postComment() {
    const input = document.getElementById('comment-input');
    const content = input.value.trim();
    if (!content) return;

    try {
        await apiRequest(`${API_BASE}/issues/comment`, {
            method: 'POST',
            body: JSON.stringify({ issue_id: issueId, content })
        });
        input.value = '';
        await fetchIssueDetail();
        scrollToBottom();
    } catch (err) {
        alert("コメントの投稿に失敗しました");
    }
}

async function updateStatus(status) {
    if (!confirm(`解決を承認し、この課題をクローズしますか？`)) return;
    try {
        await apiRequest(`${API_BASE}/issues/update-status`, {
            method: 'POST',
            body: JSON.stringify({ id: issueId, status })
        });
        fetchIssueDetail();
    } catch (err) {
        alert("更新に失敗しました");
    }
}

async function unassignIssue() {
    if (!confirm('挙手を下ろしますか？\n✔ この課題は再度オープンに戻ります。')) return;
    try {
        await apiRequest(`${API_BASE}/issues/unassign`, {
            method: 'POST',
            body: JSON.stringify({ id: issueId })
        });
        fetchIssueDetail();
    } catch (err) {
        alert("キャンセルに失敗しました");
    }
}

async function releaseDeveloper() {
    const devName = window.currentIssueData?.developer_name || '担当者';
    if (!confirm(`${devName} の担当を解除しますか？\n❗ 担当者へのこれまでの作業記録（コメント・要件定義ログ）は消えません。`)) return;
    try {
        const res = await apiRequest(`${API_BASE}/issues/unassign`, {
            method: 'POST',
            body: JSON.stringify({ id: issueId })
        });
        if (res.success) {
            fetchIssueDetail();
        } else {
            alert('解除に失敗しました: ' + (res.message || ''));
        }
    } catch (err) {
        alert("解除に失敗しました");
    }
}

async function postResolutionReport() {
    const msg = "✅ 解決しました！内容の確認をお願いします。";
    await apiRequest(`${API_BASE}/issues/comment`, {
        method: 'POST',
        body: JSON.stringify({ issue_id: issueId, content: msg })
    });
    alert("解決報告を送りました！");
    await fetchIssueDetail();
    scrollToBottom();
}

function logout() {
    commonLogout('/login.html');
}

// Expose functions for onclick handlers (required for type="module")
window.logout = logout;
window.postComment = postComment;
window.updateStatus = updateStatus;
window.postResolutionReport = postResolutionReport;
window.unassignIssue = unassignIssue;
window.releaseDeveloper = releaseDeveloper;

// Enterで送信（Shift+Enterで改行）
document.getElementById('comment-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        postComment();
    }
});

initPage();