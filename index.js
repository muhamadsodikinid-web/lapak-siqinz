require('dotenv').config();
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// INI YANG BIKIN NYAMBUNG KE FILE KETIGA (HANDLER)
const messageHandler = require('./handler'); 

process.on('uncaughtException', (err) => console.error('🚨 Error Ringan:', err?.message));
process.on('unhandledRejection', (err) => console.error('🚨 Error Ringan:', err?.message));

const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('Mesin Lapak Siqinz Aktif!'));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Web Server standby di port ${PORT}`));

const NOMOR_BOT = '6283878322624';
const NOMOR_ADMIN = '6283142628969';
const SESSION_DIR = './sesi_lapak';

async function startBot() {
    // Fitur baca Session dari Railway
    if (process.env.SESSION_ID) {
        try {
            if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
            const credsPath = path.join(SESSION_DIR, 'creds.json');
            const decodedSession = Buffer.from(process.env.SESSION_ID, 'base64').toString('utf-8');
            fs.writeFileSync(credsPath, decodedSession);
            console.log('✅ SESSION_ID termuat dari Railway!');
        } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        browser: ['Mac OS', 'Chrome', '120.0.0.0'], // OS Mac terbukti lebih cepat nangkep Pairing Code
        syncFullHistory: false,
        generateHighQualityLinkPreview: false
    });

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(NOMOR_BOT);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log('\n========================================');
                console.log(` 🔑 KODE PAIRING: ${code} `);
                console.log('========================================\n');
            } catch (err) {
                console.log('❌ Gagal minta kode pairing:', err.message);
            }
        }, 4000); 
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`⚠️ Koneksi terputus (Status: ${statusCode}). Reconnecting...`);
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch(e){}
            }
            setTimeout(startBot, 3000);
        } else if (connection === 'open') {
            console.log('🎉 BOT BERHASIL TERSAMBUNG!');
            
            setTimeout(async () => {
                try {
                    const credsPath = path.join(SESSION_DIR, 'creds.json');
                    if (fs.existsSync(credsPath)) {
                        const sessionKey = fs.readFileSync(credsPath).toString('base64');
                        console.log('\n========================================');
                        console.log('🔥 SESSION KEY LU (PASTE DI RAILWAY) 🔥');
                        console.log(sessionKey);
                        console.log('========================================\n');
                        
                        await sock.sendMessage(`${NOMOR_ADMIN}@s.whatsapp.net`, { 
                            text: `*🔑 SESSION KEY LAPAK SIQINZ*\n\n${sessionKey}` 
                        });
                    }
                } catch (err) {}
            }, 3000);
        }
    });

    // Operan pesan masuk dilempar ke file handler.js
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg || !msg.message) return;
        await messageHandler(sock, msg); // 🔥 NYAMBUNG KE FILE KE-3
    });
}

startBot();
