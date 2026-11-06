require('dotenv').config();
const crypto = require('crypto');

process.on('uncaughtException', (err) => console.error('🚨 UNCAUGHT EXCEPTION:', err?.message || err));
process.on('unhandledRejection', (err) => console.error('🚨 UNHANDLED REJECTION:', err?.message || err));

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, downloadMediaMessage } = require('@whiskeysockets/baileys');
const Groq = require('groq-sdk');
const express = require('express');
const axios = require('axios');
const pino = require('pino');
const fs = require('fs');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.status(200).send('Bot Lapak Siqinz Railway 24/7 Active!'));
app.get('/health', (req, res) => res.status(200).json({ status: 'UP', uptime: process.uptime() }));

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server HTTP Express standby di port ${PORT}`));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const VIP_API_ID = process.env.VIP_API_ID;
const VIP_API_KEY = process.env.VIP_API_KEY;

// 👑 PENGATURAN NOMOR EKSPLISIT
const NOMOR_BOT = '6283878322624';          // Nomor WhatsApp Bot
const NOMOR_ADMIN = '6283142628969';        // Nomor Khusus Admin

function getVipSign() {
    if (process.env.VIP_SIGN) {
        return process.env.VIP_SIGN;
    }
    return crypto.createHash('md5').update(VIP_API_ID + VIP_API_KEY).digest('hex');
}

const chatHistories = {};     
const msgRetryCounterCache = new NodeCache();
let isBotActive = true; 

async function startBot() {
    // 💡 FOLDER SESI DIGANTI BIAR FRESH DAN NGGAK NYANGKUT!
    const { state, saveCreds } = await useMultiFileAuthState('sesi_bot_baru');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'), 
        msgRetryCounterCache,
        connectTimeoutMs: 60000,      
        defaultQueryTimeoutMs: 60000, 
        keepAliveIntervalMs: 10000,   
        syncFullHistory: false        
    });

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(NOMOR_BOT);
                // Bikin format kodenya rapi ada stripnya (XXXX-XXXX)
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log('\n==================================================');
                console.log(`🔥 KODE PAIRING LU BRE: ${code}`);
                console.log('==================================================\n');
            } catch (err) {
                console.log('\n❌ GAGAL MINTA KODE PAIRING:', err.message);
                console.log('Kalau error "rate-overlimit", artinya lu terlalu sering minta kode. Tunggu 5-10 menit ya bre!\n');
            }
        }, 5000); // Waktu tunggu dipanjangin dikit biar koneksi stabil dulu
    }

    sock.ev.on('creds.update', async () => { try { await saveCreds(); } catch (e) {} });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error)?.output?.statusCode;
            console.log(`⚠️ Koneksi terputus. Kode status: ${statusCode}. Menyambungkan ulang...`);
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
                try { if (fs.existsSync('sesi_bot_baru')) fs.rmSync('sesi_bot_baru', { recursive: true, force: true }); } catch (e) {}
                setTimeout(startBot, 2000);
            } else {
                setTimeout(startBot, 3000);
            }
        } else if (connection === 'open') {
            console.log('🎉 BOT BERHASIL TERTAUT DAN AMAN DI RAILWAY!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg || !msg.message) return;

        const senderJid = msg.key.remoteJid;
        
        // 🚨 1. HARAM HUKUMNYA BALAS CHAT DARI GRUP
        if (!senderJid || senderJid.endsWith('@g.us') || senderJid === 'status@broadcast') return;

        const senderNumber = senderJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
        const isFromMe = msg.key.fromMe;
        const isSelfChat = senderNumber === NOMOR_BOT || senderJid.includes(NOMOR_BOT);

        // 🚨 2. BENTENG MUTLAK ANTI-NIMBRUNG
        if (isFromMe && !isSelfChat) {
            return; 
        }

        const isAdmin = senderNumber === NOMOR_ADMIN || senderNumber === NOMOR_BOT || isSelfChat;

        let messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '';
        if (!messageContent.trim() && !msg.message.imageMessage) return;

        const isImage = msg.message.imageMessage ? true : false;
        const textLower = messageContent.toLowerCase();

        // 1. MENU UTAMA UMUM
        if (textLower === 'menu' || textLower === '!menu') {
            let menuText = `*🎮 SELAMAT DATANG DI LAPAK SIQINZ 🎮*\n_Pusat Top Up Game Termurah & Terpercaya_\n\n` +
                           `*📋 MENU PELANGGAN:*\n➤ *!game* (Daftar Game)\n➤ *!format* (Cara Order)\n➤ *!admin* (Hubungi Owner)\n\n`;
            
            if (isAdmin) {
                menuText += `*👑 PANEL KHUSUS ADMIN:*\n` +
                            `Status AI: 🟢 ALWAYS ON (Otomatis)\n` +
                            `➤ *!ceksaldo*\n` +
                            `➤ *!proses <kode> <id>* (Tembak Manual)\n`;
            }
            await sock.sendMessage(senderJid, { text: menuText }, { quoted: msg });
            return;
        }

        if (textLower === '!game') {
            await sock.sendMessage(senderJid, { text: `*🎮 DAFTAR GAME*\n1. *Mobile Legends (ML)*\n2. *Free Fire (FF)*\nKetik *!format* untuk lanjut order.` }, { quoted: msg }); return;
        }
        if (textLower === '!format') {
            await sock.sendMessage(senderJid, { text: `*🛒 FORMAT ORDER*\nGame:\nID Player & Server:\nNominal Order:\n\n_Kirim bukti transfer ke rekening: 083142628969 (a.n Muhamad Sodikin)_` }, { quoted: msg }); return;
        }
        if (textLower === '!admin') {
            await sock.sendMessage(senderJid, { text: `📞 *Kontak Owner:* Muhamad Sodikin` }, { quoted: msg }); return;
        }

        // 2. API VIP RESELLER MANUAL (HANYA BISA DIAKSES ADMIN)
        if (textLower === '!ceksaldo') {
            if (!isAdmin) return;
            await sock.sendMessage(senderJid, { text: '⏳ Mengecek saldo ke server VIP Reseller...' }, { quoted: msg });
            try {
                const finalSign = getVipSign();
                const payload = new URLSearchParams({ key: VIP_API_KEY, sign: finalSign });
                const res = await axios.post('https://vip-reseller.co.id/api/profile', payload, {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });
                await sock.sendMessage(senderJid, { text: `📊 *Hasil Cek Saldo VIP:*\n\n${JSON.stringify(res.data, null, 2)}` }, { quoted: msg });
            } catch (e) {
                await sock.sendMessage(senderJid, { text: `❌ Gagal konek VIP: ${e.message}` }, { quoted: msg });
            }
            return;
        }
        
        if (textLower.startsWith('!proses')) {
            if (!isAdmin) return;
            const parts = messageContent.split(' ').filter(Boolean);
            if (parts.length < 3) return;
            await sock.sendMessage(senderJid, { text: `⏳ Memproses pesanan *${parts[1]}* ke VIP Reseller...` }, { quoted: msg });
            try {
                const finalSign = getVipSign();
                const payload = new URLSearchParams({
                    key: VIP_API_KEY,
                    sign: finalSign,
                    type: 'order',
                    service: parts[1],
                    data_no: parts[2]
                });
                const res = await axios.post('https://vip-reseller.co.id/api/game-feature', payload, {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });
                await sock.sendMessage(senderJid, { text: `📋 *Respon API VIP:*\n${JSON.stringify(res.data, null, 2)}` }, { quoted: msg });
            } catch (e) {
                await sock.sendMessage(senderJid, { text: `❌ Gagal eksekusi transaksi: ${e.message}` }, { quoted: msg });
            }
            return;
        }

        // 3. PROSES AI (SELALU AKTIF, OTOMATIS CERDAS)
        if (!messageContent.startsWith('!')) {
            try {
                if (!chatHistories[senderJid]) {
                    chatHistories[senderJid] = [];
                }

                // AI SATU OTAK
                const systemPrompt = `Lu adalah Muhamad Sodikin, pemilik "Lapak Siqinz". Lu punya 2 mode yang jalan otomatis:
1. JIKA ORANG CUMA NGOBROL BIASA: Lu balas santai, ramah, agak lucu, adaptif bahasa (kalo dia Sunda, balas Sunda; kalo Indo, balas Indo). Balasan WAJIB SINGKAT 5-10 kata aja.
2. JIKA ORANG KIRIM GAMBAR/STRUK/FORMAT ORDER: Lu langsung berubah jadi Admin Top-Up Profesional. Analisis teliti bukti transfernya: PASTIKAN rekening tujuan HARUS KE 083142628969 atas nama MUHAMAD SODIKIN.
   - Kalau bukti VALID/ASLI, balas ramah dan lu WAJIB kasih format ini di akhir pesan: [AUTO_ORDER:KODE_LAYANAN|ID_TUJUAN] (Contoh: [AUTO_ORDER:ml5|1234567(1234)]).
   - Kalau palsu/kurang, tolak tegas tanpa format AUTO_ORDER.
3. INGAT RIWAYAT: Selalu ingat chat sebelumnya dengan user ini.
4. JANGAN PERNAH CHAT KE GRUP.`;

                let groqMessages = [
                    { role: "system", content: systemPrompt },
                    ...chatHistories[senderJid]
                ];

                if (isImage) {
                    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                    const base64Image = buffer.toString('base64');
                    groqMessages.push({
                        role: "user",
                        content: [
                            { type: "text", text: messageContent || "Tolong cek bukti transfer dan orderan saya bre." },
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                        ]
                    });
                } else {
                    groqMessages.push({ role: "user", content: messageContent });
                }

                const chatCompletion = await groq.chat.completions.create({
                    messages: groqMessages, 
                    model: "qwen/qwen3.8-27b", 
                    temperature: 0.7,
                });
                
                let responseText = chatCompletion.choices[0]?.message?.content || '';
                
                if (responseText) {
                    const autoOrderMatch = responseText.match(/\[AUTO_ORDER:(.*?)\|(.*?)\]/);
                    
                    if (autoOrderMatch) {
                        const serviceCode = autoOrderMatch[1].trim();
                        const targetDataNo = autoOrderMatch[2].trim();

                        let cleanResponse = responseText.replace(/\[AUTO_ORDER:.*?\]/g, '').trim();
                        cleanResponse += `\n\n✅ *Bukti TF Valid! Sistem otomatis menembak pesanan ke VIP Reseller...*`;
                        await sock.sendMessage(senderJid, { text: cleanResponse }, { quoted: msg });

                        try {
                            const finalSign = getVipSign();
                            const payload = new URLSearchParams({
                                key: VIP_API_KEY,
                                sign: finalSign,
                                type: 'order',
                                service: serviceCode,
                                data_no: targetDataNo
                            });

                            const vipRes = await axios.post('https://vip-reseller.co.id/api/game-feature', payload, {
                                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                            });

                            await sock.sendMessage(senderJid, { text: `🚀 *Status Transaksi VIP Reseller:*\n\n${JSON.stringify(vipRes.data, null, 2)}` });
                        } catch (vipErr) {
                            await sock.sendMessage(senderJid, { text: `❌ Gagal otomatis nembak ke VIP Reseller: ${vipErr.message}` });
                        }
                    } else {
                        await sock.sendMessage(senderJid, { text: responseText }, { quoted: msg });
                    }

                    chatHistories[senderJid].push({ role: "user", content: messageContent });
                    chatHistories[senderJid].push({ role: "assistant", content: responseText });
                    if (chatHistories[senderJid].length > 10) {
                        chatHistories[senderJid].splice(0, 2); 
                    }
                }
            } catch (err) {
                console.error('❌ Groq Error:', err?.message || err);
                await sock.sendMessage(senderJid, { text: 'Waduh puyeng, kirim ulang bre!' }, { quoted: msg });
            }
        }
    });
}

startBot();
