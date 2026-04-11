const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,    // 必須開啟
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent   // 必須開啟
  ]
});

const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');
const http = require('http');
const url = require('url');
require('dotenv').config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- 1. 管理導向指令集 ---
const commands = [
  new SlashCommandBuilder().setName('clear').setDescription('清理頻道訊息').addIntegerOption(o => o.setName('amount').setDescription('刪除數量(1-100)').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('user_info').setDescription('獲取成員詳細管理資訊').addUserOption(o => o.setName('target').setDescription('目標成員')),
  new SlashCommandBuilder().setName('server_report').setDescription('生成伺服器數據報告')
].map(c => c.toJSON());

// --- 2. 機器人事件 ---
client.on('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
  console.log(`[系統通知] 專業管理機器人已上線`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild } = interaction;

  if (commandName === 'clear') {
    const amount = options.getInteger('amount');
    await interaction.channel.bulkDelete(amount, true);
    await interaction.reply({ content: `✅ 已清理 ${amount} 則訊息。`, ephemeral: true });
  }

  if (commandName === 'user_info') {
    const user = options.getUser('target') || interaction.user;
    const member = guild.members.cache.get(user.id);
    const roles = member.roles.cache.filter(r => r.name !== '@everyone').map(r => r.name).join(', ') || '無身分組';
    
    const embed = new EmbedBuilder()
      .setTitle(`📋 成員檔案：${user.tag}`)
      .setColor(0x2B2D31)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: '使用者 ID', value: \`\`\`\${user.id}\`\`\`, inline: false },
        { name: '加入時間', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`, inline: false },
        { name: '持有身分組', value: roles }
      );
    await interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'server_report') {
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${guild.name} 數據報告`)
      .setColor(0x5865F2)
      .addFields(
        { name: '成員總數', value: `${guild.memberCount}`, inline: true },
        { name: '身分組數', value: `${guild.roles.cache.size}`, inline: true },
        { name: '建立於', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:d>`, inline: true }
      );
    await interaction.reply({ embeds: [embed] });
  }
});

// --- 3. 網頁後台 (移除所有遊戲元素) ---
const dashboardHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8"><title>管理終端</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-200 p-8 font-mono">
    <div class="max-w-6xl mx-auto space-y-6">
        <div class="flex justify-between items-end border-b border-slate-800 pb-4">
            <div>
                <h1 class="text-2xl font-bold tracking-widest text-white">ADMIN TERMINAL</h1>
                <p class="text-xs text-slate-500">System Version 2.4.0_Stable</p>
            </div>
            <div id="ping" class="text-green-500 text-sm">-- MS</div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 bg-slate-900 border border-slate-800 p-6 rounded-lg">
                <h3 class="text-slate-400 text-xs mb-4 uppercase">Broadcast Interface</h3>
                <select id="ch" class="w-full bg-slate-950 border border-slate-700 p-2 rounded mb-4"></select>
                <textarea id="msg" rows="5" class="w-full bg-slate-950 border border-slate-700 p-4 rounded text-sm" placeholder="輸入公告內容..."></textarea>
                <button onclick="send()" class="w-full mt-4 bg-slate-200 text-black py-2 rounded font-bold hover:bg-white transition">執行廣播</button>
            </div>

            <div class="bg-slate-900 border border-slate-800 p-6 rounded-lg">
                <h3 class="text-slate-400 text-xs mb-4 uppercase">Member Management</h3>
                <div id="list" class="space-y-2 h-[350px] overflow-y-auto pr-2">載入中...</div>
            </div>
        </div>
    </div>
    <script>
        async function load() {
            const d = await fetch('/api/data').then(r => r.json());
            document.getElementById('ping').innerText = d.ping + ' MS';
            document.getElementById('ch').innerHTML = d.channels.map(c => \`<option value="\${c.id}"># \${c.name}</option>\`).join('');
            document.getElementById('list').innerHTML = d.members.map(m => \`
                <div class="flex justify-between items-center bg-slate-950 p-3 border border-slate-800 rounded">
                    <span class="text-xs truncate">\${m.tag}</span>
                    <button onclick="ban('\${m.id}')" class="text-[10px] border border-red-900 text-red-500 px-2 py-1 hover:bg-red-950 transition">BAN</button>
                </div>
            \`).join('');
        }
        setInterval(load, 15000); load();

        async function send() {
            const ch = document.getElementById('ch').value;
            const msg = document.getElementById('msg').value;
            if(!msg) return;
            await fetch(\`/api/broadcast?ch=\${ch}&msg=\${encodeURIComponent(msg)}\`);
            alert('系統公告已發佈');
            document.getElementById('msg').value = '';
        }
        async function ban(id) {
            if(!confirm('確認執行封鎖指令？')) return;
            await fetch(\`/api/ban?id=\${id}\`);
            load();
        }
    </script>
</body>
</html>
`;

// --- 4. 後端 API ---
http.createServer(async (req, res) => {
  const reqUrl = url.parse(req.url, true);
  const guild = client.guilds.cache.get(process.env.GUILD_ID);

  if (reqUrl.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(dashboardHTML);
  }

  if (reqUrl.pathname === '/api/data') {
    const channels = guild.channels.cache.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name }));
    const members = guild.members.cache.map(m => ({ tag: m.user.tag, id: m.user.id }));
    res.end(JSON.stringify({ ping: client.ws.ping, channels, members }));
  }

  if (reqUrl.pathname === '/api/broadcast') {
    const { ch, msg } = reqUrl.query;
    const channel = await client.channels.fetch(ch);
    const embed = new EmbedBuilder().setTitle('📢 系統公告').setDescription(msg).setColor(0x2B2D31).setTimestamp();
    await channel.send({ embeds: [embed] });
    res.end('ok');
  }

  if (reqUrl.pathname === '/api/ban') {
    const id = reqUrl.query.id;
    await guild.members.ban(id, { reason: '管理終端遠端執行' });
    res.end('ok');
  }
}).listen(process.env.PORT || 3000);

client.login(process.env.TOKEN);
