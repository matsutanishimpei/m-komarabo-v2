import { fetchAuthUser, apiRequest, escapeHtml, formatDate } from './js/common.js';

        let theme = 'komarabo';
        let currentUser = null;
        let originalName = '';

        // ========================================
        // Theme
        // ========================================

        const themes = {
            komarabo: {
                body: ['bg-cream', 'text-slate-800'],
                card: ['bg-white', 'border', 'border-slate-100', 'shadow-slate-200'],
                loading: ['bg-white', 'border', 'border-slate-100'],
                input: ['bg-gray-50', 'border', 'border-gray-200', 'focus:border-blue-400', 'focus:ring-2', 'focus:ring-blue-100', 'text-slate-800'],
                readonlyBg: ['bg-gray-50', 'border', 'border-gray-200'],
                infoBg: ['bg-gray-50', 'border', 'border-gray-200'],
                roleBadgeAdmin: ['bg-red-100', 'text-red-600'],
                roleBadgeUser: ['bg-blue-100', 'text-blue-600'],
                statusBadge: ['bg-green-100', 'text-green-600'],
                backUrl: '/komarabo/index.html',
                saveBtnClass: 'save-btn',
                isDark: false,
            },
            wakuwaku: {
                body: ['bg-slate-900', 'text-slate-100'],
                card: ['bg-slate-800', 'border', 'border-slate-700', 'shadow-slate-900'],
                loading: ['bg-slate-800', 'border', 'border-slate-700'],
                input: ['bg-slate-700', 'border', 'border-slate-600', 'focus:border-indigo-400', 'focus:ring-2', 'focus:ring-indigo-900', 'text-slate-100'],
                readonlyBg: ['bg-slate-700/50', 'border', 'border-slate-600'],
                infoBg: ['bg-slate-700/50', 'border', 'border-slate-600'],
                roleBadgeAdmin: ['bg-red-900/40', 'text-red-400'],
                roleBadgeUser: ['bg-indigo-900/40', 'text-indigo-400'],
                statusBadge: ['bg-green-900/40', 'text-green-400'],
                backUrl: '/wakuwaku/index.html',
                saveBtnClass: 'save-btn save-btn-dark',
                isDark: true,
            }
        };

        function getHash() {
            return window.location.hash.substring(1) || 'komarabo';
        }

        function applyTheme() {
            const hash = getHash();
            theme = hash === 'wakuwaku' ? 'wakuwaku' : 'komarabo';
            const t = themes[theme];
            const body = document.getElementById('body');
            const loading = document.getElementById('loadingCard');
            const card = document.getElementById('profileCard');

            body.className = 'min-h-screen flex items-center justify-center p-4 transition-colors duration-300';
            body.classList.add(...t.body);

            loading.className = 'w-full max-w-md p-8 rounded-2xl shadow-xl fade-in';
            loading.classList.add(...t.loading);

            card.className = 'w-full max-w-md p-8 rounded-2xl shadow-xl transition-all duration-300 transform hidden';
            card.classList.add(...t.card);

            // Input
            const input = document.getElementById('displayNameInput');
            input.className = 'w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 outline-none';
            input.classList.add(...t.input);

            // Read-only fields
            document.getElementById('emailDisplay').className = 'w-full px-4 py-3 rounded-xl text-sm opacity-60 flex items-center gap-2';
            document.getElementById('emailDisplay').classList.add(...t.readonlyBg);

            document.getElementById('accountInfo').className = 'rounded-xl overflow-hidden text-sm';
            document.getElementById('accountInfo').classList.add(...t.infoBg);

            // Info row hover
            const rows = document.querySelectorAll('.info-row');
            rows.forEach(r => {
                r.classList.toggle('info-row-dark', t.isDark);
            });

            // Avatar ring
            document.getElementById('avatarRing').classList.toggle('avatar-ring-dark', t.isDark);

            // Save button
            document.getElementById('saveBtn').className = `${t.saveBtnClass} w-full py-3.5 rounded-xl text-white font-bold text-sm`;

            // Loading skeletons
            document.querySelectorAll('.skeleton').forEach(el => {
                el.classList.toggle('skeleton-dark', t.isDark);
            });

            // Back link
            document.getElementById('backLink').href = t.backUrl;

            // Role badge
            if (currentUser) applyRoleBadge(t);
        }

        function applyRoleBadge(t) {
            const badge = document.getElementById('roleBadge');
            badge.className = 'role-badge inline-block px-3 py-0.5 rounded-full font-bold uppercase tracking-wider';
            if (currentUser.role === 'admin') {
                badge.classList.add(...t.roleBadgeAdmin);
                badge.textContent = 'Admin';
            } else {
                badge.classList.add(...t.roleBadgeUser);
                badge.textContent = 'Member';
            }

            const statusBadge = document.getElementById('statusBadge');
            statusBadge.className = 'text-xs font-semibold px-2 py-0.5 rounded-full';
            statusBadge.classList.add(...t.statusBadge);
            statusBadge.textContent = '有効';
        }

        // ========================================
        // Load Profile
        // ========================================

        async function loadProfile() {
            const user = await fetchAuthUser();
            if (!user) {
                location.href = `/login.html#${theme}`;
                return;
            }

            currentUser = user;

            // Get full profile info from /me (includes email, created_at)
            try {
                const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
                const data = await res.json();
                if (data.authenticated && data.user) {
                    currentUser = { ...currentUser, ...data.user };
                }
            } catch (e) { }

            originalName = currentUser.display_name || '';

            // Populate UI
            document.getElementById('headerName').textContent = currentUser.display_name || '未設定';
            document.getElementById('displayNameInput').value = currentUser.display_name || '';

            // Avatar
            if (currentUser.avatar_url) {
                document.getElementById('avatarImg').src = currentUser.avatar_url;
                document.getElementById('avatarImg').style.display = 'block';
                document.getElementById('avatarFallback').style.display = 'none';
            } else {
                document.getElementById('avatarImg').style.display = 'none';
                document.getElementById('avatarFallback').style.display = 'flex';
                const initials = (currentUser.display_name || '?').substring(0, 2).toUpperCase();
                document.getElementById('avatarFallback').textContent = initials;
            }

            // Email (might not be available from /me)
            document.getElementById('emailText').textContent = currentUser.email || 'Googleアカウント連携済み';

            // Status
            const statusBadge = document.getElementById('statusBadge');
            statusBadge.textContent = '有効';

            // Created at
            if (currentUser.created_at) {
                document.getElementById('createdAt').textContent = formatDate(currentUser.created_at);
            }

            // Apply theme with user data
            applyTheme();

            // Show card, hide loading
            document.getElementById('loadingCard').classList.add('hidden');
            document.getElementById('profileCard').classList.remove('hidden');
            document.getElementById('profileCard').classList.add('fade-in');
        }

        // ========================================
        // Save Profile
        // ========================================

        window.saveProfile = async function () {
            const nameInput = document.getElementById('displayNameInput');
            const name = nameInput.value.trim();

            if (!name) {
                showToast('表示名を入力してください', 'error');
                nameInput.focus();
                return;
            }

            if (name.length > 50) {
                showToast('表示名は50文字以内にしてください', 'error');
                return;
            }

            if (name === originalName) {
                showToast('変更がありません', 'info');
                return;
            }

            const btn = document.getElementById('saveBtn');
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = '保存中...';

            try {
                const data = await apiRequest('/api/auth/profile', {
                    method: 'POST',
                    body: JSON.stringify({ display_name: name }),
                });

                if (data.success) {
                    originalName = name;
                    document.getElementById('headerName').textContent = name;
                    showToast('プロフィールを更新しました ✓', 'success');
                } else {
                    showToast(data.message || '更新に失敗しました', 'error');
                }
            } catch (err) {
                showToast('通信エラーが発生しました', 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        };

        // ========================================
        // Logout
        // ========================================

        window.doLogout = async function () {
            try {
                await apiRequest('/api/auth/logout', { method: 'POST' });
            } catch (e) { }
            location.href = `/login.html#${theme}`;
        };

        // ========================================
        // Toast
        // ========================================

        function showToast(message, type = 'success') {
            const toast = document.getElementById('toast');
            const content = document.getElementById('toastContent');

            const colors = {
                success: 'bg-green-50 text-green-700 border border-green-200',
                error: 'bg-red-50 text-red-700 border border-red-200',
                info: 'bg-blue-50 text-blue-700 border border-blue-200',
            };

            const darkColors = {
                success: 'bg-green-900/40 text-green-300 border border-green-800',
                error: 'bg-red-900/40 text-red-300 border border-red-800',
                info: 'bg-indigo-900/40 text-indigo-300 border border-indigo-800',
            };

            const icons = {
                success: '✓',
                error: '✕',
                info: 'ℹ',
            };

            const isDark = theme === 'wakuwaku';
            const colorSet = isDark ? darkColors : colors;

            content.className = `px-5 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 toast ${colorSet[type]}`;
            content.innerHTML = `<span>${icons[type]}</span><span>${escapeHtml(message)}</span>`;

            toast.classList.remove('hidden');
            setTimeout(() => toast.classList.add('hidden'), 3000);
        }

        // ========================================
        // Init
        // ========================================

        window.addEventListener('hashchange', applyTheme);
        applyTheme();
        loadProfile();