/**
 * Theme Management Utility
 */

/**
 * Injects the unified Wakuwaku background into the page.
 * This should be called on pages that use the Wakuwaku theme.
 */
export function injectWakuwakuBackground() {
    // Check if background already exists
    if (document.getElementById('wakuwaku-bg')) return;

    const bgDiv = document.createElement('div');
    bgDiv.id = 'wakuwaku-bg';
    bgDiv.className = 'fixed inset-0 z-[-1] pointer-events-none';
    bgDiv.innerHTML = `
        <img src="images/wakuwaku_card.png" alt="" class="w-full h-full object-cover opacity-20 mix-blend-overlay">
        <div class="absolute inset-0 bg-gradient-to-b from-slate-900/60 via-slate-900/80 to-slate-900"></div>
    `;

    document.body.prepend(bgDiv);
}
