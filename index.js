const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');
const http = require('http');
const url = require('url');
require('dotenv').config();

// 1. 初始化機器人：加入關鍵的 Intents 以抓取成員名單
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,    // 抓取離線成員必備
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences    // 偵測在線狀態必備
  ]
});

// 系統日誌緩存
let sysLogs = [];
const addLog = (msg) => {
  sysLogs.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`);
  if (sysLogs.length > 15) sysLogs.pop();
};

// 2. 指令定義
const commands = [
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('清理頻道訊息')
    .addIntegerOption(o => o.setName('amount').setDescription('數量(1-100)').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    
  new SlashCommandBuilder()
    .setName('user_info')
    .setDescription('獲取成員詳細管理資訊')
    .addUserOption(o => o.setName('target').setDescription('目標成員')),
    
  new SlashCommandBuilder()
    .setName('server_report')
    .setDescription('產出伺服器數據報告'),
    
  new SlashCommandBuilder()
    .setName('channel_lock')
    .setDescription('切換頻道鎖定狀態(含警示訊息)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('執行封鎖處分')
    .addUserOption(o => o.setName('target').setDescription('目標').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('封鎖原因'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
].map(c => c.toJSON());

// 3. 機器人啟動與指令部署
client.on('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    addLog("系統核心啟動：指令與成員索引已就緒");
    console.log(`>>> 管理端 [${client.user.tag}] 已連線`);
  } catch (err) {
    console.error('部署失敗:', err);
  }
});

// 4. 指令邏輯處理
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild, channel } = interaction;

  try {
    if (commandName === 'clear') {
      const amount = options.getInteger('amount');
      await channel.bulkDelete(amount, true);
      await interaction.reply({ content: `✅ 已清理 ${amount} 則訊息。`, ephemeral: true });
      addLog(`清理訊息: ${channel.name} (${amount} 則)`);
    }

    if (commandName === 'user_info') {
      const user = options.getUser('target') || interaction.user;
      const member = guild.members.cache.get(user.id);
      const roles = member.roles.cache.filter(r => r.name !== '@everyone').map(r => r.name).join(', ') || '無身分組';
      const embed = new EmbedBuilder()
        .setTitle(`👤 成員檔案：${user.tag}`)
        .setColor(0x00FF41)
        .addFields(
          { name: '使用者 ID', value: `\`${user.id}\``, inline: false },
          { name: '加入時間', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`, inline: false },
          { name: '身分組', value: roles }
        );
      await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'server_report') {
      await interaction.deferReply();
      const bots = guild.members.cache.filter(m => m.user.bot).size;
      const embed = new EmbedBuilder()
        .setTitle(`📊 ${guild.name} 核心報告`)
        .setColor(0x00FF41)
        .addFields(
          { name: '總成員', value: `${guild.memberCount}`, inline: true },
          { name: '機器人', value: `${bots}`, inline: true },
          { name: '頻道數', value: `${guild.channels.cache.size}`, inline: true }
        );
      await interaction.editReply({ embeds: [embed] });
      addLog(`生成伺服器報告`);
    }

    if (commandName === 'channel_lock') {
      const everyone = guild.roles.everyone;
      const isLocked = !channel.permissionsFor(everyone).has(PermissionFlagsBits.SendMessages);

      if (!isLocked) {
        await channel.permissionOverwrites.edit(everyone, { SendMessages: false });
        const embed = new EmbedBuilder()
          .setTitle("🔒 頻道鎖定")
          .setDescription("**因為此頻道目前混亂，已暫時鎖定。**")
          .setColor(0xFF0000);
        await interaction.reply({ embeds: [embed] });
        addLog(`緊急鎖定: ${channel.name}`);
      } else {
        await channel.permissionOverwrites.edit(everyone, { SendMessages: null });
        await interaction.reply("🔓 頻道已恢復正常，感謝大家配合。");
        addLog(`解鎖頻道: ${channel.name}`);
      }
    }

    if (commandName === 'ban') {
      const target = options.getUser('target');
      const reason = options.getString('reason') || '管理者執行封鎖';
      await guild.members.ban(target, { reason });
      await interaction.reply(`🚫 已封鎖 **${target.tag}**。原因: ${reason}`);
      addLog(`指令封鎖: ${target.tag}`);
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied) await interaction.reply({ content: '❌ 執行失敗，請檢查權限。', ephemeral: true });
  }
});

// 5. 專業管理終端 (HTML)
const dashboardHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8"><title>POLARIS_TERMINAL</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #000; color: #00FF41; font-family: 'Courier New', monospace; }
        .box { border: 1px solid #006400; background: rgba(0, 10, 0, 0.9); }
        .status-offline { color: #444; }
        .status-online { color: #00FF41; text-shadow: 0 0 5px #00FF41; }
    </style>
</head>
<body class="p-4 md:p-8">
    <div class="max-w-6xl mx-auto space-y-6">
        <div class="flex justify-between items-end border-b border-green-900 pb-2">
            <h1 class="text-xl font-bold tracking-widest">SYSTEM_TERMINAL_V4.2</h1>
            <div id="ping" class="text-[10px] opacity-60">LATENCY: -- MS</div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 space-y-6">
                <div class="box p-6 rounded shadow-lg">
                    <h2 class="text-xs opacity-50 mb-4 font-bold">// COMMAND_INPUT</h2>
                    <select id="chSelect" class="w-full bg-black border border-green-900 p-2 mb-4 text-sm outline-none"></select>
                    <textarea id="bcInput" rows="6" class="w-full bg-black border border-green-900 p-3 text-sm outline-none" placeholder="輸入公告內容..."></textarea>
                    <button onclick="sendBC()" class="w-full mt-4 border border-green-500 hover:bg-green-500 hover:text-black py-2 transition font-bold uppercase">Execute_Payload</button>
                </div>
                <div class="box p-6 rounded">
                    <h2 class="text-xs opacity-50 mb-4 font-bold">// REALTIME_LOGS</h2>
                    <div id="logBox" class="text-[10px] space-y-1 h-32 overflow-y-auto"></div>
                </div>
            </div>

            <div class="box p-6 rounded h-[640px] flex flex-col">
                <h2 class="text-xs opacity-50 mb-4 font-bold">// MEMBER_DATABASE (TOTAL_FETCH)</h2>
                <div id="memList" class="space-y-2 overflow-y-auto flex-1 text-[10px]">載入數據中...</div>
            </div>
        </div>
    </div>

    <script>
        async function update() {
            try {
                const res = await fetch('/api/data').then(r => r.json());
                document.getElementById('ping').innerText = 'LATENCY: ' + res.ping + ' MS';
                document.getElementById('chSelect').innerHTML = res.channels.map(c => \`<option value="\${c.id}"># \${c.name}</option>\`).join('');
                document.getElementById('logBox').innerHTML = res.logs.map(l => \`<div>\${l}</div>\`).join('');
                
                // 排序：在線者優先
                const sortedMembers = res.members.sort((a, b) => (a.status === 'offline' ? 1 : -1));
                
                document.getElementById('memList').innerHTML = sortedMembers.map(m => \`
                    <div class="flex justify-between items-center border-b border-green-900/30 py-2">
                        <div class="flex flex-col truncate">
                            <span class="font-bold">\${m.tag}</span>
                            <span class="text-[8px] \${m.status === 'offline' ? 'status-offline' : 'status-online'}">[\${m.status.toUpperCase()}]</span>
                        </div>
                        <button onclick="ban('\${m.id}')" class="text-red-500 border border-red-900 px-1 hover:bg-red-900 hover:text-white transition uppercase text-[9px]">Ban</button>
                    </div>
                \`).join('');
            } catch(e) {}
        }
        setInterval(update, 10000); update();

        async function sendBC() {
            const ch = document.getElementById('chSelect').value;
            const msg = document.getElementById('bcInput').value;
            if(!msg) return;
            await fetch(\`/api/broadcast?ch=\${ch}&msg=\${encodeURIComponent(msg)}\`);
            document.getElementById('bcInput').value = '';
            update();
        }
        async function ban(id) {
            if(!confirm('TERMINATE_USER_ACCESS?')) return;
            await fetch(\`/api/ban?id=\${id}\`);
            update();
        }
    </script>
</body>
</html>
`;

// 6. 後端 API (修復全體抓取邏輯)
http.createServer(async (req, res) => {
  const reqUrl = url.parse(req.url, true);
  const guild = client.guilds.cache.get(process.env.GUILD_ID);

  if (reqUrl.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(dashboardHTML);
  }

  if (reqUrl.pathname === '/api/data') {
    if (!guild) return res.end("{}");
    
    try {
      // 強制抓取所有成員，確保離線者出現在名單中
      const fetchedMembers = await guild.members.fetch({ withPresences: true });
      const channels = guild.channels.cache.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name }));
      const members = fetchedMembers.map(m => ({
        tag: m.user.tag,
        id: m.user.id,
        status: m.presence ? m.presence.status : 'offline'
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ping: client.ws.ping, channels, members, logs: sysLogs }));
    } catch (e) { res.end("{}"); }
  }

  if (reqUrl.pathname === '/api/broadcast') {
    const { ch, msg } = reqUrl.query;
    try {
      const channel = await client.channels.fetch(ch);
      const embed = new EmbedBuilder().setDescription(msg).setColor(0x00FF41).setTimestamp();
      await channel.send({ embeds: [embed] });
      addLog(`廣播推送至 #${channel.name}`);
      res.end('ok');
    } catch (e) { res.end('error'); }
  }

  if (reqUrl.pathname === '/api/ban') {
    const id = reqUrl.query.id;
    try {
      await guild.members.ban(id, { reason: 'REMOTE_TERMINAL_BAN' });
      addLog(`遠端封鎖執行: ID ${id}`);
      res.end('ok');
    } catch (e) { res.end('error'); }
  }
}).listen(process.env.PORT || 3000);

client.login(process.env.TOKEN);
