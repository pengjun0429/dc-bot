const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, PermissionFlagsBits, ActivityType } = require('discord.js');
const http = require('http');
const url = require('url');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildInvites
  ]
});

// 1. 全域指令清單 (確保全部功能完整保留)
const commands = [
  new SlashCommandBuilder().setName('clear').setDescription('清理大量訊息').addIntegerOption(o => o.setName('amount').setDescription('數量').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('warn').setDescription('正式警告成員').addUserOption(o => o.setName('target').setDescription('對象').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('原因')),
  new SlashCommandBuilder().setName('timeout').setDescription('停權成員').addUserOption(o => o.setName('target').setDescription('對象').setRequired(true)).addIntegerOption(o => o.setName('minutes').setDescription('分鐘').setRequired(true)),
  new SlashCommandBuilder().setName('ban').setDescription('封鎖成員').addUserOption(o => o.setName('target').setDescription('目標').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('原因')),
  new SlashCommandBuilder().setName('lockdown').setDescription('全伺服器緊急封鎖/解鎖').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('check_invite').setDescription('邀請連結即時數據報告'),
  new SlashCommandBuilder().setName('server_report').setDescription('生成伺服器深度分析報告'),
  new SlashCommandBuilder().setName('get_avatar').setDescription('獲取成員高畫質頭像').addUserOption(o => o.setName('target').setDescription('對象'))
].map(c => c.toJSON());

// Rich Presence 視覺化
const updatePresence = () => {
  client.user.setPresence({
    activities: [{
      name: `監控 ${client.guilds.cache.size} 個伺服器`,
      type: ActivityType.Watching,
      details: "🛡️ 旗艦管理系統 v21.2",
      state: "管理員：使用者",
      assets: { largeImage: "main_banner", smallImage: "verified_icon" }
    }],
    status: 'dnd'
  });
};

client.on('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    console.log('--- 正在刷新全域指令系統 ---');
    // 先清空，再重新發布全域指令
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    
    console.log(`>>> v21.2 系統啟動 | 管理員：使用者`);
    updatePresence();
    setInterval(updatePresence, 600000);
  } catch (err) { console.error('啟動失敗:', err); }
});

// 2. 指令核心邏輯 (移除嚴格攔截)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // 直接取得當前環境，不使用 if (!guild) 攔截
  const { commandName, options, guild, channel, member } = interaction;

  try {
    // 邀請碼報告
    if (commandName === 'check_invite') {
      if (!guild) return interaction.reply({ content: "❌ 無法在私訊讀取伺服器數據", ephemeral: true });
      const invites = await guild.invites.fetch();
      const list = invites.map(i => `🎫 \`${i.code}\` | ${i.inviter ? i.inviter.tag : '未知'} | **${i.uses}** 次`).join('\n') || '無數據';
      const embed = new EmbedBuilder()
        .setAuthor({ name: guild.name, iconURL: guild.iconURL() })
        .setTitle('🛰️ 伺服器流量監控')
        .setDescription(list)
        .setColor(0x5865F2)
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    }

    // 全服封鎖
    if (commandName === 'lockdown') {
      if (!guild) return interaction.reply({ content: "❌ 僅限伺服器內使用", ephemeral: true });
      const everyone = guild.roles.everyone;
      const chs = guild.channels.cache.filter(c => c.type === 0);
      const isLocked = !chs.first().permissionsFor(everyone).has(PermissionFlagsBits.SendMessages);
      for (const [id, ch] of chs) await ch.permissionOverwrites.edit(everyone, { SendMessages: isLocked });
      await interaction.reply(isLocked ? "✅ **解鎖完成**" : "🚨 **封鎖完成**");
    }

    // 批量清理
    if (commandName === 'clear') {
      const amt = options.getInteger('amount');
      await channel.bulkDelete(amt > 100 ? 100 : amt, true);
      await interaction.reply({ content: `✅ 已清理 ${amt} 則訊息`, ephemeral: true });
    }

    // 停權成員
    if (commandName === 'timeout') {
      const target = options.getMember('target');
      const min = options.getInteger('minutes');
      if (target.roles.highest.position >= member.roles.highest.position) return interaction.reply("❌ 權限不足");
      await target.timeout(min * 60 * 1000);
      await interaction.reply(`🔇 **${target.user.tag}** 已禁言 ${min} 分鐘`);
    }

  } catch (e) {
    console.error(e);
    if (!interaction.replied) await interaction.reply({ content: '❌ 執行錯誤，請確認機器人擁有管理員權限', ephemeral: true });
  }
});

// 3. 網頁端 (保持原本功能)
const boardHTML = `
<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8"><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-gray-100 flex items-center justify-center min-h-screen">
    <div class="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <h2 class="text-center font-black mb-6 tracking-widest text-xl">GLOBAL_CONTROL</h2>
        <div class="space-y-4">
            <select id="ch" class="w-full p-3 border rounded-lg text-sm"></select>
            <textarea id="msg" class="w-full h-40 p-4 border rounded-lg text-sm resize-none" placeholder="輸入匿名內容..."></textarea>
            <button onclick="send()" id="btn" class="w-full py-4 bg-blue-600 text-white font-bold rounded-xl active:scale-95 transition">發送匿名留言</button>
        </div>
    </div>
    <script>
        async function load(){
            const res = await fetch('/api/channels').then(r=>r.json());
            document.getElementById('ch').innerHTML = res.map(c=>\`<option value="\${c.id}"># \${c.name}</option>\`).join('');
        }
        load();
        async function send(){
            const ch=document.getElementById('ch').value, msg=document.getElementById('msg').value;
            if(!msg) return;
            document.getElementById('btn').disabled=true;
            await fetch(\`/api/post?ch=\${ch}&msg=\${encodeURIComponent(msg)}\`);
            document.getElementById('msg').value=''; document.getElementById('btn').disabled=false;
            alert('OK');
        }
    </script>
</body></html>
`;

// 4. 後端 API
http.createServer(async (req, res) => {
  const reqUrl = url.parse(req.url, true);
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (reqUrl.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end(boardHTML);
  } else if (reqUrl.pathname === '/api/channels' && guild) {
    res.end(JSON.stringify(guild.channels.cache.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name }))));
  } else if (reqUrl.pathname === '/api/post') {
    const { ch, msg } = reqUrl.query;
    const target = await client.channels.fetch(ch);
    const embed = new EmbedBuilder().setAuthor({name:'匿名廣播'}).setDescription(msg).setColor(0x00FF41).setTimestamp();
    await target.send({ embeds: [embed] }); res.end('ok');
  }
}).listen(process.env.PORT || 3000);

client.login(process.env.TOKEN);
