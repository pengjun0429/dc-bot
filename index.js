const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');
const http = require('http');
const url = require('url');
require('dotenv').config();

// 權限設定：務必在 Discord Portal 開啟對應開關
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// --- 指令定義 (管理導向) ---
const commands = [
  new SlashCommandBuilder().setName('clear').setDescription('清理訊息').addIntegerOption(o => o.setName('amount').setDescription('數量(1-100)').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('user_info').setDescription('獲取成員詳細資料').addUserOption(o => o.setName('target').setDescription('目標成員')),
  new SlashCommandBuilder().setName('server_report').setDescription('查看伺服器數據概況')
].map(c => c.toJSON());

// --- 機器人事件 ---
client.on('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
    console.log(`>>> 系統核心 [${client.user.tag}] 已啟動`);
  } catch (err) { console.error('指令註冊失敗:', err); }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild } = interaction;

  try {
    if (commandName === 'clear') {
      const amount = options.getInteger('amount');
      await interaction.channel.bulkDelete(amount, true);
      await interaction.reply({ content: `✅ 頻道已清理 ${amount} 條訊息。`, ephemeral: true });
    }
    if (commandName === 'user_info') {
      const user = options.getUser('target') || interaction.user;
      const member = guild.members.cache.get(user.id);
      const embed = new EmbedBuilder()
        .setTitle(`👤 成員分析: ${user.tag}`)
        .setColor(0x00FF00)
        .addFields(
          { name: 'ID', value: `\`${user.id}\``, inline: true },
          { name: '加入日', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:d>`, inline: true }
        );
      await interaction.reply({ embeds: [embed] });
    }
  } catch (err) { console.error('指令執行出錯:', err); }
});

// --- 網頁管理控制面板 (終端風格) ---
const dashboardHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8"><title>Polaris Terminal</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background-color: #050505; color: #00FF41; font-family: 'Courier New', monospace; }
        .terminal-box { border: 1px solid #00FF41; box-shadow: 0 0 10px #00FF4155; }
        select, textarea, input { background: #000 !important; border: 1px solid #00FF41 !important; color: #00FF41 !important; }
    </style>
</head>
<body class="p-4 md:p-10">
    <div class="max-w-5xl mx-auto space-y-6">
        <div class="flex justify-between items-center border-b border-green-900 pb-2">
            <h1 class="text-xl font-bold tracking-tighter">ADMIN_TERMINAL_V3.0</h1>
            <div id="ping" class="text-xs">SYSTEM_LATENCY: -- MS</div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="md:col-span-2 terminal-box p-6 rounded">
                <h3 class="text-sm mb-4">// BROADCAST_INIT</h3>
                <label class="text-[10px] opacity-50">TARGET_CHANNEL</label>
                <select id="ch" class="w-full p-2 mb-4 text-sm"></select>
                <label class="text-[10px] opacity-50">MESSAGE_PAYLOAD</label>
                <textarea id="msg" rows="4" class="w-full p-2 text-sm" placeholder="ENTER MESSAGE..."></textarea>
                <button onclick="send()" class="w-full mt-4 border border-green-500 hover:bg-green-500 hover:text-black transition py-2 text-sm font-bold">EXECUTE_BROADCAST</button>
            </div>

            <div class="terminal-box p-6 rounded overflow-y-auto max-h-[400px]">
                <h3 class="text-sm mb-4">// MEMBER_LIST</h3>
                <div id="list" class="space-y-2">LOADING...</div>
            </div>
        </div>
    </div>
    <script>
        async function load() {
            try {
                const d = await fetch('/api/data').then(r => r.json());
                document.getElementById('ping').innerText = 'LATENCY: ' + d.ping + ' MS';
                document.getElementById('ch').innerHTML = d.channels.map(c => \`<option value="\${c.id}"># \${c.name}</option>\`).join('');
                document.getElementById('list').innerHTML = d.members.map(m => \`
                    <div class="flex justify-between items-center border-b border-green-900 py-2">
                        <span class="text-[10px] truncate">\${m.tag}</span>
                        <button onclick="ban('\${m.id}')" class="text-[9px] border border-red-500 text-red-500 px-1 hover:bg-red-500 hover:text-black">BAN</button>
                    </div>
                \`).join('');
            } catch(e) {}
        }
        setInterval(load, 10000); load();

        async function send() {
            const ch = document.getElementById('ch').value;
            const msg = document.getElementById('msg').value;
            if(!msg) return;
            await fetch(\`/api/broadcast?ch=\${ch}&msg=\${encodeURIComponent(msg)}\`);
            alert('BROADCAST_COMPLETE');
            document.getElementById('msg').value = '';
        }
        async function ban(id) {
            if(!confirm('CONFIRM_TERMINATION?')) return;
            await fetch(\`/api/ban?id=\${id}\`);
            load();
        }
    </script>
</body>
</html>
`;

// --- 後端 API 服務 ---
http.createServer(async (req, res) => {
  const reqUrl = url.parse(req.url, true);
  const guild = client.guilds.cache.get(process.env.GUILD_ID);

  // 跨域處理
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (reqUrl.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(dashboardHTML);
  }

  if (reqUrl.pathname === '/api/data') {
    if (!guild) return res.end(JSON.stringify({ ping: 0, channels: [], members: [] }));
    const channels = guild.channels.cache.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name }));
    const members = guild.members.cache.map(m => ({ tag: m.user.tag, id: m.user.id }));
    res.end(JSON.stringify({ ping: client.ws.ping, channels, members }));
  }

  if (reqUrl.pathname === '/api/broadcast') {
    const { ch, msg } = reqUrl.query;
    try {
      const channel = await client.channels.fetch(ch);
      const embed = new EmbedBuilder().setDescription(msg).setColor(0x00FF00);
      await channel.send({ embeds: [embed] });
      res.end('ok');
    } catch(e) { res.end('error'); }
  }

  if (reqUrl.pathname === '/api/ban') {
    const id = reqUrl.query.id;
    try {
      await guild.members.ban(id, { reason: 'REMOTE_TERMINAL_EXECUTION' });
      res.end('ok');
    } catch(e) { res.end('error'); }
  }
}).listen(process.env.PORT || 3000);

client.login(process.env.TOKEN);
