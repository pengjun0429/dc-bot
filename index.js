const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, PermissionFlagsBits, ActivityType } = require('discord.js');
const http = require('http');
const url = require('url');
require('dotenv').config();

// 核心初始化：確保所有必要的 Intent 都已開啟
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

// 1. 全域指令清單
const commands = [
  new SlashCommandBuilder().setName('clear').setDescription('批量清理訊息').addIntegerOption(o => o.setName('amount').setDescription('清理數量(1-100)').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('warn').setDescription('發送正式警告').addUserOption(o => o.setName('target').setDescription('目標').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('原因')),
  new SlashCommandBuilder().setName('timeout').setDescription('停權(禁言)成員').addUserOption(o => o.setName('target').setDescription('目標').setRequired(true)).addIntegerOption(o => o.setName('minutes').setDescription('時間(分鐘)').setRequired(true)),
  new SlashCommandBuilder().setName('ban').setDescription('封鎖成員').addUserOption(o => o.setName('target').setDescription('目標').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('原因')),
  new SlashCommandBuilder().setName('lockdown').setDescription('切換全伺服器鎖定狀態').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('check_invite').setDescription('查看當前伺服器邀請碼數據'),
  new SlashCommandBuilder().setName('server_report').setDescription('生成伺服器深度分析報告'),
  new SlashCommandBuilder().setName('get_avatar').setDescription('獲取成員頭像').addUserOption(o => o.setName('target').setDescription('對象'))
].map(c => c.toJSON());

// --- Rich Presence 視覺設置 (對應使用者提供的封面圖片) ---
const updatePresence = () => {
  const serverCount = client.guilds.cache.size;
  client.user.setPresence({
    activities: [{
      name: `管理 ${serverCount} 個伺服器`,
      type: ActivityType.Watching,
      details: "🛡️ 旗艦監控系統 v21.0",
      state: "管理員：使用者",
      assets: {
        largeImage: "main_banner", // 需在 Dev Portal 上傳對應 Key
        largeText: "Polaris Global System",
        smallImage: "verified_icon",
        smallText: "核心已授權"
      }
    }],
    status: 'dnd'
  });
};

client.on('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    // 全域發布指令 (移除 Guild ID，讓所有伺服器共用)
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log(`>>> v21.0 全域穩定版已就緒`);
    updatePresence();
    setInterval(updatePresence, 600000); 
  } catch (err) { console.error(err); }
});

// 2. 指令核心邏輯 (多伺服器相容模式)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, guild, channel, member } = interaction;

  // 修正：確保在其他伺服器中能正確抓到 guild 物件
  if (!guild) {
    return interaction.reply({ content: "❌ 為了安全起見，管理指令僅限在伺服器頻道內使用。", ephemeral: true });
  }

  try {
    // 邀請碼視覺報告 (動態適應當前伺服器)
    if (commandName === 'check_invite') {
      const invites = await guild.invites.fetch();
      const list = invites.map(i => `🎫 \`${i.code}\` | 來自: ${i.inviter ? i.inviter.tag : '未知'} | 次數: **${i.uses}**`).join('\n') || '無邀請碼紀錄';
      const embed = new EmbedBuilder()
        .setAuthor({ name: guild.name, iconURL: guild.iconURL() })
        .setTitle('🛰️ 伺服器流量監控')
        .setDescription(list)
        .setColor(0x5865F2)
        .setFooter({ text: `操作者：${interaction.user.tag}` })
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    }

    // 全服 Lockdown (動態權限覆蓋)
    if (commandName === 'lockdown') {
      const everyone = guild.roles.everyone;
      const textChannels = guild.channels.cache.filter(c => c.type === 0);
      const firstChannel = textChannels.first();
      const isCurrentlyLocked = !firstChannel.permissionsFor(everyone).has(PermissionFlagsBits.SendMessages);
      
      for (const [id, ch] of textChannels) {
        await ch.permissionOverwrites.edit(everyone, { SendMessages: isCurrentlyLocked });
      }
      await interaction.reply(isCurrentlyLocked ? "✅ **全伺服器已解除鎖定**" : "🚨 **全伺服器已進入封鎖模式**");
    }

    // 停權功能
    if (commandName === 'timeout') {
      const target = options.getMember('target');
      const min = options.getInteger('minutes');
      if (target.roles.highest.position >= member.roles.highest.position) return interaction.reply("❌ 你的權限不足以對該成員執行此操作。");
      await target.timeout(min * 60 * 1000);
      await interaction.reply(`🔇 已將 **${target.user.tag}** 禁言 ${min} 分鐘。`);
    }

    // 批量清理訊息
    if (commandName === 'clear') {
      const amt = options.getInteger('amount');
      await channel.bulkDelete(amt, true);
      await interaction.reply({ content: `✅ 已成功清理 ${amt} 則訊息。`, ephemeral: true });
    }

  } catch (e) {
    console.error(e);
    if (!interaction.replied) await interaction.reply({ content: '❌ 執行出錯，請確認機器人擁有管理員權限。', ephemeral: true });
  }
});

// 3. 網頁端 (保持原本功能)
const boardHTML = `
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><title>匿名看板 V21</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-gray-100 flex items-center justify-center min-h-screen">
    <div class="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200">
        <h2 class="text-center font-black text-gray-800 text-xl mb-6 tracking-widest uppercase">Global_Control</h2>
        <div class="space-y-4">
            <select id="ch" class="w-full p-3 bg-gray-50 border border-gray-100 rounded-lg text-sm outline-none"></select>
            <textarea id="msg" maxlength="500" class="w-full h-40 p-4 bg-gray-50 border border-gray-100 rounded-lg text-sm outline-none resize-none" placeholder="輸入訊息..."></textarea>
            <button onclick="send()" id="btn" class="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all">發送匿名訊息</button>
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
            const btn=document.getElementById('btn'); btn.disabled=true;
            await fetch(\`/api/post?ch=\${ch}&msg=\${encodeURIComponent(msg)}\`);
            document.getElementById('msg').value=''; btn.disabled=false;
            alert('OK');
        }
    </script>
</body>
</html>
`;

// 4. 後端 API
http.createServer(async (req, res) => {
  const reqUrl = url.parse(req.url, true);
  const guild = client.guilds.cache.get(process.env.GUILD_ID);

  if (reqUrl.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end(boardHTML);
  } else if (reqUrl.pathname === '/api/channels' && guild) {
    const list = guild.channels.cache.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name }));
    res.end(JSON.stringify(list));
  } else if (reqUrl.pathname === '/api/post') {
    const { ch, msg } = reqUrl.query;
    const target = await client.channels.fetch(ch);
    const embed = new EmbedBuilder().setAuthor({name:'匿名系統'}).setDescription(msg).setColor(0x00FF41).setTimestamp();
    await target.send({ embeds: [embed] }); res.end('ok');
  }
}).listen(process.env.PORT || 3000);

client.login(process.env.TOKEN);
