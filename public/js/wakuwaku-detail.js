import { escapeHtml, fetchAuthUser, apiRequest } from '../js/common.js';
        import { injectWakuwakuBackground } from '../js/theme.js';
        injectWakuwakuBackground();

        const urlParams = new URLSearchParams(window.location.search);
        const productId = urlParams.get('id');

        let currentUser = null;

        async function loadProduct() {
            // 認証は任意（ログインしてなくても詳細は見れる想定）
            currentUser = await fetchAuthUser();

            if (!productId) {
                document.getElementById('productDetail').innerHTML = `
                    <div class="text-center py-20">
                        <p class="text-slate-400">プロダクトIDが指定されていません</p>
                    </div>
                `;
                return;
            }

            try {
                const product = await apiRequest(`/api/wakuwaku/product/${productId}`);

                const sealedDate = new Date(product.sealed_at || product.created_at);
                const isOwner = currentUser && product.creator_user_id === currentUser.id;

                const protocol = product.protocol_log || product.initial_prompt_log || 'No protocol data';
                const dialogue = product.dialogue_log;
                const catchCopy = product.catch_copy;
                const creatorName = product.creator_name || 'Unknown';

                document.getElementById('productDetail').innerHTML = `
                    <!-- Product Header -->
                    <div class="mb-10">
                        <div class="flex items-start justify-between mb-4">
                            <div class="flex-1">
                                <div class="flex items-center gap-3 mb-2">
                                    <h2 class="text-4xl font-semibold text-white tracking-tight">${escapeHtml(product.title)}</h2>
                                    ${product.status === 'draft' ? '<span class="px-2 py-0.5 bg-amber-500/20 text-amber-500 text-xs rounded border border-amber-500/30">下書き</span>' : ''}
                                </div>
                                ${catchCopy ? `<p class="text-xl text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400 font-serif italic mb-4">"${escapeHtml(catchCopy)}"</p>` : ''}
                                <div class="flex items-center gap-4 text-sm text-slate-400">
                                    <span>作成者: ${escapeHtml(creatorName)}</span>
                                    <span>•</span>
                                    <span>封印日: ${product.sealed_at ? sealedDate.toLocaleDateString('ja-JP') : '未封印'}</span>
                                </div>
                            </div>
                            ${isOwner && product.status === 'draft' ? `
                                <a href="index.html" class="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition flex items-center gap-2">
                                    編集画面へ
                                </a>
                            ` : ''}
                        </div>
                        ${product.url ? `
                            <a href="${escapeHtml(product.url)}" target="_blank" class="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded-lg hover:bg-blue-600/30 transition">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                                </svg>
                                プロダクトを開く
                            </a>
                        ` : ''}
                    </div>

                    <!-- こだわりポイント / Memo -->
                    ${product.dev_obsession ? `
                        <div class="mb-10">
                            <h3 class="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">こだわり (Memo)</h3>
                            <div class="bg-slate-900/50 border border-slate-700/50 rounded-xl p-6">
                                <p class="text-slate-300 leading-relaxed whitespace-pre-wrap font-mono text-sm">${escapeHtml(product.dev_obsession)}</p>
                            </div>
                        </div>
                    ` : ''}

                    <!-- Protocol (Specification) -->
                    <div class="mb-10">
                         <div class="flex items-center gap-3 mb-4">
                            <h3 class="text-2xl font-semibold text-white">仕様書 (Protocol)</h3>
                            ${product.status === 'published' ? `
                            <span class="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-medium rounded-md border border-emerald-500/20 flex items-center gap-1">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                                封印済み
                            </span>` : ''}
                        </div>
                        <div class="bg-slate-950 border border-slate-700 rounded-xl p-6 relative overflow-hidden group">
                             <pre class="mono text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">${escapeHtml(protocol)}</pre>
                        </div>
                    </div>

                    <!-- Dialogue Log -->
                    ${dialogue ? `
                        <div class="mb-10">
                            <h3 class="text-2xl font-semibold text-white mb-4">対話ログ (Dialogue Log)</h3>
                            <div class="bg-slate-950 border border-slate-700 rounded-xl p-6 relative overflow-hidden">
                                <pre class="mono text-xs text-slate-400 whitespace-pre-wrap leading-relaxed">${escapeHtml(dialogue)}</pre>
                            </div>
                        </div>
                    ` : ''}
                `;
            } catch (err) {
                console.error(err);
                document.getElementById('productDetail').innerHTML = `
                    <div class="text-center py-20">
                        <p class="text-red-400">${err.message || 'プロダクトの読み込みに失敗しました'}</p>
                    </div>
                `;
            }
        }

        loadProduct();