const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');
const http = require('http');
const url = require('url');
require('dotenv').config();

// 1. 初始化機器人與權限
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,    // 抓取全體成員關鍵
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences    // 偵測狀態關鍵
  ]
});

// 系統日誌緩存
let sysLogs = [];
const addLog = (msg) => {
  sysLogs.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`);
  if (sysLogs.length > 15) sysLogs.pop();
};

// 2. 定義斜線指令
const commands = [
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('清理頻道訊息')
    .addIntegerOption(o => o.setName('amount').setDescription('刪除數量(1-100)').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    
  new SlashCommandBuilder()
    .setName('user_info')
    .setDescription('獲取成員詳細管理資訊')
    .addUserOption(o => o.setName('target').setDescription('目標成員')),
    
  new SlashCommandBuilder()
    .setName('server_report')
    .setDescription('產出伺服器數據報告'),
    
  new SlashCommandBuilder()
    .setName('role_list')
    .setDescription('顯示所有身分組與人數清單'),
    
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

// 3. 啟動與指令部署
client.on('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    addLog("系統核心連線成功：功能已全數加載");
    console.log(`>>> 管理端 [${client.user.tag}] 已就緒`);
  } catch (err) {
    console.error('部署失敗:', err);
  }
});

// 4. 指令邏輯處理
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild, channel } = interaction;

  try {
    // 清理訊息
    if (commandName === 'clear') {
      const amount = options.getInteger('amount');
      await channel.bulkDelete(amount, true);
      await interaction.reply({ content: `✅ 已成功清理 ${amount} 則訊息。`, ephemeral: true });
      addLog(`清理訊息: ${channel.name} (${amount} 則)`);
    }

    // 成員資訊
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
      addLog(`查詢成員: ${user.tag}`);
    }

    // 伺服器報告 (修復超時問題)
    if (commandName === 'server_report') {
      await interaction.deferReply();
      const bots = guild.members.cache.filter(m => m.user.bot).size;
      const embed = new EmbedBuilder()
        .setTitle(`📊 ${guild.name} 核心報告`)
        .setColor(0x00FF41)
        .addFields(
          { name: '總成員', value: `${guild.memberCount} (真人: ${guild.memberCount - bots})`, inline: true },
          { name: '機器人', value: `${bots}`, inline: true },
          { name: '頻道總數', value: `${guild.channels.cache.size}`, inline: true }
        )
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      addLog(`生成伺服器報告`);
    }

    // 身分組清單
    if (commandName === 'role_list') {
      const roleText = guild.roles.cache.sort((a, b) => b.position - a.position).map(r => `• ${r.name} [${r.members.size}人]`).join('\n');
      const embed = new EmbedBuilder().setTitle("🏷️ 身分組清單").setDescription(roleText.slice(0, 2048)).setColor(0x00FF41);
      await interaction.reply({ embeds: [embed] });
    }

    // 緊急鎖定 (包含指定原因)
    if (commandName === 'channel_lock') {
      const everyone = guild.roles.everyone;
      const canSend = channel.permissionsFor(everyone).has(PermissionFlagsBits.SendMessages);

      if (canSend) {
        await channel.permissionOverwrites.edit(everyone, { SendMessages: false });
        const embed = new EmbedBuilder()
          .setTitle("🔒 頻道鎖定通知")
          .setDescription("**因為此頻道目前混亂，已暫時鎖定。**")
          .setColor(0xFF0000)
          .setTimestamp();
        await interaction.reply({ embeds: [embed] });
        addLog(`緊急鎖定頻道: ${channel.name}`);
      } else {
        await channel.permissionOverwrites.edit(everyone, { SendMessages: null });
        const embed = new EmbedBuilder()
          .setTitle("🔓 頻道解鎖通知")
          .setDescription("頻道已恢復正常，感謝大家配合。")
          .setColor(0x00FF41);
        await interaction.reply({ embeds: [embed] });
        addLog(`解鎖頻道: ${channel.name}`);
      }
    }

    // 封鎖處分
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

// 5. 專業管理面板網頁
const dashboardHTML = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8"><title>Polaris_Terminal_V5</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #000; color: #00FF41; font-family: 'Courier New', monospace; }
        .box { border: 1px solid #006400; background: rgba(0, 10, 0, 0.9); }
        .status-offline { color: #444; }
        .status-online { color: #00FF41; text-shadow: 0 0 5px #00FF41; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #00FF41; }
    </style>
</head>
<body class="p-4 md:p-8">
    <div class="max-w-6xl mx-auto space-y-6">
        <div class="flex justify-between items-end border-b border-green-900 pb-2 mb-8">
            <h1 class="text-xl font-bold tracking-widest uppercase">ADMIN_TERMINAL_PRO_V5</h1>
            <div id="ping" class="text-[10px] opacity-60 font-mono">LATENCY: -- MS</div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 space-y-6">
                <div class="box p-6 rounded shadow-lg">
                    <h2 class="text-xs opacity-50 mb-4 font-bold">// BROADCAST_SYSTEM_INIT</h2>
                    <select id="chSelect" class="w-full bg-black border border-green-900 p-2 mb-4 text-sm outline-none"></select>
                    <textarea id="bcInput" rows="6" class="w-full bg-black border border-green-900 p-3 text-sm outline-none" placeholder="輸入公告內容..."></textarea>
                    <button onclick="sendBC()" class="w-full mt-4 border border-green-500 hover:bg-green-500 hover:text-black py-2 transition font-bold uppercase text-xs">Execute_Broadcast</button>
                </div>
                <div class="box p-6 rounded">
                    <h2 class="text-xs opacity-50 mb-4 font-bold">// LIVE_SYSTEM_LOGS</h2>
                    <div id="logBox" class="text-[10px] space-y-1 h-32 overflow-y-auto"></div>
                </div>
            </div>

            <div class="box p-6 rounded h-[640px] flex flex-col">
                <h2 class="text-xs opacity-50 mb-4 font-bold">// FULL_MEMBER_DATABASE</h2>
                <div id="memList" class="space-y-2 overflow-y-auto flex-1 text-[10px]">正在索引成員數據...</div>
            </div>
        </div>
    </div>

    <script>
        async function refresh() {
            try {
                const res = await fetch('/api/data').then(r => r.json());
                document.getElementById('ping').innerText = 'LATENCY: ' + res.ping + ' MS';
                document.getElementById('chSelect').innerHTML = res.channels.map(c => \`<option value="\${c.id}"># \${c.name}</option>\`).join('');
                document.getElementById('logBox').innerHTML = res.logs.map(l => \`<div>\${l}</div>\`).join('');
                
                // 排序：在線優先
                const sorted = res.members.sort((a, b) => (a.status === 'offline' ? 1 : -1));
                
                document.getElementById('memList').innerHTML = sorted.map(m => \`
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
        setInterval(refresh, 10000); refresh();

        async function sendBC() {
            const ch = document.getElementById('chSelect').value;
            const msg = document.getElementById('bcInput').value;
            if(!msg) return;
            await fetch(\`/api/broadcast?ch=\${ch}&msg=\${encodeURIComponent(msg)}\`);
            document.getElementById('bcInput').value = '';
            alert('BROADCAST_COMPLETE');
            refresh();
        }
        async function ban(id) {
            if(!confirm('TERMINATE_USER_ACCESS_IMMEDIATELY?')) return;
            await fetch(\`/api/ban?id=\${id}\`);
            refresh();
        }
    </script>
</body>
</html>
`;

// 6. 後端 API 服務 (修正離線抓取邏輯)
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
      // 全體成員強行抓取
      const fetched = await guild.members.fetch({ withPresences: true });
      const channels = guild.channels.cache.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name }));
      const members = fetched.map(m => ({
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
      const embed = new EmbedBuilder().setTitle("📢 系統廣播").setDescription(msg).setColor(0x00FF41).setTimestamp();
      await channel.send({ embeds: [embed] });
      addLog(`廣播推送: #${channel.name}`);
      res.end('ok');
    } catch (e) { res.end('error'); }
  }

  if (reqUrl.pathname === '/api/ban') {
    const id = reqUrl.query.id;
    try {
      await guild.members.ban(id, { reason: 'REMOTE_TERMINAL_BAN' });
      addLog(`遠端執行封鎖: ID ${id}`);
      res.end('ok');
    } catch (e) { res.end('error'); }
  }
}).listen(process.env.PORT || 3000);

client.login(process.env.TOKEN);
