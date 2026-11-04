// 0. POLYFILL CRYPTO (Wajib di baris paling atas agar Baileys tidak crash)
const crypto = require('crypto');
if (!globalThis.crypto) {
    globalThis.crypto = crypto.webcrypto || crypto;
}

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');
const axios = require('axios');
const pino = require('pino');

// 1. EXPRESS WEB SERVER
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Server Lapak Siqinz Full-Stabil Aktif!'));
app.listen(PORT, () => console.log(`🚀 Server Express jalan di port ${PORT}`));

// 2. SETUP GEMINI AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const aiModel = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Lu adalah admin CS Lapak Siqinz. Jawab pake bahasa santai (bre, lu, gua). Tugas lu melayani pertanyaan seputar top up game dengan ramah, jelas, dan cepat."
});

const NOMOR_ADMIN = '6283878322624'; 
const NOMOR_BOT_PAIRING = '6283878322624';

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                console.log('⏳ Sedang meminta kode pairing 8 digit dari WhatsApp...');
                const code = await sock.requestPairingCode(NOMOR_BOT_PAIRING);
                console.log('\n==================================================');
                console.log(`🔥 KODE PAIRING LU BRE: ${code}`);
                console.log('==================================================\n');
            } catch (err) {
                console.error('❌ Gagal generate Kode Pairing:', err.message);
            }
        }, 5000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`⚠️ Koneksi terputus (Status Code: ${statusCode}). Mencoba terhubung ulang: ${shouldReconnect}`);
            
            if (shouldReconnect) {
                setTimeout(startBot, 3000);
            } else {
                console.log('❌ Sesi logout terdeteksi. Silakan hapus folder auth_session jika ingin pairing ulang.');
            }
        } else if (connection === 'open') {
            console.log('🎉 BOT LAPAK SIQINZ BERHASIL TERCONNECT DENGAN SEMPURNA!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg || !msg.message || msg.key.fromMe) return;

        const senderJid = msg.key.remoteJid;
        if (!senderJid || senderJid.endsWith('@g.us') || senderJid === 'status@broadcast') return;

        const senderNumber = senderJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
        const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        if (!messageContent.trim()) return;

        // A. COMMAND ADMIN: CEK SALDO VIP RESELLER
        if (messageContent === '!ceksaldo') {
            if (senderNumber !== NOMOR_ADMIN) return;
            await sock.sendMessage(senderJid, { text: '⏳ Bentar bre, lagi ngecek brankas VIP Reseller...' });
            try {
                const payload = new URLSearchParams({
                    key: process.env.VIP_API_KEY || '',
                    sign: process.env.VIP_SIGN || ''
                });
                const res = await axios.post('https://vipreseller.co.id/api/profile', payload);
                await sock.sendMessage(senderJid, { text: `📊 *Hasil Cek Saldo VIP Reseller:*\n\n${JSON.stringify(res.data, null, 2)}` });
            } catch (e) {
                await sock.sendMessage(senderJid, { text: `❌ Gagal konek ke VIP Reseller: ${e.message}` });
            }
            return;
        }

        // B. COMMAND ADMIN: PROSES TRANSAKSI OTOMATIS
        if (messageContent.startsWith('!proses')) {
            if (senderNumber !== NOMOR_ADMIN) {
                await sock.sendMessage(senderJid, { text: '⛔ Perintah ini khusus Admin Lapak Siqinz bre!' });
                return;
            }

            const parts = messageContent.split(' ').filter(Boolean);
            if (parts.length < 3) {
                await sock.sendMessage(senderJid, { text: '⚠️ Format salah! Ketik: *!proses [kodeproduk] [idgame]*' });
                return;
            }

            const service = parts[1];
            const data_no = parts[2];

            await sock.sendMessage(senderJid, { text: `⏳ Memproses pesanan ${service} untuk ID ${data_no}...` });

            try {
                const payload = new URLSearchParams({
                    key: process.env.VIP_API_KEY || '',
                    sign: process.env.VIP_SIGN || '',
                    type: 'order',
                    service: service,
                    data_no: data_no
                });
                const res = await axios.post('https://vipreseller.co.id/api/game-feature', payload);
                
                if (res.data && res.data.result === true) {
                    await sock.sendMessage(senderJid, { text: `✅ *TRANSAKSI SUKSES!*\n\nProduk: ${service}\nTarget ID: ${data_no}\nDetail: ${JSON.stringify(res.data.data)}` });
                } else {
                    await sock.sendMessage(senderJid, { text: `❌ *TRANSAKSI GAGAL!*\n\nKeterangan: ${res.data?.message || 'Respon gagal dari server'}` });
                }
            } catch (e) {
                await sock.sendMessage(senderJid, { text: `❌ Gagal eksekusi transaksi: ${e.message}` });
            }
            return;
        }

        // C. RESPON GEMINI AI UNTUK CHAT PELANGGAN
        try {
            const result = await aiModel.generateContent(messageContent);
            const responseText = result.response.text();
            if (responseText) {
                await sock.sendMessage(senderJid, { text: responseText });
            }
        } catch (err) {
            console.error('❌ Gemini Error:', err.message);
            await sock.sendMessage(senderJid, { text: 'Waduh bre, koneksi AI-nya lagi gangguan bentar. Coba ulangi chat lu ya.' });
        }
    });
}

startBot();
