require('dotenv').config();
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal'); 
const axios = require('axios');

const messageHandler = require('./handler'); 

process.on('uncaughtException', (err) => console.error('🚨 Error Ringan:', err?.message));
process.on('unhandledRejection', (err) => {
    if (err?.message && (err.message.includes('Bad MAC') || err.message.includes('decrypt'))) return;
    console.error('🚨 Unhandled Rejection:', err?.message);
});

const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('Mesin Lapak Siqinz Aktif!'));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Web Server standby di port ${PORT}`));

const NOMOR_BOT = '6283878322624'; 
const SESSION_DIR = './sesi_lapak_fresh';

// Simpan ID pesan yang sudah diproses secara global lintas event loop
const globalProcessedIds = new Set();

async function startBot() {
    const credsPath = path.join(SESSION_DIR, 'creds.json');

    if (process.env.SESSION_ID && !fs.existsSync(credsPath)) {
        try {
            if (fs.existsSync('./sesi_lapak')) {
                fs.rmSync('./sesi_lapak', { recursive: true, force: true });
            }
            if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
            
            const decodedSession = Buffer.from(process.env.SESSION_ID, 'base64').toString('utf-8');
            fs.writeFileSync(credsPath, decodedSession);
            console.log('✅ SESSION_ID FRESH termuat dari Railway!');
        } catch (e) {}
    } else {
        if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n==================================================');
            console.log('📷 BARKODE MUNCUL! SCAN PAKAI HP LU SEKARANG!');
            qrcode.generate(qr, { small: true });
            console.log('==================================================\n');
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`⚠️ Koneksi terputus (Status: ${statusCode}). Reconnecting...`);
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch(e){}
            }
            setTimeout(startBot, 3000);
        } else if (connection === 'open') {
            console.log('🎉 BOT BERHASIL TERSAMBUNG (STRICT DEDUPLICATE ACTIVE)!');
            
            axios.get('https://api.ipify.org?format=json')
                .then(res => console.log(`🌐 [RAILWAY IP ACTIVE]: ${res.data.ip}`))
                .catch(() => {});
        }
    });

    // ==========================================
    // PINTU UTAMA DENGAN FILTER GLOBAL SET (ANTI DUPLIKAT MUTLAK)
    // ==========================================
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg || !msg.message) continue;
            if (msg.key.fromMe) continue;

            const from = msg.key.remoteJid;
            if (!from || from === 'status@broadcast' || from.endsWith('@g.us')) continue;
            if (from.includes(NOMOR_BOT)) continue;

            const msgId = msg.key.id;
            // Jika ID pesan ini SUDAH PERNAH masuk dalam 60 detik ke belakang, TENDANG LANGSUNG!
            if (globalProcessedIds.has(msgId)) continue;
            globalProcessedIds.add(msgId);
            
            // Bersihkan memori ID setelah 60 detik agar RAM tidak penuh
            setTimeout(() => {
                globalProcessedIds.delete(msgId);
            }, 60000);

            const msgTime = msg.messageTimestamp;
            const currentTime = Math.floor(Date.now() / 1000);
            if (currentTime - msgTime > 30) continue;

            try {
                await messageHandler(sock, msg); 
            } catch (err) {
                console.error('Error di message dispatcher:', err);
            }
        }
    });
}

startBot();
