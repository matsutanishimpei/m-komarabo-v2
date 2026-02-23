import { checkAuth, adminApiRequest, apiRequest, formatDate, validateRequired, escapeHtml } from '../js/common.js';

        let currentUser = null;

        // 管理者チェック（JWT Cookie認証 + adminGuardミドルウェア）
        async function checkAdminAccess() {
            try {
                // checkAuth で認証確認（リダイレクトはしない）
                currentUser = await checkAuth(false);

                if (!currentUser) {
                    location.href = '../login.html';
                    return false;
                }

                // /api/admin/check で管理者権限を確認
                // （adminGuardミドルウェアで保護されているため、403の場合は管理者でない）
                const data = await apiRequest('/api/admin/check');

                if (!data.is_admin) {
                    location.href = '../index.html';
                    return false;
                }

                // 管理者確認OK → ページ表示
                document.getElementById('authLoading').style.display = 'none';
                document.getElementById('adminContent').style.display = 'block';
                document.getElementById('adminName').textContent = `管理者: ${currentUser.display_name}`;
                return true;
            } catch (err) {
                console.error(err);
                location.href = '../index.html';
                return false;
            }
        }

        // 統計情報を取得
        async function loadStats() {
            try {
                const data = await adminApiRequest('/api/admin/stats');

                if (data) {
                    document.getElementById('userCount').textContent = data.users || 0;
                    document.getElementById('issueCount').textContent = data.issues || 0;
                    document.getElementById('productCount').textContent = data.products || 0;
                    document.getElementById('commentCount').textContent = data.comments || 0;
                }
            } catch (err) {
                console.error('統計情報の取得に失敗:', err);
            }
        }

        // ベースプロンプト一覧を取得
        let currentBasePrompts = [];

        async function loadBasePrompts() {
            try {
                const data = await adminApiRequest('/api/admin/base-prompts/list');
                const list = document.getElementById('basePromptList');
                if (data && data.results) {
                    currentBasePrompts = data.results;
                    if (currentBasePrompts.length === 0) {
                        list.innerHTML = '<p class="text-center text-xs text-gray-500 py-4">設定がありません</p>';
                        return;
                    }
                    list.innerHTML = data.results.map(p => `
                        <div class="p-3 bg-white border border-gray-100 rounded-lg shadow-sm hover:border-purple-300 transition group relative">
                            <div class="flex justify-between items-start mb-2">
                                <h4 class="font-bold text-gray-800 text-sm">${escapeHtml(p.label)}</h4>
                                <div class="flex gap-2">
                                    <button onclick="editBasePrompt(${p.id})" class="text-blue-500 text-xs hover:underline bg-blue-50 px-2 py-0.5 rounded">編集</button>
                                    <button onclick="deleteBasePrompt(${p.id})" class="text-red-500 text-xs hover:underline bg-red-50 px-2 py-0.5 rounded">削除</button>
                                </div>
                            </div>
                            <p class="text-[10px] text-gray-500 line-clamp-2 font-mono bg-gray-50 p-1.5 rounded border border-gray-100">${escapeHtml(p.prompt)}</p>
                        </div>
                    `).join('');
                }
            } catch (err) {
                console.error('ベースプロンプト一覧の取得に失敗:', err);
                document.getElementById('basePromptList').innerHTML = '<p class="text-red-500 text-xs text-center">読み込みエラー</p>';
            }
        }
        window.loadBasePrompts = loadBasePrompts;

        function editBasePrompt(id) {
            const p = currentBasePrompts.find(item => item.id === id);
            if (!p) return;
            document.getElementById('bp-id').value = p.id;
            document.getElementById('bp-label').value = p.label;
            document.getElementById('bp-content').value = p.prompt;
        }
        window.editBasePrompt = editBasePrompt;

        function resetBasePromptForm() {
            document.getElementById('bp-id').value = '';
            document.getElementById('bp-label').value = '';
            document.getElementById('bp-content').value = '';
        }
        window.resetBasePromptForm = resetBasePromptForm;

        async function saveBasePrompt() {
            const id = document.getElementById('bp-id').value;
            const label = document.getElementById('bp-label').value.trim();
            const prompt = document.getElementById('bp-content').value.trim();

            if (!label || !prompt) {
                alert('ラベルとプロンプトを入力してください');
                return;
            }

            try {
                const res = await adminApiRequest('/api/admin/base-prompts/save', {
                    id: id ? parseInt(id) : null,
                    label,
                    prompt
                });
                if (res.success) {
                    resetBasePromptForm();
                    loadBasePrompts();
                } else {
                    alert('エラー: ' + res.message);
                }
            } catch (e) {
                console.error(e);
                alert('保存失敗: ' + e.message);
            }
        }
        window.saveBasePrompt = saveBasePrompt;

        async function deleteBasePrompt(id) {
            if (!confirm('本当に削除しますか？')) return;
            try {
                const res = await adminApiRequest('/api/admin/base-prompts/delete', { id });
                if (res.success) {
                    loadBasePrompts();
                    if (document.getElementById('bp-id').value == id) {
                        resetBasePromptForm();
                    }
                }
            } catch (e) {
                console.error(e);
                alert('削除失敗');
            }
        }
        window.deleteBasePrompt = deleteBasePrompt;

        // 要件定義プロンプトを読み込み
        async function loadRequirementPrompt() {
            try {
                const data = await apiRequest('/api/issues/requirement-prompt');
                document.getElementById('requirementPrompt').value = data.prompt || '';
            } catch (err) {
                console.error('要件定義プロンプト取得エラー:', err);
            }
        }

        // 要件定義プロンプトを更新
        async function updateRequirementPrompt() {
            const prompt = document.getElementById('requirementPrompt').value.trim();

            try {
                const data = await adminApiRequest('/api/admin/update-requirement-prompt', { prompt });

                if (data.success) {
                    alert('要件定義プロンプトを更新しました！');
                } else {
                    alert('エラー: ' + (data.message || 'サーバーエラー'));
                }
            } catch (err) {
                console.error('更新エラー:', err);
                alert('更新に失敗しました');
            }
        }
        window.updateRequirementPrompt = updateRequirementPrompt;

        // ユーザー一覧を取得
        async function loadUsers() {
            try {
                const data = await adminApiRequest('/api/admin/users');

                if (data.users) {
                    const userList = document.getElementById('userList');
                    userList.innerHTML = data.users.map(user => {
                        const isSelf = user.id === currentUser.id;
                        const isActive = user.is_active !== 0;
                        const rowOpacity = isActive ? '' : 'opacity-50';
                        const nameStyle = isActive ? '' : 'line-through';
                        const statusDot = isActive
                            ? '<span class="w-2.5 h-2.5 rounded-full bg-green-400 flex-shrink-0"></span>'
                            : '<span class="w-2.5 h-2.5 rounded-full bg-red-400 flex-shrink-0"></span>';

                        const displayName = user.display_name || user.email || user.id;
                        const initials = displayName.substring(0, 2).toUpperCase();

                        const isAdmin = user.role === 'admin';
                        const adminBtnClass = isAdmin
                            ? 'bg-red-100 text-red-600 hover:bg-red-200'
                            : 'bg-gray-100 text-gray-500 hover:bg-blue-100 hover:text-blue-600';
                        const adminBtnText = isAdmin ? '管理者 ✓' : '一般';
                        const adminBtnDisabled = isSelf ? `disabled class="px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-600 cursor-not-allowed opacity-60"` : `onclick="toggleAdmin('${escapeHtml(user.id)}')" class="px-2 py-1 text-xs font-medium rounded cursor-pointer transition ${adminBtnClass}"`;

                        const activeBtnClass = isActive
                            ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-600'
                            : 'bg-red-100 text-red-600 hover:bg-green-100 hover:text-green-700';
                        const activeBtnText = isActive ? '有効' : '無効';
                        const activeBtnDisabled = isSelf ? `disabled class="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-700 cursor-not-allowed opacity-60"` : `onclick="toggleActive('${escapeHtml(user.id)}')" class="px-2 py-1 text-xs font-medium rounded cursor-pointer transition ${activeBtnClass}"`;

                        return `
                            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg ${rowOpacity}">
                                <div class="flex items-center gap-3">
                                    ${statusDot}
                                    <div class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold text-sm">
                                        ${escapeHtml(initials)}
                                    </div>
                                    <div>
                                        <p class="font-medium text-gray-900 ${nameStyle}">${escapeHtml(displayName)}${isSelf ? ' <span class="text-xs text-blue-500">(自分)</span>' : ''}</p>
                                        <p class="text-xs text-gray-500">登録: ${formatDate(user.created_at)}</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <button ${adminBtnDisabled}>${adminBtnText}</button>
                                    <button ${activeBtnDisabled}>${activeBtnText}</button>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            } catch (err) {
                console.error('ユーザー一覧の取得に失敗:', err);
            }
        }

        // 管理者権限の切り替え
        async function toggleAdmin(targetUserId) {
            const action = confirm('このユーザーの管理者権限を切り替えますか？');
            if (!action) return;

            try {
                const data = await adminApiRequest('/api/admin/users/toggle-role', {
                    target_user_id: targetUserId
                });
                if (data.success) {
                    alert(data.message);
                    loadUsers();
                } else {
                    alert('エラー: ' + (data.message || 'サーバーエラー'));
                }
            } catch (err) {
                console.error('管理者権限変更エラー:', err);
                alert('権限の変更に失敗しました');
            }
        }
        window.toggleAdmin = toggleAdmin;

        // ユーザー有効/無効の切り替え
        async function toggleActive(targetUserId) {
            const action = confirm('このユーザーの有効/無効を切り替えますか？\n無効化されたユーザーはログインできなくなります。');
            if (!action) return;

            try {
                const data = await adminApiRequest('/api/admin/users/toggle-active', {
                    target_user_id: targetUserId
                });
                if (data.success) {
                    alert(data.message);
                    loadUsers();
                } else {
                    alert('エラー: ' + (data.message || 'サーバーエラー'));
                }
            } catch (err) {
                console.error('ステータス変更エラー:', err);
                alert('ステータスの変更に失敗しました');
            }
        }
        window.toggleActive = toggleActive;

        // 最近の投稿を取得
        async function loadRecentActivity() {
            try {
                const data = await adminApiRequest('/api/admin/recent-activity');

                if (data.activities) {
                    const activityList = document.getElementById('recentActivity');
                    activityList.innerHTML = data.activities.map(activity => `
                        <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                            <div class="w-2 h-2 rounded-full bg-green-500 mt-2"></div>
                            <div class="flex-1">
                                <p class="text-sm text-gray-900">${escapeHtml(activity.title)}</p>
                                <p class="text-xs text-gray-500">${escapeHtml(activity.type)} by ${escapeHtml(activity.display_name || activity.user_name || '')} - ${formatDate(activity.created_at)}</p>
                            </div>
                        </div>
                    `).join('');
                }
            } catch (err) {
                console.error('最近の投稿の取得に失敗:', err);
            }
        }

        // 制約一覧を取得
        async function loadConstraints() {
            try {
                const data = await adminApiRequest('/api/admin/constraints/list');
                const list = document.getElementById('constraintList');
                if (Array.isArray(data)) {
                    list.innerHTML = data.map(c => `
                        <div class="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-100">
                            <span class="text-xs font-bold text-gray-500 w-20">${escapeHtml(c.category)}</span>
                            <span class="text-sm text-gray-800 flex-1 truncate px-2">${escapeHtml(c.content)}</span>
                            <button onclick="deleteConstraint(${c.id})" class="text-gray-400 hover:text-red-500 font-bold">×</button>
                        </div>
                    `).join('');
                }
            } catch (e) {
                console.error('Failed to load constraints:', e);
            }
        }
        window.loadConstraints = loadConstraints;

        // 制約を追加
        async function addConstraint() {
            const content = document.getElementById('newConstraintContent').value.trim();
            const category = document.getElementById('newConstraintCategory').value;
            if (!content) return;

            try {
                const res = await adminApiRequest('/api/admin/constraints', {
                    category, content
                });
                if (res.success) {
                    document.getElementById('newConstraintContent').value = '';
                    loadConstraints();
                }
            } catch (e) {
                console.error(e);
                alert('追加失敗: ' + e.message);
            }
        }
        window.addConstraint = addConstraint;

        // 制約を削除
        async function deleteConstraint(id) {
            if (!confirm('削除しますか？')) return;
            try {
                const res = await adminApiRequest('/api/admin/constraints/delete', {
                    id
                });
                if (res.success) loadConstraints();
            } catch (e) {
                console.error(e);
                alert('削除失敗: ' + e.message);
            }
        }
        window.deleteConstraint = deleteConstraint;

        // 初期化
        async function init() {
            const isAdmin = await checkAdminAccess();
            if (!isAdmin) return;
            loadStats();
            loadBasePrompts();
            loadRequirementPrompt();
            loadUsers();
            loadRecentActivity();
            loadConstraints();
        }

        init();