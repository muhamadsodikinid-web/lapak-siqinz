require('dotenv').config();

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
const VIP_API_KEY = process.env.VIP_API_KEY;
const VIP_SIGN = process.env.VIP_SIGN;
const NOMOR_BOT = '6283878322624'; 

let isAiActive = false;
const msgRetryCounterCache = new NodeCache();

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
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
                const code = await sock.requestPairingCode(NOMOR_BOT);
                console.log('\n==================================================');
                console.log(`🔥 KODE PAIRING LU BRE: ${code}`);
                console.log('==================================================\n');
            } catch (err) {}
        }, 8000);
    }

    sock.ev.on('creds.update', async () => { try { await saveCreds(); } catch (e) {} });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error)?.output?.statusCode;
            console.log(`⚠️ Koneksi terputus. Kode status: ${statusCode}. Menyambungkan ulang...`);
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
                try { if (fs.existsSync('auth_session')) fs.rmSync('auth_session', { recursive: true, force: true }); } catch (e) {}
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
        
        // 🚨 JANGAN PERNAH BALAS CHAT DARI GRUP!
        if (!senderJid || senderJid.endsWith('@g.us') || senderJid === 'status@broadcast') return;

        const senderNumber = senderJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
        const isAdmin = senderNumber === NOMOR_BOT || msg.key.fromMe;

        let messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '';
        if (!messageContent.trim() && !msg.message.imageMessage) return;

        const isImage = msg.message.imageMessage ? true : false;
        const textLower = messageContent.toLowerCase();

        // 1. MENU UTAMA
        if (textLower === 'menu' || textLower === '!menu') {
            let menuText = `*🎮 SELAMAT DATANG DI LAPAK SIQINZ 🎮*\n_Pusat Top Up Game Termurah & Terpercaya_\n\n` +
                           `*📋 MENU PELANGGAN:*\n➤ *!game* (Daftar Game)\n➤ *!format* (Cara Order)\n➤ *!admin* (Hubungi Owner)\n\n`;
            
            if (isAdmin) {
                menuText += `*👑 PANEL KHUSUS OWNER:*\nStatus AI: ${isAiActive ? '✅ NYALA' : '❌ MATI'}\n` +
                            `➤ *!on-ai* (Nyalakan AI)\n➤ *!off-ai* (Matikan AI)\n➤ *!ceksaldo* (Cek VIP)\n➤ *!proses <kode> <id>* (Tembak Order)\n`;
            }
            await sock.sendMessage(senderJid, { text: menuText }, { quoted: msg });
            return;
        }

        if (textLower === '!game') {
            await sock.sendMessage(senderJid, { text: `*🎮 DAFTAR GAME*\n1. *Mobile Legends (ML)*\n2. *Free Fire (FF)*\nKetik *!format* untuk lanjut order.` }, { quoted: msg }); return;
        }
        if (textLower === '!format') {
            await sock.sendMessage(senderJid, { text: `*🛒 FORMAT ORDER*\nGame:\nID Player:\nNominal Order:\n\n_Kirim bukti transfer ke sini._` }, { quoted: msg }); return;
        }
        // FIXED: Diperbaiki dari !admin menjadi isAdmin / pemanggilan teks biasa
        if (textLower === '!admin') {
            await sock.sendMessage(senderJid, { text: `📞 *Kontak Owner:* Muhamad Sodikin` }, { quoted: msg }); return;
        }

        // 2. SAKLAR AI
        if (textLower === '!on-ai') {
            if (!isAdmin) {
                await sock.sendMessage(senderJid, { text: '⚠️ Lu bukan admin, bre!' }, { quoted: msg });
                return;
            }
            isAiActive = true;
            await sock.sendMessage(senderJid, { text: '🤖 *Mode AI Aktif!* Siap layani pembeli.' }, { quoted: msg });
            return;
        }
        
        if (textLower === '!off-ai') {
            if (!isAdmin) return;
            isAiActive = false;
            await sock.sendMessage(senderJid, { text: '💤 *Mode AI Dimatikan!*' }, { quoted: msg });
            return;
        }

        // 3. API VIP RESELLER (FIXED CONNECTION)
        if (textLower === '!ceksaldo') {
            if (!isAdmin) return;
            await sock.sendMessage(senderJid, { text: '⏳ Cek saldo VIP...' }, { quoted: msg });
            try {
                const payload = new URLSearchParams({
                    key: VIP_API_KEY,
                    sign: VIP_SIGN
                });
                const res = await axios.post('https://vipreseller.co.id/api/profile', payload, {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });
                await sock.sendMessage(senderJid, { text: `📊 *Hasil Cek Saldo:*\n\n${JSON.stringify(res.data, null, 2)}` }, { quoted: msg });
            } catch (e) {
                await sock.sendMessage(senderJid, { text: `❌ Gagal konek VIP: ${e.message}` }, { quoted: msg });
            }
            return;
        }
        
        if (textLower.startsWith('!proses')) {
            if (!isAdmin) return;
            const parts = messageContent.split(' ').filter(Boolean);
            if (parts.length < 3) return;
            await sock.sendMessage(senderJid, { text: `⏳ Proses order *${parts[1]}*...` }, { quoted: msg });
            try {
                const payload = new URLSearchParams({
                    key: VIP_API_KEY,
                    sign: VIP_SIGN,
                    type: 'order',
                    service: parts[1],
                    data_no: parts[2]
                });
                const res = await axios.post('https://vipreseller.co.id/api/game-feature', payload, {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });
                await sock.sendMessage(senderJid, { text: `📋 *Respon API:*\n${JSON.stringify(res.data, null, 2)}` }, { quoted: msg });
            } catch (e) {
                await sock.sendMessage(senderJid, { text: `❌ Gagal eksekusi: ${e.message}` }, { quoted: msg });
            }
            return;
        }

        // 4. RESPON AI CUSTOM (PINTAR, TELITI BUKTI TF, SUPER PENDEK, GAYA LU)
        if (isAiActive && !messageContent.startsWith('!')) {
            try {
                let systemPrompt = `Lu adalah Muhamad Sodikin (pemilik Lapak Siqinz). Sifat lu: santai, ramah, kadang lucu, emosian dikit kalau ada yang macem-macem, sopan ke pembeli asli. 
ATURAN UTAMA:
1. JANGAN PANJANG! Balas wajib singkat, padat, to the point, cukup 5 sampai 10 kata saja!
2. KHUSUS MELAYANI PEMBELI / TOP UP / CEK BUKTI TRANSFER. Kalau ada yang chat di luar konteks jual-beli atau iseng, tolak atau cuekin singkat.
3. JIKA ADA GAMBAR BUKTI TRANSFER: Lu harus teliti selayaknya manusia jenius! Cek jam, tanggal, detik, nama pengirim, dan pastikan NOMOR REKENING TUJUAN HARUS KE NOMOR: 083142628969 ATAS NAMA MUHAMAD SODIKIN. Kalau salah nomor rekening, kurang nominal, atau editan/palsu, bilang itu palsu/ditolak dengan tegas! Kalau asli, validasi dengan ramah.`;

                let groqMessages = [{ role: "system", content: systemPrompt }];

                if (isImage) {
                    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                    const base64Image = buffer.toString('base64');
                    groqMessages.push({
                        role: "user",
                        content: [
                            { type: "text", text: messageContent || "Cek bukti transfer ini bre, pastikan mutlak ke no rek 083142628969 a.n Muhamad Sodikin." },
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
                    await sock.sendMessage(senderJid, { text: responseText }, { quoted: msg });
                }
            } catch (err) {
                console.error('❌ Groq Error:', err?.message || err);
                await sock.sendMessage(senderJid, { text: 'Waduh puyeng, kirim ulang bre!' }, { quoted: msg });
            }
        }
    });
}

startBot();
