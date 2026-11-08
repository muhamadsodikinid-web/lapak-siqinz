require('dotenv').config();
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const crypto = require('crypto');
const { Groq } = require('groq-sdk');

process.on('uncaughtException', (err) => console.error('Error:', err?.message));
process.on('unhandledRejection', (err) => {});

const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('Bot Aktif!'));
app.listen(PORT, '0.0.0.0');

const NOMOR_BOT = '6283878322624';
const SESSION_DIR = './sesi_lapak_fresh';

// Database sederhana & Sesi memori
const userSessions = {};
const processedIds = new Set();

const ffProducts = [
    { code: "FF5-S13", name: "5 Diamonds", basePrice: 835 },
    { code: "FF10-S13", name: "10 Diamonds", basePrice: 1479 },
    { code: "FF70-S13", name: "70 Diamonds", basePrice: 8082 },
    { code: "FF100-S13", name: "100 Diamonds", basePrice: 13266 },
    { code: "FF140-S13", name: "140 Diamonds", basePrice: 16267 },
    { code: "FFMM-S13", name: "Membership Mingguan", basePrice: 27636 },
    { code: "FFMB-S13", name: "Membership Bulanan", basePrice: 82857 }
];

function getGroq() {
    return new Groq({ apiKey: process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_1 });
}

async function startBot() {
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'open') {
            console.log('BOT BERHASIL TERHUBUNG!');
            axios.get('https://api.ipify.org?format=json').then(res => console.log(`IP: ${res.data.ip}`)).catch(()=>{});
        } else if (connection === 'close') {
            setTimeout(startBot, 3000);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg || !msg.message || msg.key.fromMe) return;

        // GEMBOK 1: Tolak Grup & Tolak Nomor Bot Sendiri
        const from = msg.key.remoteJid;
        if (!from || from.includes('@g.us') || from.includes(NOMOR_BOT)) return;

        // GEMBOK 2: Cegah ID Pesan Diproses Dobel
        if (processedIds.has(msg.key.id)) return;
        processedIds.add(msg.key.id);
        setTimeout(() => processedIds.delete(msg.key.id), 20000);

        try {
            const mType = Object.keys(msg.message)[0];
            let body = '';
            if (mType === 'conversation') body = msg.message.conversation;
            else if (mType === 'extendedTextMessage') body = msg.message.extendedTextMessage.text;
            else if (mType === 'imageMessage') body = msg.message.imageMessage.caption || '';
            
            const text = body.toLowerCase().trim();
            if (!text) return;

            if (!userSessions[from]) {
                userSessions[from] = { step: 'IDLE', item: null, idGame: '' };
            }
            const s = userSessions[from];

            // 1. Alur Topup Sederhana
            if (s.step === 'IDLE' && (text.includes('topup') || text.includes('beli') || text.includes('dm'))) {
                s.step = 'PILIH';
                await sock.sendMessage(from, { text: 'Mau beli berapa DM? (Contoh: 70 dm atau 100 dm)' }, { quoted: msg });
                return;
            }

            if (s.step === 'PILIH') {
                const found = ffProducts.find(p => text.includes(p.code.toLowerCase()) || text.includes(p.name.toLowerCase()) || text.includes(p.basePrice.toString()) || text.includes(text.replace(/[^0-9]/g, '')));
                // Default ambil 70 kalau angka asal
                s.item = found || ffProducts[2]; 
                s.step = 'ID_GAME';
                await sock.sendMessage(from, { text: `Pilihan: ${s.item.name}. Kirim ID game Free Fire lu:` }, { quoted: msg });
                return;
            }

            if (s.step === 'ID_GAME') {
                s.idGame = text;
                s.step = 'DONE';
                const total = s.item.basePrice + 3000;
                await sock.sendMessage(from, { text: `Tujuan: ${s.idGame}\nTotal: Rp ${total.toLocaleString('id-ID')}\nTransfer ke DANA: 083142628969 (Muhamad Sodikin).` }, { quoted: msg });
                userSessions[from] = { step: 'IDLE', item: null, idGame: '' };
                return;
            }

            // 2. Chat AI Biasa (Sunda Tongkrongan Singkat)
            const groq = getGroq();
            const res = await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: 'Kamu Muhamad Sodikin (owner Lapak Siqinz). Jawab santai, Sunda tongkrongan, HANYA 1 KALIMAT PENDEK, jangan nanya balik.' },
                    { role: 'user', content: body }
                ],
                model: 'qwen/qwen3.8-27b',
                max_tokens: 30,
                temperature: 0.5
            });

            const reply = res.choices[0]?.message?.content?.trim();
            if (reply) {
                await sock.sendMessage(from, { text: reply }, { quoted: msg });
            }

        } catch (e) {
            console.error('Err chat:', e.message);
        }
    });
}

startBot();
