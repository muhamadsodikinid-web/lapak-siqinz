const axios = require('axios');
const crypto = require('crypto');
const Groq = require('groq-sdk');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const VIP_API_ID = process.env.VIP_API_ID;
const VIP_API_KEY = process.env.VIP_API_KEY;

const NOMOR_BOT = '6283878322624';          
const NOMOR_ADMIN = '6283142628969';        
const BIAYA_ADMIN = 3000;                   
const chatHistories = {};

function getVipSign() {
    if (process.env.VIP_SIGN) return process.env.VIP_SIGN;
    return crypto.createHash('md5').update(VIP_API_ID + VIP_API_KEY).digest('hex');
}

// INI FORMAT EKSPOR SUPAYA BISA DIPANGGIL SAMA INDEX.JS
module.exports = async (sock, msg) => {
    const senderJid = msg.key.remoteJid;
    if (!senderJid || senderJid.endsWith('@g.us') || senderJid === 'status@broadcast') return;

    const senderNumber = senderJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
    const isFromMe = msg.key.fromMe;
    const isSelfChat = senderNumber === NOMOR_BOT || senderJid.includes(NOMOR_BOT);

    if (isFromMe && !isSelfChat) return; 

    const isAdmin = senderNumber === NOMOR_ADMIN || senderNumber === NOMOR_BOT || isSelfChat;
    let messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '';
    if (!messageContent.trim() && !msg.message.imageMessage) return;

    const isImage = msg.message.imageMessage ? true : false;
    const textLower = messageContent.toLowerCase();

    // 1. BLOK MENU & INFO
    if (textLower === 'menu' || textLower === '!menu') {
        let menuText = `*🎮 LAPAK SIQINZ 🎮*\n_Pusat Top Up Game Termurah_\n\n` +
                       `➤ *!price*\n➤ *!format*\n➤ *!admin*\n\n`;
        if (isAdmin) menuText += `*👑 ADMIN:*\n➤ *!ceksaldo*\n➤ *!proses <kode> <id>*\n`;
        await sock.sendMessage(senderJid, { text: menuText }, { quoted: msg });
        return;
    }

    if (textLower === '!price' || textLower === '!list') {
        await sock.sendMessage(senderJid, { text: '⏳ Mengambil daftar harga resmi...' }, { quoted: msg });
        try {
            const payload = new URLSearchParams({ key: VIP_API_KEY, sign: getVipSign(), type: 'services' });
            const res = await axios.post('https://vip-reseller.co.id/api/game-feature', payload);
            
            if (res.data?.data) {
                let textList = `*🔥 HARGA LAPAK SIQINZ (+Admin Rp 3rb) 🔥*\n\n`;
                res.data.data.slice(0, 10).forEach((s, index) => {
                    let hargaJual = parseInt(s.price) + BIAYA_ADMIN;
                    textList += `${index + 1}. *${s.name}*\n   Kode: \`${s.code}\` | Rp ${hargaJual.toLocaleString('id-ID')}\n\n`;
                });
                await sock.sendMessage(senderJid, { text: textList });
            }
        } catch (e) {
            await sock.sendMessage(senderJid, { text: `❌ Gagal memuat API: ${e.message}` });
        }
        return;
    }

    if (textLower === '!format') {
        await sock.sendMessage(senderJid, { text: `*🛒 FORMAT ORDER*\nKode Layanan:\nID Player & Server:\n\n_Transfer ke rek: 083142628969 (a.n Muhamad Sodikin)_` }); return;
    }
    if (textLower === '!admin') {
        await sock.sendMessage(senderJid, { text: `📞 *Kontak:* Muhamad Sodikin` }); return;
    }
    if (textLower === '!ceksaldo' && isAdmin) {
        try {
            const payload = new URLSearchParams({ key: VIP_API_KEY, sign: getVipSign() });
            const res = await axios.post('https://vip-reseller.co.id/api/profile', payload);
            await sock.sendMessage(senderJid, { text: `📊 *Saldo VIP:*\n${JSON.stringify(res.data, null, 2)}` });
        } catch (e) {}
        return;
    }

    // 2. BLOK GROQ AI
    if (!messageContent.startsWith('!')) {
        try {
            if (!chatHistories[senderJid]) chatHistories[senderJid] = [];
            const systemPrompt = `Lu adalah Muhamad Sodikin, pemilik "Lapak Siqinz". 
Balas santai, ramah, Sunda/Indo, singkat 5-10 kata.
Jika ada bukti TF valid ke rek 083142628969 a.n MUHAMAD SODIKIN (termasuk admin Rp 3.000), kasih format [AUTO_ORDER:KODE_LAYANAN|ID_TUJUAN].`;

            let groqMessages = [{ role: "system", content: systemPrompt }, ...chatHistories[senderJid]];

            if (isImage) {
                const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                groqMessages.push({
                    role: "user",
                    content: [
                        { type: "text", text: messageContent || "Cek transfer." },
                        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${buffer.toString('base64')}` } }
                    ]
                });
            } else {
                groqMessages.push({ role: "user", content: messageContent });
            }

            const chatCompletion = await groq.chat.completions.create({
                messages: groqMessages, 
                model: "qwen/qwen3.8-27b", 
                temperature: 0.7,
                max_tokens: 250 
            });
            
            let responseText = chatCompletion.choices[0]?.message?.content || '';
            if (responseText) {
                const autoOrderMatch = responseText.match(/\[AUTO_ORDER:(.*?)\|(.*?)\]/);
                if (autoOrderMatch) {
                    const sCode = autoOrderMatch[1].trim();
                    const tID = autoOrderMatch[2].trim();
                    let cleanRes = responseText.replace(/\[AUTO_ORDER:.*?\]/g, '').trim() + `\n\n✅ *Bukti TF Valid! Menembak ke VIP...*`;
                    await sock.sendMessage(senderJid, { text: cleanRes }, { quoted: msg });

                    try {
                        const payload = new URLSearchParams({ key: VIP_API_KEY, sign: getVipSign(), type: 'order', service: sCode, data_no: tID });
                        const vipRes = await axios.post('https://vip-reseller.co.id/api/game-feature', payload);
                        await sock.sendMessage(senderJid, { text: `🚀 *Status VIP:*\n\n${JSON.stringify(vipRes.data, null, 2)}` });
                    } catch (err) {}
                } else {
                    await sock.sendMessage(senderJid, { text: responseText }, { quoted: msg });
                }

                chatHistories[senderJid].push({ role: "user", content: messageContent });
                chatHistories[senderJid].push({ role: "assistant", content: responseText });
                if (chatHistories[senderJid].length > 6) chatHistories[senderJid].splice(0, 2);
            }
        } catch (err) {}
    }
};
