// 0. SISTEM ANTI-CRASH GLOBAL
process.on('uncaughtException', (err) => {
    console.error('🚨 UNCAUGHT EXCEPTION:', err?.message || err);
});
process.on('unhandledRejection', (err) => {
    console.error('🚨 UNHANDLED REJECTION:', err?.message || err);
});

// 1. POLYFILL CRYPTO
const crypto = require('crypto');
if (!globalThis.crypto) {
    globalThis.crypto = crypto.webcrypto || crypto;
}

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');
const axios = require('axios');
const pino = require('pino');
const fs = require('fs');
const NodeCache = require('node-cache');

const msgRetryCounterCache = new NodeCache();

// EXPRESS WEB SERVER
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Server Lapak Siqinz Kebal Crash Aktif!'));
app.listen(PORT, () => console.log(`🚀 Server Express jalan di port ${PORT}`));

// SETUP GEMINI AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const aiModel = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Lu adalah admin CS Lapak Siqinz. Jawab pake bahasa santai (bre, lu, gua). Tugas lu melayani pertanyaan seputar top up game."
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
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
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
        }, 5000);
    }

    // SAFE SAVE CREDS (Biar gak crash ENOENT)
    sock.ev.on('creds.update', async () => {
        try {
            await saveCreds();
        } catch (e) {
            // Abaikan error write saat folder disapu
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error)?.output?.statusCode;
            console.log(`⚠️ Koneksi terputus. Status Code: ${statusCode}`);
            
            // JIKA SESI DITOLAK / EXPIRED (401 / 403 / LoggedOut)
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
                console.log('🚨 Sesi ditolak WA! Menutup socket & menghapus cache lama...');
                
                try { sock.end(undefined); } catch (e) {}
                
                setTimeout(() => {
                    try {
                        if (fs.existsSync('auth_session')) {
                            fs.rmSync('auth_session', { recursive: true, force: true });
                        }
                    } catch (e) {
                        console.error('Gagal hapus folder:', e.message);
                    }
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
        const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        if (!messageContent.trim()) return;

        // COMMAND ADMIN: CEK SALDO
        if (messageContent === '!ceksaldo') {
            if (senderNumber !== NOMOR_ADMIN) return;
            await sock.sendMessage(senderJid, { text: '⏳ Bentar bre, ngecek brankas VIP Reseller...' });
            try {
                const payload = new URLSearchParams({ key: process.env.VIP_API_KEY || '', sign: process.env.VIP_SIGN || '' });
                const res = await axios.post('https://vipreseller.co.id/api/profile', payload);
                await sock.sendMessage(senderJid, { text: `📊 *Hasil Cek Saldo:*\n\n${JSON.stringify(res.data, null, 2)}` });
            } catch (e) {
                await sock.sendMessage(senderJid, { text: `❌ Gagal konek ke VIP Reseller.` });
            }
            return;
        }

        // COMMAND ADMIN: PROSES
        if (messageContent.startsWith('!proses')) {
            if (senderNumber !== NOMOR_ADMIN) return;
            const parts = messageContent.split(' ').filter(Boolean);
            if (parts.length < 3) return;
            
            await sock.sendMessage(senderJid, { text: `⏳ Memproses pesanan ${parts[1]} untuk ID ${parts[2]}...` });
            try {
                const payload = new URLSearchParams({ key: process.env.VIP_API_KEY || '', sign: process.env.VIP_SIGN || '', type: 'order', service: parts[1], data_no: parts[2] });
                const res = await axios.post('https://vipreseller.co.id/api/game-feature', payload);
                await sock.sendMessage(senderJid, { text: `📋 Respon API:\n${JSON.stringify(res.data)}` });
            } catch (e) {
                await sock.sendMessage(senderJid, { text: `❌ Gagal eksekusi transaksi.` });
            }
            return;
        }

        // CHAT AI GEMINI
        try {
            const result = await aiModel.generateContent(messageContent);
            const responseText = result.response.text();
            if (responseText) await sock.sendMessage(senderJid, { text: responseText });
        } catch (err) {
            console.error('❌ Gemini Error:', err?.message || err);
        }
    });
}

startBot();
