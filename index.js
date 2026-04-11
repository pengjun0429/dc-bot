const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const http = require('http');
const url = require('url');
require('dotenv').config();

// --- 機器人設定 ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// --- 控制面板網頁內容 (HTML) ---
const dashboardHTML = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Polaris 控制面板</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-900 text-slate-100 min-h-screen flex items-center justify-center p-4">
    <div class="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <div class="bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-700">
            <h2 class="text-2xl font-bold mb-4 flex items-center">
                <span class="bg-green-500 w-3 h-3 rounded-full mr-3 animate-pulse"></span>
                機器人狀態
            </h2>
            <div class="space-y-4">
                <div class="bg-slate-700/50 p-4 rounded-lg">
                    <p class="text-slate-400 text-sm">當前伺服器</p>
                    <p id="guildName" class="text-xl font-mono">載入中...</p>
                </div>
                <div class="bg-slate-700/50 p-4 rounded-lg">
                    <p class="text-slate-400 text-sm">連線延遲 (Ping)</p>
                    <p id="ping" class="text-xl font-mono">-- ms</p>
                </div>
            </div>
        </div>

        <div class="bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-700">
            <h2 class="text-2xl font-bold mb-4 text-blue-400">遠端廣播系統</h2>
            <textarea id="bcMsg" rows="3" class="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="輸入要發布的公告內容..."></textarea>
            <button onclick="sendBroadcast()" class="w-full mt-3 bg-blue-600 hover:bg-blue-500 transition p-2 rounded-lg font-bold">發送至公告頻道</button>
        </div>

        <div class="md:col-span-2 bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-700">
            <h2 class="text-2xl font-bold mb-4 text-red-400">高級管理工具</h2>
            <div class="flex flex-col md:flex-row gap-4">
                <input id="banId" type="text" class="flex-1 bg-slate-900 border border-slate-600 rounded-lg p-3 outline-none" placeholder="使用者 ID">
                <input id="banReason" type="text" class="flex-1 bg-slate-900 border border-slate-600 rounded-lg p-3 outline-none" placeholder="封鎖原因">
                <button onclick="execBan()" class="bg-red-600 hover:bg-red-500 transition px-8 py-3 rounded-lg font-bold text-white">執行一鍵封鎖</button>
            </div>
        </div>
    </div>

    <script>
        // 定期更新狀態
        async function updateStatus() {
            const res = await fetch('/api/status').then(r => r.json());
            document.getElementById('guildName').innerText = res.guildName;
            document.getElementById('ping').innerText = res.ping + ' ms';
        }
        setInterval(updateStatus, 5000);
        updateStatus();

        async function sendBroadcast() {
            const content = document.getElementById('bcMsg').value;
            if(!content) return alert('請輸入內容');
            await fetch('/api/broadcast?content=' + encodeURIComponent(content));
            alert('廣播已發送！');
            document.getElementById('bcMsg').value = '';
        }

        async function execBan() {
            const id = document.getElementById('banId').value;
            const reason = document.getElementById('banReason').value;
            if(!id) return alert('請輸入 ID');
            const res = await fetch(\`/api/ban?id=\${id}&reason=\${encodeURIComponent(reason)}\`).then(r => r.text());
            alert(res === 'banned' ? '成員已成功封鎖' : '封鎖失敗，請檢查權限');
        }
    </script>
</body>
</html>
`;

// --- 後端 Web Server 邏輯 ---
http.createServer(async (req, res) => {
    const reqUrl = url.parse(req.url, true);

    // 路由 1: 面板首頁
    if (reqUrl.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(dashboardHTML);
    }

    // 路由 2: 獲取狀態 API
    if (reqUrl.pathname === '/api/status') {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            guildName: guild ? guild.name : '未找到伺服器',
            ping: client.ws.ping
        }));
    }

    // 路由 3: 廣播 API
    if (reqUrl.pathname === '/api/broadcast') {
        const content = reqUrl.query.content;
        const channel = client.channels.cache.get(process.env.ANNOUNCE_CHANNEL_ID);
        if (channel && content) {
            const embed = new EmbedBuilder()
                .setTitle('📢 管理員公告')
                .setDescription(content)
                .setColor(0x3B82F6)
                .setTimestamp();
            await channel.send({ embeds: [embed] });
        }
        res.end('ok');
    }

    // 路由 4: 封鎖 API
    if (reqUrl.pathname === '/api/ban') {
        const { id, reason } = reqUrl.query;
        try {
            const guild = client.guilds.cache.get(process.env.GUILD_ID);
            await guild.members.ban(id, { reason: reason || '透過控制面板封鎖' });
            res.end('banned');
        } catch (e) {
            res.end('error');
        }
    }

}).listen(process.env.PORT || 3000);

client.login(process.env.TOKEN);
