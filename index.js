const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const http = require('http');
const url = require('url');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

// --- 控制面板 HTML ---
const dashboardHTML = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Polaris 高級控制面板</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-900 text-slate-100 min-h-screen p-4 flex flex-col items-center">
    <div class="max-w-4xl w-full space-y-6">
        <h1 class="text-3xl font-black text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            POLARIS ADMIN DASHBOARD
        </h1>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
                <h2 class="text-xl font-bold mb-4 text-blue-400">📢 快速發佈公告</h2>
                <p class="text-sm text-slate-400 mb-2">選擇目標頻道：</p>
                <select id="channelSelect" class="w-full bg-slate-900 border border-slate-600 rounded-lg p-2 mb-4 outline-none">
                    <option value="">載入頻道中...</option>
                </select>
                <textarea id="bcMsg" rows="3" class="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 outline-none" placeholder="輸入公告內容..."></textarea>
                <button onclick="sendBroadcast()" class="w-full mt-3 bg-blue-600 hover:bg-blue-500 p-2 rounded-lg font-bold transition">發送公告</button>
            </div>

            <div class="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
                <h2 class="text-xl font-bold mb-4 text-red-400">🚫 成員封鎖系統</h2>
                <p class="text-sm text-slate-400 mb-2">輸入成員名稱 (需完全符合或包含)：</p>
                <input id="userName" type="text" list="memberList" class="w-full bg-slate-900 border border-slate-600 rounded-lg p-2 mb-2 outline-none" placeholder="例如: 使用者#1234">
                <datalist id="memberList"></datalist>
                
                <p class="text-sm text-slate-400 mb-2">封鎖原因：</p>
                <input id="banReason" type="text" class="w-full bg-slate-900 border border-slate-600 rounded-lg p-2 mb-4 outline-none" placeholder="違規原因...">
                <button onclick="execBan()" class="w-full bg-red-600 hover:bg-red-500 p-2 rounded-lg font-bold transition">執行封鎖</button>
            </div>
        </div>
    </div>

    <script>
        // 初始載入資料
        async function loadData() {
            const data = await fetch('/api/init-data').then(r => r.json());
            
            // 填充頻道下拉選單
            const cSelect = document.getElementById('channelSelect');
            cSelect.innerHTML = data.channels.map(c => \`<option value="\${c.id}"># \${c.name}</option>\`).join('');

            // 填充成員自動完成清單
            const mList = document.getElementById('memberList');
            mList.innerHTML = data.members.map(m => \`<option value="\${m.tag}">\`).join('');
        }
        loadData();

        async function sendBroadcast() {
            const channelId = document.getElementById('channelSelect').value;
            const content = document.getElementById('bcMsg').value;
            if(!content) return alert('內容不能為空');
            const res = await fetch(\`/api/broadcast?content=\${encodeURIComponent(content)}&channelId=\${channelId}\`).then(r => r.text());
            if(res === 'ok') { alert('公告已發出'); document.getElementById('bcMsg').value = ''; }
        }

        async function execBan() {
            const name = document.getElementById('userName').value;
            const reason = document.getElementById('banReason').value;
            if(!name) return alert('請輸入名字');
            const res = await fetch(\`/api/ban?name=\${encodeURIComponent(name)}&reason=\${encodeURIComponent(reason)}\`).then(r => r.text());
            alert(res === 'banned' ? '已成功封鎖該成員' : '找不到該成員或權限不足');
        }
    </script>
</body>
</html>
`;

// --- 後端邏輯 ---
http.createServer(async (req, res) => {
    const reqUrl = url.parse(req.url, true);
    const guild = client.guilds.cache.get(process.env.GUILD_ID);

    if (reqUrl.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(dashboardHTML);
    }

    // 新增：獲取初始資料 API (頻道與成員)
    if (reqUrl.pathname === '/api/init-data') {
        if (!guild) return res.end('{}');
        
        // 只抓取文字頻道
        const channels = guild.channels.cache
            .filter(c => c.type === 0)
            .map(c => ({ id: c.id, name: c.name }));

        // 抓取快取中的成員 (Tag 名稱)
        const members = guild.members.cache.map(m => ({ tag: m.user.tag }));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ channels, members }));
    }

    if (reqUrl.pathname === '/api/broadcast') {
        const { content, channelId } = reqUrl.query;
        try {
            const channel = await client.channels.fetch(channelId);
            const embed = new EmbedBuilder().setTitle('📢 管理公告').setDescription(content).setColor(0x3B82F6).setTimestamp();
            await channel.send({ embeds: [embed] });
            res.end('ok');
        } catch (e) { res.end('error'); }
    }

    if (reqUrl.pathname === '/api/ban') {
        const { name, reason } = reqUrl.query;
        try {
            // 透過名稱搜尋成員
            const member = guild.members.cache.find(m => m.user.tag === name);
            if (member) {
                await member.ban({ reason: reason || '面板封鎖' });
                res.end('banned');
            } else {
                res.end('notfound');
            }
        } catch (e) { res.end('error'); }
    }

}).listen(process.env.PORT || 3000);

client.login(process.env.TOKEN);
