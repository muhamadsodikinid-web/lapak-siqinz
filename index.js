require('dotenv').config();

process.on('uncaughtException', (err) => console.error('🚨 UNCAUGHT EXCEPTION:', err?.message || err));
process.on('unhandledRejection', (err) => console.error('🚨 UNHANDLED REJECTION:', err?.message || err));

const crypto = require('crypto');
if (!globalThis.crypto) {
    globalThis.crypto = crypto.webcrypto || crypto;
}

// Tambahan: downloadMediaMessage buat unduh gambar
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, downloadMediaMessage } = require('@whiskeysockets/baileys');
const Groq = require('groq-sdk');
const express = require('express');
const axios = require('axios');
const pino = require('pino');
const fs = require('fs');
const NodeCache = require('node-cache');

const msgRetryCounterCache = new NodeCache();
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Server Lapak Siqinz (AI Vision & Menu) Aktif!'));
app.listen(PORT, () => console.log(`🚀 Server Express jalan di port ${PORT}`));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const VIP_API_KEY = process.env.VIP_API_KEY;
const VIP_SIGN = process.env.VIP_SIGN;

const NOMOR_ADMIN = '6283878322624'; 
const NOMOR_BOT_PAIRING = '6283878322624';

// SAKLAR AI (Default: Mati)
let isAiActive = false;

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
                console.log('⏳ Meminta kode pairing 8 digit...');
                const code = await sock.requestPairingCode(NOMOR_BOT_PAIRING);
                console.log('\n==================================================');
                console.log(`🔥 KODE PAIRING LU BRE: ${code}`);
                console.log('==================================================\n');
            } catch (err) {
                console.error('❌ Gagal generate Kode Pairing:', err?.message || err);
            }
        }, 8000);
    }

    sock.ev.on('creds.update', async () => {
        try { await saveCreds(); } catch (e) {}
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error)?.output?.statusCode;
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
                console.log('🚨 Sesi ditolak WA! Menghapus cache lama...');
                try { sock.end(undefined); } catch (e) {}
                setTimeout(() => {
                    try { if (fs.existsSync('auth_session')) fs.rmSync('auth_session', { recursive: true, force: true }); } catch (e) {}
                    startBot();
                }, 2000);
            } else {
                setTimeout(startBot, 3000);
            }
        } else if (connection === 'open') {
            console.log('🎉 AKHIRNYA! BOT LAPAK SIQINZ BERHASIL TERTAUT!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg || !msg.message || msg.key.fromMe) return;

        const senderJid = msg.key.remoteJid;
        if (!senderJid || senderJid.endsWith('@g.us') || senderJid === 'status@broadcast') return;

        const senderNumber = senderJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
        
        // Ambil isi teks, baik dari chat biasa maupun caption gambar
        let messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '';
        if (!messageContent.trim() && !msg.message.imageMessage) return;

        // Cek apakah pesan ini gambar
        const isImage = msg.message.imageMessage ? true : false;

        // ==========================================
        // 1. MENU UTAMA
        // ==========================================
        if (messageContent.toLowerCase() === 'menu' || messageContent.toLowerCase() === '!menu') {
            let menuText = `*👾 MENU LAPAK SIQINZ 👾*\n\n`;
            menuText += `1. *Daftar Game* (Ketik: !game)\n`;
            menuText += `2. *Format Order* (Ketik: !format)\n`;
            menuText += `3. *Hubungi Admin* (Ketik: !admin)\n\n`;
            
            // Menu khusus kalau yang ngechat lu (Admin)
            if (senderNumber === NOMOR_ADMIN) {
                menuText += `*👑 PANEL ADMIN (RAHASIA):*\n`;
                menuText += `Status AI: ${isAiActive ? '✅ NYALA' : '❌ MATI'}\n`;
                menuText += `- *!on-ai* (Nyalakan asisten AI)\n`;
                menuText += `- *!off-ai* (Matikan asisten AI)\n`;
                menuText += `- *!ceksaldo* (Cek sisa saldo VIP)\n`;
                menuText += `- *!proses [produk] [id]* (Tembak orderan)\n`;
            }
            
            // Balas dengan format "Quoted Reply" (Geser pesan)
            await sock.sendMessage(senderJid, { text: menuText }, { quoted: msg });
            return;
        }

        // ==========================================
        // 2. KONTROL SAKLAR AI (KHUSUS ADMIN)
        // ==========================================
        if (messageContent === '!on-ai') {
            if (senderNumber !== NOMOR_ADMIN) return;
            isAiActive = true;
            await sock.sendMessage(senderJid, { text: '🤖 *Mode AI Aktif!* Sekarang bot bakal balas otomatis.' }, { quoted: msg });
            return;
        }
        if (messageContent === '!off-ai') {
            if (senderNumber !== NOMOR_ADMIN) return;
            isAiActive = false;
            await sock.sendMessage(senderJid, { text: '💤 *Mode AI Dimatikan!* Cuma jawab menu doang sekarang.' }, { quoted: msg });
            return;
        }

        // ==========================================
        // 3. FITUR ADMIN: VIP RESELLER
        // ==========================================
        if (messageContent === '!ceksaldo') {
            if (senderNumber !== NOMOR_ADMIN) return;
            await sock.sendMessage(senderJid, { text: '⏳ Bentar bre, ngecek brankas...' }, { quoted: msg });
            try {
                const payload = new URLSearchParams({ key: VIP_API_KEY, sign: VIP_SIGN });
                const res = await axios.post('https://vipreseller.co.id/api/profile', payload);
                await sock.sendMessage(senderJid, { text: `📊 *Hasil Cek Saldo:*\n\n${JSON.stringify(res.data, null, 2)}` }, { quoted: msg });
            } catch (e) {
                await sock.sendMessage(senderJid, { text: `❌ Gagal konek ke VIP Reseller.` }, { quoted: msg });
            }
            return;
        }

        if (messageContent.startsWith('!proses')) {
            if (senderNumber !== NOMOR_ADMIN) return;
            const parts = messageContent.split(' ').filter(Boolean);
            if (parts.length < 3) return;
            
            await sock.sendMessage(senderJid, { text: `⏳ Memproses pesanan ${parts[1]} untuk ID ${parts[2]}...` }, { quoted: msg });
            try {
                const payload = new URLSearchParams({ key: VIP_API_KEY, sign: VIP_SIGN, type: 'order', service: parts[1], data_no: parts[2] });
                const res = await axios.post('https://vipreseller.co.id/api/game-feature', payload);
                await sock.sendMessage(senderJid, { text: `📋 Respon API:\n${JSON.stringify(res.data)}` }, { quoted: msg });
            } catch (e) {
                await sock.sendMessage(senderJid, { text: `❌ Gagal eksekusi transaksi.` }, { quoted: msg });
            }
            return;
        }

        // ==========================================
        // 4. RESPON GROQ AI (VISION + TEKS)
        // ==========================================
        if (isAiActive && !messageContent.startsWith('!')) {
            try {
                let groqMessages = [
                    {
                        role: "system",
                        content: "Lu adalah admin CS Lapak Siqinz bernama Bot Qinz. Jawab pake bahasa santai anak tongkrongan (bre, lu, gua). Tugas lu melayani pertanyaan top up game dan ngecek bukti gambar."
                    }
                ];

                if (isImage) {
                    // Kalau ada gambar, unduh dulu gambarnya
                    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                    const base64Image = buffer.toString('base64');
                    
                    groqMessages.push({
                        role: "user",
                        content: [
                            { type: "text", text: messageContent || "Tolong cek gambar bukti screenshot ini bre." },
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                        ]
                    });
                } else {
                    // Kalau teks biasa
                    groqMessages.push({
                        role: "user",
                        content: messageContent
                    });
                }

                // Gunakan model yang support baca gambar
                const chatCompletion = await groq.chat.completions.create({
                    messages: groqMessages,
                    model: "llama-3.2-90b-vision-preview",
                    temperature: 0.7,
                });

                const responseText = chatCompletion.choices[0]?.message?.content || '';
                if (responseText) {
                    // Balas sambil ngutip (reply) pesan si pengirim
                    await sock.sendMessage(senderJid, { text: responseText }, { quoted: msg });
                }
            } catch (err) {
                console.error('❌ Groq AI Error:', err?.message || err);
                // Kalau error limit atau gagal, jangan diam aja
                await sock.sendMessage(senderJid, { text: 'Waduh bre, AI-nya lagi puyeng bentar. Coba kirim ulang.' }, { quoted: msg });
            }
        }
    });
}

startBot();
