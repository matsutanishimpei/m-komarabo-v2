import { checkAuth, logout as commonLogout, apiRequest, escapeHtml } from '../js/common.js';

        let currentUser = null;
        let currentMode = 'requester';

        // 初期化（非同期認証チェック）
        async function initPage() {
            currentUser = await checkAuth(true, 'komarabo');

            // UIの初期化
            document.getElementById('display_user_name').textContent = currentUser.display_name;

            // 要件定義プロンプトの読み込み
            loadRequirementPrompt();

            // デフォルトで相談者モード
            switchMode('requester');
        }

        function logout() {
            commonLogout('/login.html');
        }
        window.logout = logout;

        function switchMode(mode) {
            currentMode = mode;
            const btnReq = document.getElementById('btn-requester');
            const btnDev = document.getElementById('btn-developer');
            const sectionNew = document.getElementById('section-new-issue');
            const viewReq = document.getElementById('view-requester');
            const viewDev = document.getElementById('view-developer');
            const title = document.getElementById('dashboard-title');

            if (mode === 'requester') {
                btnReq.classList.add('bg-white', 'text-blue-600', 'shadow-sm');
                btnDev.classList.remove('bg-white', 'text-blue-600', 'shadow-sm');
                sectionNew.classList.remove('hidden');
                viewReq.classList.remove('hidden');
                viewDev.classList.add('hidden');
                title.innerText = 'マイ・ダッシュボード';
            } else {
                btnDev.classList.add('bg-white', 'text-blue-600', 'shadow-sm');
                btnReq.classList.remove('bg-white', 'text-blue-600', 'shadow-sm');
                sectionNew.classList.add('hidden');
                viewReq.classList.add('hidden');
                viewDev.classList.remove('hidden');
                title.innerText = '未解決の困りごと一覧（開発者向け）';
            }
            fetchIssues();
        }
        window.switchMode = switchMode;

        async function fetchIssues() {
            try {
                const endpoint = currentMode === 'requester'
                    ? `/api/issues/list?filter=mine`
                    : `/api/issues/list?filter=all`;

                const data = await apiRequest(endpoint);

                if (!Array.isArray(data)) {
                    console.error("Data is not an array:", data);
                    return;
                }

                if (currentMode === 'requester') {
                    renderRequester(data);
                } else {
                    renderDeveloper(data);
                }
            } catch (err) {
                console.error("Fetch Error:", err);
                alert("エラー: " + err.message);
            }
        }

        function renderRequester(data) {
            const openList = document.getElementById('list-open');
            const progressList = document.getElementById('list-progress');
            const closedList = document.getElementById('list-closed');

            const renderItem = (i, showDelete = false) => `
                <div class="bg-white p-5 rounded-xl border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-200 transition group">
                    <a href="detail.html?id=${i.id}" class="block">
                        <h5 class="font-bold text-slate-800 group-hover:text-blue-600 transition truncate">${escapeHtml(i.title)}</h5>
                        <p class="text-[10px] text-slate-400 mt-2 uppercase tracking-tighter">${new Date(i.created_at).toLocaleDateString()}</p>
                    </a>
                    ${showDelete ? `
                        <button onclick="deleteIssue(${i.id}, event)" class="mt-3 w-full py-2 text-xs font-bold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition">
                            取り下げる
                        </button>
                    ` : ''}
                </div>
            `;

            const openItems = data.filter(i => (i.status || 'open') === 'open');
            const progressItems = data.filter(i => i.status === 'progress');
            const closedItems = data.filter(i => i.status === 'closed');

            openList.innerHTML = openItems.map(i => renderItem(i, true)).join('') || `<p class="text-xs text-slate-300 text-center py-10">なし</p>`;
            progressList.innerHTML = progressItems.map(i => renderItem(i, false)).join('') || `<p class="text-xs text-slate-300 text-center py-10">なし</p>`;
            closedList.innerHTML = closedItems.map(i => renderItem(i, false)).join('') || `<p class="text-xs text-slate-300 text-center py-10">なし</p>`;

            document.getElementById('count-open').innerText = openItems.length;
            document.getElementById('count-progress').innerText = progressItems.length;
            document.getElementById('count-closed').innerText = closedItems.length;
        }

        function renderDeveloper(data) {
            const assignedList = document.getElementById('list-developer-assigned');
            const availableList = document.getElementById('list-developer-available');

            // 自分が着手中 (status=progress AND developer_id=自分)
            const myWork = data.filter(i => i.status === 'progress' && i.developer_id === currentUser.id);
            // 未着手 (status=open)
            const available = data.filter(i => (i.status || 'open') === 'open');

            const renderCard = (i, isMyWork) => `
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between hover:border-blue-200 transition">
                    <div>
                        <div class="flex justify-between items-start mb-4">
                            <span class="text-[10px] font-bold ${isMyWork ? 'text-amber-500 bg-amber-50' : 'text-blue-500 bg-blue-50'} px-2 py-1 rounded tracking-widest uppercase">
                                ${isMyWork ? 'Progress' : 'Open'}
                            </span>
                            <span class="text-[10px] text-slate-400 font-medium">${escapeHtml(i.requester_name || '')}</span>
                        </div>
                        <h5 class="text-lg font-bold text-slate-800 mb-2 truncate">${escapeHtml(i.title)}</h5>
                        <p class="text-sm text-slate-500 line-clamp-2 mb-6 h-10">${escapeHtml(i.description)}</p>
                    </div>
                    <div class="flex gap-2">
                        <a href="detail.html?id=${i.id}" class="flex-1 text-center py-2.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition">詳細</a>
                        ${isMyWork
                    ? `<button onclick="unassignIssue(${i.id})" class="flex-[2] py-2.5 text-xs font-bold text-white bg-slate-600 rounded-xl hover:bg-slate-700 transition">挙手を下ろす</button>`
                    : `<button onclick="takeIssue(${i.id})" class="flex-[2] py-2.5 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-100 transition">着手する</button>`
                }
                    </div>
                </div>
            `;

            assignedList.innerHTML = myWork.map(i => renderCard(i, true)).join('') || `<div class="col-span-full py-10 text-center text-slate-300 text-xs italic">現在着手中の課題はありません</div>`;
            availableList.innerHTML = available.map(i => renderCard(i, false)).join('') || `<div class="col-span-full py-10 text-center text-slate-300 text-xs italic">募集中の課題はありません</div>`;
        }

        async function takeIssue(id) {
            if (!confirm('この課題に着手しますか？')) return;
            try {
                await apiRequest('/api/issues/update-status', {
                    method: 'POST',
                    body: JSON.stringify({ id, status: 'progress' })
                });
                fetchIssues();
                alert('着手しました！「現在着手中」へ移動しました。');
            } catch (err) {
                alert('エラーが発生しました');
            }
        }
        window.takeIssue = takeIssue;

        async function unassignIssue(id) {
            if (!confirm('この課題への挙手を下ろしますか？（未着手状態に戻ります）')) return;
            try {
                await apiRequest('/api/issues/unassign', {
                    method: 'POST',
                    body: JSON.stringify({ id })
                });
                fetchIssues();
                alert('挙手を下ろしました。');
            } catch (err) {
                alert('エラーが発生しました');
            }
        }
        window.unassignIssue = unassignIssue;

        async function deleteIssue(id, event) {
            event.preventDefault();
            event.stopPropagation();

            if (!confirm('この課題を取り下げますか？\n※着手されていない課題のみ削除できます')) return;

            try {
                const result = await apiRequest('/api/issues/delete', {
                    method: 'POST',
                    body: JSON.stringify({ id })
                });
                fetchIssues();
                alert(result.message || '課題を削除しました');
            } catch (err) {
                console.error('Delete Error:', err);
                alert(err.message || 'エラーが発生しました');
            }
        }
        window.deleteIssue = deleteIssue;

        async function postIssue() {
            const title = document.getElementById('title').value;
            const description = document.getElementById('description').value;

            if (!title || !description) {
                alert('タイトルと内容を入力してください');
                return;
            }

            try {
                await apiRequest('/api/issues/post', {
                    method: 'POST',
                    body: JSON.stringify({ title, description })
                });

                fetchIssues();
                alert('投稿しました！');
                document.getElementById('title').value = '';
                document.getElementById('description').value = '';
            } catch (err) {
                alert('投稿エラー: ' + err.message);
            }
        }

        window.postIssue = postIssue;

        // 要件定義プロンプトの読み込み
        async function loadRequirementPrompt() {
            try {
                const data = await apiRequest('/api/issues/requirement-prompt');
                if (data.prompt && data.prompt.trim()) {
                    document.getElementById('requirementPrompt').textContent = data.prompt;
                    document.getElementById('promptSection').style.display = 'block';
                }
            } catch (err) {
                console.error('要件定義プロンプトの取得に失敗:', err);
            }
        }

        function copyRequirementPrompt() {
            const prompt = document.getElementById('requirementPrompt').textContent;
            navigator.clipboard.writeText(prompt).then(() => {
                alert('プロンプトをコピーしました！');
            });
        }
        window.copyRequirementPrompt = copyRequirementPrompt;

        // ページ初期化
        initPage();