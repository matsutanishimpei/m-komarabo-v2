import fs from 'fs';
import path from 'path';

const htmlFiles = [
    { html: 'public/komarabo/index.html', js: 'public/js/komarabo-index.js', htmlPrefix: '../js/komarabo-index.js' },
    { html: 'public/komarabo/detail.html', js: 'public/js/komarabo-detail.js', htmlPrefix: '../js/komarabo-detail.js' },
    { html: 'public/wakuwaku/post.html', js: 'public/js/wakuwaku-post.js', htmlPrefix: '../js/wakuwaku-post.js' },
    { html: 'public/wakuwaku/edit.html', js: 'public/js/wakuwaku-edit.js', htmlPrefix: '../js/wakuwaku-edit.js' },
    { html: 'public/wakuwaku/detail.html', js: 'public/js/wakuwaku-detail.js', htmlPrefix: '../js/wakuwaku-detail.js' },
    { html: 'public/admin/index.html', js: 'public/js/admin-index.js', htmlPrefix: '../js/admin-index.js' },
    { html: 'public/profile.html', js: 'public/js/profile.js', htmlPrefix: 'js/profile.js' }
];

for (const file of htmlFiles) {
    const htmlPath = path.resolve(process.cwd(), file.html);
    const jsPath = path.resolve(process.cwd(), file.js);

    if (!fs.existsSync(htmlPath)) continue;

    let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

    // <script type="module"> の中身を抽出
    const scriptRegex = /<script type="module">([\s\S]*?)<\/script>/i;
    const match = htmlContent.match(scriptRegex);

    if (match && match[1]) {
        let scriptContent = match[1].trim();

        // 抽出したコードをJSファイルに保存
        fs.writeFileSync(jsPath, scriptContent, 'utf-8');

        // HTML側の script タグを src 参照に変更
        const replaceString = `<script type="module" src="${file.htmlPrefix}"></script>`;
        htmlContent = htmlContent.replace(scriptRegex, replaceString);

        fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
        console.log(`Extracted JS from ${file.html} to ${file.js}`);
    }
}
