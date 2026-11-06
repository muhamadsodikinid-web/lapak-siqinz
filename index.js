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
const NOMOR_BOT = '6283878322624'; 

function getVipSign() {
    if (process.env.VIP_SIGN) {
        return process.env.VIP_SIGN;
    }
    return crypto.createHash('md5').update(VIP_API_ID + VIP_API_KEY).digest('hex');
}

let isBotActive = true;       
let aiMode = 'OFF';           
const chatHistories = {};     // 🧠 PUSAT MEMORI PER USER
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
        
        // 🚨 1. JANGAN PERNAH BALAS CHAT DARI GRUP!
        if (!senderJid || senderJid.endsWith('@g.us') || senderJid === 'status@broadcast') return;

        const senderNumber = senderJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
        const isAdmin = senderNumber === NOMOR_BOT || msg.key.fromMe;
        const isFromMe = msg.key.fromMe; 

        let messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '';
        if (!messageContent.trim() && !msg.message.imageMessage) return;

        const isImage = msg.message.imageMessage ? true : false;
        const textLower = messageContent.toLowerCase();

        // 🚨 2. ANTI-NIMBRUNG: Kalau lu chat orang lain, bot diem total
        const isSelfChat = senderNumber === NOMOR_BOT;
        if (isFromMe && !isSelfChat) {
            return; 
        }

        // Kontrol Master Switch lewat chat ke nomor sendiri
        if (isAdmin && isSelfChat) {
            if (textLower === '!bot-off') {
                isBotActive = false;
                await sock.sendMessage(senderJid, { text: '🛑 *Bot Master OFF!* Bot mengabaikan semua chat.' }, { quoted: msg });
                return;
            }
            if (textLower === '!bot-on') {
                isBotActive = true;
                await sock.sendMessage(senderJid, { text: '🟢 *Bot Master ON!* Bot aktif normal.' }, { quoted: msg });
                return;
            }
        }

        if (!isBotActive && !isAdmin) return;

        // 1. MENU UTAMA
        if (textLower === 'menu' || textLower === '!menu') {
            let menuText = `*🎮 SELAMAT DATANG DI LAPAK SIQINZ 🎮*\n_Pusat Top Up Game Termurah & Terpercaya_\n\n` +
                           `*📋 MENU PELANGGAN:*\n➤ *!game* (Daftar Game)\n➤ *!format* (Cara Order)\n➤ *!admin* (Hubungi Owner)\n\n`;
            
            if (isAdmin) {
                menuText += `*👑 PANEL KHUSUS OWNER:*\n` +
                            `Status Bot Utama: ${isBotActive ? '🟢 NYALA' : '🔴 MATI'}\n` +
                            `Status AI: *${aiMode}* (🧠 Memori Aktif)\n\n` +
                            `➤ *!bot-on* / *!bot-off*\n` +
                            `➤ *!ai-topup* (Admin Top-Up)\n` +
                            `➤ *!ai-chat* (Pengganti Manusia)\n` +
                            `➤ *!ai-off*\n` +
                            `➤ *!ceksaldo*\n` +
                            `➤ *!proses <kode> <id>*\n`;
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
        if (textLower === '!admin') {
            await sock.sendMessage(senderJid, { text: `📞 *Kontak Owner:* Muhamad Sodikin` }, { quoted: msg }); return;
        }

        // 2. SAKLAR MODE AI (Sekaligus reset memori ringan jika ganti mode agar tidak bentrok konteks)
        if (textLower === '!ai-topup') {
            if (!isAdmin) { await sock.sendMessage(senderJid, { text: '⚠️ Lu bukan admin, bre!' }, { quoted: msg }); return; }
            aiMode = 'TOPUP';
            chatHistories[senderJid] = []; // Reset memori khusus chat ini
            await sock.sendMessage(senderJid, { text: '🤖 *AI Admin Top-Up Aktif!* (Long Text & Teliti Rekening 083142628969).' }, { quoted: msg });
            return;
        }

        if (textLower === '!ai-chat') {
            if (!isAdmin) { await sock.sendMessage(senderJid, { text: '⚠️ Lu bukan admin, bre!' }, { quoted: msg }); return; }
            aiMode = 'CHAT';
            chatHistories[senderJid] = []; // Reset memori khusus chat ini
            await sock.sendMessage(senderJid, { text: '👥 *AI Pengganti Manusia Aktif!* (Short Text 5-10 kata & Adaptif Bahasa).' }, { quoted: msg });
            return;
        }
        
        if (textLower === '!ai-off') {
            if (!isAdmin) return;
            aiMode = 'OFF';
            chatHistories[senderJid] = [];
            await sock.sendMessage(senderJid, { text: '💤 *Semua Mode AI Dimatikan!*' }, { quoted: msg });
            return;
        }

        // 3. API VIP RESELLER
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

        // 4. PROSES AI DENGAN MEMORI RIWAYAT CHAT YANG BENAR
        if (aiMode !== 'OFF' && !messageContent.startsWith('!')) {
            try {
                // Inisialisasi memori user jika belum ada
                if (!chatHistories[senderJid]) {
                    chatHistories[senderJid] = [];
                }

                let systemPrompt = '';

                if (aiMode === 'TOPUP') {
                    systemPrompt = `Lu adalah Admin Top-Up profesional untuk "Lapak Siqinz". 
ATURAN UTAMA:
1. Boleh memberikan penjelasan detail (Long Text) agar pembeli paham.
2. JANGAN PERNAH CHAT KE GRUP.
3. KETIKA MENERIMA BUKTI TRANSFER / GAMBAR: Analisis secara teliti tanggal, jam, detik, nominal, dan pastikan NOMOR REKENING TUJUAN HARUS KE: 083142628969 atas nama MUHAMAD SODIKIN. Jika salah rekening, editan, atau palsu, tolak dengan tegas! Jika asli, berikan instruksi proses selanjutnya dengan ramah.
4. INGAT RIWAYAT PERCAKAPAN: Selalu ingat apa yang sudah dibahas sebelumnya dengan user ini agar tidak pelupa.`;
                } else if (aiMode === 'CHAT') {
                    systemPrompt = `Lu adalah Muhamad Sodikin (pribadi asli di luar urusan top-up). 
ATURAN UTAMA:
1. WAJIB ADAPTIF BAHASA: Sesuaikan bahasa lu dengan bahasa yang dipakai lawan bicara (Misal dia pakai bahasa Sunda, balas pakai bahasa Sunda yang natural; jika bahasa Indonesia, balas bahasa Indonesia santai).
2. Sifat lu: ramah, santai, lucu, manusiawi, sopan.
3. BALASAN WAJIB SUPER SINGKAT (SHORT TEXT): Cukup 5 sampai 10 kata saja!
4. INGAT RIWAYAT PERCAKAPAN: Nyambung terus dengan topik sebelumnya, jangan planga-plongo atau lupa.
5. JANGAN PERNAH CHAT KE GRUP.`;
                }

                // Masukkan System Prompt + Riwayat Memori Chat + Pesan Terbaru User
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
                            { type: "text", text: messageContent || "Tolong cek gambar ini bre." },
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
                    // Simpan riwayat chat terbaru ke dalam memori user ini (maksimal 10 percakapan)
                    chatHistories[senderJid].push({ role: "user", content: messageContent });
                    chatHistories[senderJid].push({ role: "assistant", content: responseText });
                    if (chatHistories[senderJid].length > 10) {
                        chatHistories[senderJid].splice(0, 2); 
                    }

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
