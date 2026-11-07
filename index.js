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

process.on('uncaughtException', (err) => console.error('🚨 Error Ringan:', err?.message));
process.on('unhandledRejection', (err) => {
    if (err?.message && (err.message.includes('Bad MAC') || err.message.includes('decrypt'))) return;
    console.error('🚨 Unhandled Rejection:', err?.message);
});

const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('Mesin Lapak Siqinz Aktif!'));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Web Server standby di port ${PORT}`));

const NOMOR_ADMIN = '6283142628969';
const NOMOR_BOT = '6283878322624'; // 🔥 NOMOR BOT KUNCI MATI
const SESSION_DIR = './sesi_lapak_fresh'; // 🔥 SESI BARU AGAR BERSIH TOTAL

// ==========================================
// 1. DATABASE LOKAL HARGA FREE FIRE (MARKUP 3RB)
// ==========================================
const ffProducts = [
    { code: "FF5-S13", name: "5 Diamonds", basePrice: 835, keywords: ["5", "5dm", "5 diamond", "5 dm"] },
    { code: "FF10-S13", name: "10 Diamonds", basePrice: 1479, keywords: ["10", "10dm", "10 diamond", "10 dm"] },
    { code: "FF12-S13", name: "12 Diamonds", basePrice: 1630, keywords: ["12", "12dm", "12 dm"] },
    { code: "FF15-S13", name: "15 Diamonds", basePrice: 2222, keywords: ["15", "15dm", "15 dm"] },
    { code: "FF20-S13", name: "20 Diamonds", basePrice: 2961, keywords: ["20", "20dm", "20 dm"] },
    { code: "FF25-S13", name: "25 Diamonds", basePrice: 3700, keywords: ["25", "25dm", "25 dm"] },
    { code: "FF30-S13", name: "30 Diamonds", basePrice: 4439, keywords: ["30", "30dm", "30 dm"] },
    { code: "FF40-S13", name: "40 Diamonds", basePrice: 5588, keywords: ["40", "40dm", "40 dm"] },
    { code: "FF50-S13", name: "50 Diamonds", basePrice: 5899, keywords: ["50", "50dm", "50 dm"] },
    { code: "FF55-S13", name: "55 Diamonds", basePrice: 6636, keywords: ["55", "55dm", "55 dm"] },
    { code: "FF60-S13", name: "60 Diamonds", basePrice: 7373, keywords: ["60", "60dm", "60 dm"] },
    { code: "FF70-S13", name: "70 Diamonds", basePrice: 8082, keywords: ["70", "70dm", "70 dm"] },
    { code: "FF75-S13", name: "75 Diamonds", basePrice: 8763, keywords: ["75", "75dm", "75 dm"] },
    { code: "FFLUP-S13", name: "Level Up Pass", basePrice: 9225, keywords: ["lup", "level up", "level up pass"] },
    { code: "FF80-S13", name: "80 Diamonds", basePrice: 9508, keywords: ["80", "80dm", "80 dm"] },
    { code: "FF90-S13", name: "90 Diamonds", basePrice: 11140, keywords: ["90", "90dm", "90 dm"] },
    { code: "FF100-S13", name: "100 Diamonds", basePrice: 13266, keywords: ["100", "100dm", "100 dm", "seatus"] },
    { code: "FF140-S13", name: "140 Diamonds", basePrice: 16267, keywords: ["140", "140dm", "140 dm"] },
    { code: "FF150-S13", name: "150 Diamonds", basePrice: 18734, keywords: ["150", "150dm", "150 dm"] },
    { code: "FF200-S13", name: "200 Diamonds", basePrice: 23532, keywords: ["200", "200dm", "200 dm"] },
    { code: "FFMM-S13", name: "Membership Mingguan", basePrice: 27636, keywords: ["mingguan", "member mingguan", "mm"] },
    { code: "FF300-S13", name: "300 Diamonds", basePrice: 35540, keywords: ["300", "300dm", "300 dm"] },
    { code: "FF355-S13", name: "355 Diamonds", basePrice: 40411, keywords: ["355", "355dm"] },
    { code: "FF420-S13", name: "420 Diamonds", basePrice: 48842, keywords: ["420", "420dm"] },
    { code: "FF500-S13", name: "500 Diamonds", basePrice: 57674, keywords: ["500", "500dm"] },
    { code: "FF720-S13", name: "720 Diamonds", basePrice: 81308, keywords: ["720", "720dm"] },
    { code: "FFMB-S13", name: "Membership Bulanan", basePrice: 82857, keywords: ["bulanan", "member bulanan", "mb"] },
    { code: "FF800-S13", name: "800 Diamonds", basePrice: 90937, keywords: ["800", "800dm"] },
    { code: "FF1000-S13", name: "1000 Diamonds", basePrice: 113821, keywords: ["1000", "1000dm", "1k"] },
    { code: "FF1440-S13", name: "1440 Diamonds", basePrice: 166040, keywords: ["1440", "1440dm"] },
    { code: "FF2000-S13", name: "2000 Diamonds", basePrice: 231034, keywords: ["2000", "2000dm", "2k"] },
    { code: "FF3000-S13", name: "3000 Diamonds", basePrice: 356156, keywords: ["3000", "3000dm", "3k"] },
    { code: "FF5000-S13", name: "5000 Diamonds", basePrice: 574341, keywords: ["5000", "5000dm", "5k"] },
    { code: "FF7290-S13", name: "7290 Diamonds", basePrice: 813876, keywords: ["7290", "bulanan sultan"] }
];

// ==========================================
// 2. SESSION & MEMORY LOCK GABUNGAN
// ==========================================
const userSessions = {};
const globalProcessedMessageIds = new Set();

function getSession(from) {
    if (!userSessions[from]) {
        userSessions[from] = {
            step: 'IDLE',          
            selectedItem: null,
            dataNo: '',
            phoneNumber: from.replace('@s.whatsapp.net', ''),
            isProcessing: false    
        };
    }
    return userSessions[from];
}

// ==========================================
// 3. VIP CONFIG & ROTATION API KEYS
// ==========================================
const VIP_API_ID = process.env.VIP_API_ID || '';       
const VIP_API_KEY = process.env.VIP_API_KEY || '';     

function generateSign(apiId, apiKey) {
    return crypto.createHash('md5').update(apiId + apiKey).digest('hex');
}
const VIP_URL = 'https://vip-reseller.co.id/api/game-feature'; 

const apiKeys = [
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
    process.env.GROQ_API_KEY_5
].filter(Boolean);

function getGroqClient() {
    if (apiKeys.length === 0) return new Groq({ apiKey: process.env.GROQ_API_KEY });
    return new Groq({ apiKey: apiKeys[Math.floor(Math.random() * apiKeys.length)] });
}

// ==========================================
// 4. MAIN MESSAGE HANDLER TUNGGAL (SATU FILE)
// ==========================================
async function handleMessage(sock, msg) {
    if (msg.key.fromMe) return;
    const from = msg.key.remoteJid;
    if (!from || from === 'status@broadcast' || from.endsWith('@g.us')) return;
    if (from.includes(NOMOR_BOT)) return;

    const msgId = msg.key.id;
    if (globalProcessedMessageIds.has(msgId)) return;
    globalProcessedMessageIds.add(msgId);
    setTimeout(() => globalProcessedMessageIds.delete(msgId), 60000);

    const session = getSession(from);
    if (session.isProcessing) return;
    session.isProcessing = true;

    try {
        const type = Object.keys(msg.message || {})[0];
        if (!type) return;

        const isImage = (type === 'imageMessage' || (type === 'extendedTextMessage' && msg.message.extendedTextMessage.contextInfo?.quotedMessage?.imageMessage));
        
        let body = '';
        if (type === 'conversation' && msg.message.conversation) {
            body = msg.message.conversation;
        } else if (type === 'extendedTextMessage' && msg.message.extendedTextMessage.text) {
            body = msg.message.extendedTextMessage.text;
        } else if (type === 'imageMessage' && msg.message.imageMessage.caption) {
            body = msg.message.imageMessage.caption;
        }

        const lowerBody = body.toLowerCase().trim();

        // A. PENANGANAN GAMBAR MASUK
        if (isImage) {
            const downloadedMessage = type === 'imageMessage' ? msg : { key: msg.key, message: msg.message.extendedTextMessage.contextInfo.quotedMessage };
            const buffer = await downloadMediaMessage(downloadedMessage, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
            const base64Image = buffer.toString('base64');
            const groq = getGroqClient();

            if (session.step === 'ASKING_PROOF') {
                await sock.sendMessage(from, { text: 'sebentar, gw cek buktinya...' }, { quoted: msg });
                
                const visionComp = await groq.chat.completions.create({
                    messages: [
                        { role: 'system', content: 'Analisis bukti transfer DANA ke 083142628969 a.n Muhamad Sodikin tahun 2026. Jawab "VALID" atau "PALSU".' },
                        { role: 'user', content: [
                            { type: 'text', text: 'Valid?' },
                            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                        ]}
                    ],
                    model: 'qwen/qwen3.8-27b',
                    max_tokens: 15,
                    temperature: 0.1
                });

                const verdict = visionComp.choices[0]?.message?.content || '';
                if (verdict.includes('VALID')) {
                    try {
                        const currentSign = generateSign(VIP_API_ID, VIP_API_KEY);
                        const orderParams = new URLSearchParams();
                        orderParams.append('api_id', VIP_API_ID);
                        orderParams.append('key', VIP_API_KEY);
                        orderParams.append('sign', currentSign);
                        orderParams.append('type', 'order');
                        orderParams.append('service', session.selectedItem.code);
                        orderParams.append('data_no', session.dataNo);

                        const orderResp = await axios.post(VIP_URL, orderParams);
                        const orderData = orderResp.data;

                        if (orderData && orderData.result) {
                            const trxid = orderData.data?.trxid || 'SUKSES';
                            await sock.sendMessage(from, { text: `transaksi sukses! item udah dikirim ke ${session.dataNo}. (TRX: ${trxid})` }, { quoted: msg });
                        } else {
                            await sock.sendMessage(from, { text: `gagal VIP: ${orderData?.message || 'sistem gangguan'}` }, { quoted: msg });
                        }
                    } catch (e) {
                        await sock.sendMessage(from, { text: 'error koneksi server VIP.' }, { quoted: msg });
                    }
                    userSessions[from] = { step: 'IDLE', selectedItem: null, dataNo: '', phoneNumber: session.phoneNumber, isProcessing: true };
                    return;
                } else {
                    await sock.sendMessage(from, { text: 'bukti transfer palsu atau tidak valid!' }, { quoted: msg });
                    return;
                }
            } else {
                const freeVision = await groq.chat.completions.create({
                    messages: [
                        { role: 'system', content: 'Kamu Muhamad Sodikin (owner Lapak Siqinz). Lihat gambar ini, tanggapi santai, gaul, pendek aja. JANGAN nanya balik.' },
                        { role: 'user', content: [
                            { type: 'text', text: body || 'Nih liat foto ini' },
                            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                        ]}
                    ],
                    model: 'qwen/qwen3.8-27b',
                    max_tokens: 40,
                    temperature: 0.6
                });
                const picReply = freeVision.choices[0]?.message?.content;
                if (picReply) await sock.sendMessage(from, { text: picReply }, { quoted: msg });
                return;
            }
        }

        // B. ALUR TRANSAKSI NATURAL
        if (session.step === 'ASKING_AMOUNT') {
            let matchedProduct = ffProducts.find(p => p.keywords.some(kw => lowerBody.includes(kw)));
            if (!matchedProduct) {
                const numbersOnly = lowerBody.replace(/[^0-9]/g, '');
                if (numbersOnly) matchedProduct = ffProducts.find(p => p.name.toLowerCase().includes(numbersOnly));
            }
            if (!matchedProduct) {
                await sock.sendMessage(from, { text: 'mau berapa dm emang? sebutin jumlahnya (contoh: 70 dm).' }, { quoted: msg });
                return;
            }
            session.selectedItem = matchedProduct;
            session.step = 'ASKING_ID';
            await sock.sendMessage(from, { text: `sip, ${session.selectedItem.name}. kirim ID game lu:` }, { quoted: msg });
            return;
        }

        if (session.step === 'ASKING_ID') {
            if (body.trim().length < 3) {
                await sock.sendMessage(from, { text: 'ID game nya kependekan, kirim yang bener.' }, { quoted: msg });
                return;
            }
            session.dataNo = body.trim();
            session.step = 'ASKING_PROOF';
            let finalPrice = session.selectedItem.basePrice + 3000;
            let msgPay = `produk: ${session.selectedItem.name}\ntujuan: ${session.dataNo}\ntotal: Rp ${finalPrice.toLocaleString('id-ID')}\n\ntransfer ke DANA: 083142628969 (Muhamad Sodikin)\n\nkirim foto bukti transfer kesini ya.`;
            await sock.sendMessage(from, { text: msgPay }, { quoted: msg });
            return;
        }

        if (session.step === 'IDLE' && (lowerBody.includes('beli') || lowerBody.includes('mau') || lowerBody.includes('topup') || lowerBody.includes('dm') || lowerBody.includes('harga')) && (lowerBody.includes('ff') || lowerBody.includes('free fire'))) {
            session.step = 'ASKING_AMOUNT';
            await sock.sendMessage(from, { text: 'mau beli berapa dm?' }, { quoted: msg });
            return;
        }

        // C. FULL AI REPLICA
        if (session.step === 'IDLE') {
            if (['p', 'ping', 'oy', 'woy', 'uy', 'assalamualaikum'].includes(lowerBody)) {
                await sock.sendMessage(from, { text: 'oy kunaon?' }, { quoted: msg });
                return;
            }

            const groq = getGroqClient();
            const comp = await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: `Kamu adalah Muhamad Sodikin (mahasiswa IT Pelita Bangsa 2026, owner Lapak Siqinz). Jawab obrolan natural, santai, Sunda tongkrongan Cikarang. JANGAN pernah pakai sapaan bot, JANGAN nanya balik, JANGAN bikin list. WAJIB kirim maksimal 1 kalimat pendek.` },
                    { role: 'user', content: body }
                ],
                model: 'qwen/qwen3.8-27b',
                max_tokens: 50,
                temperature: 0.7,
            });

            const reply = comp.choices[0]?.message?.content;
            if (reply) await sock.sendMessage(from, { text: reply }, { quoted: msg });
        }

    } catch (err) {
        console.error('Error Handler:', err);
    } finally {
        session.isProcessing = false;
    }
}

// ==========================================
// 5. BOT INITIALIZATION & EVENT LISTENER
// ==========================================
async function startBot() {
    const credsPath = path.join(SESSION_DIR, 'creds.json');

    // 🔥 HAPUS OTOMATIS SESI LAMA JIKA ADA SISA KORUP/DOUBLE, LALU BUAT FRESH
    if (process.env.SESSION_ID && !fs.existsSync(credsPath)) {
        try {
            // Bersihkan folder sesi lama jika ada di sekitar
            if (fs.existsSync('./sesi_lapak')) {
                fs.rmSync('./sesi_lapak', { recursive: true, force: true });
                console.log('🧹 Sesi lama ./sesi_lapak berhasil dibersihkan total!');
            }
            if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
            
            const decodedSession = Buffer.from(process.env.SESSION_ID, 'base64').toString('utf-8');
            fs.writeFileSync(credsPath, decodedSession);
            console.log('✅ SESSION_ID FRESH termuat dari Railway!');
        } catch (e) {
            console.error('Gagal load SESSION_ID:', e.message);
        }
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
            console.log('🎉 BOT BERHASIL TERSAMBUNG (SESI BERSIH)!');
            
            axios.get('https://api.ipify.org?format=json')
                .then(res => console.log(`🌐 [RAILWAY IP ACTIVE]: ${res.data.ip}`))
                .catch(() => console.log(`🌐 [RAILWAY IP]: Gagal cek IP.`));
            
            setTimeout(async () => {
                try {
                    if (fs.existsSync(credsPath)) {
                        const sessionKey = fs.readFileSync(credsPath).toString('base64');
                        console.log('\n========================================');
                        console.log('🔥 SESSION KEY LU (PASTE DI RAILWAY) 🔥');
                        console.log(sessionKey);
                        console.log('========================================\n');
                    }
                } catch (err) {}
            }, 3000);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg || !msg.message) continue;
            
            const msgTime = msg.messageTimestamp;
            const currentTime = Math.floor(Date.now() / 1000);
            if (currentTime - msgTime > 30) continue;

            try {
                await handleMessage(sock, msg); 
            } catch (err) {
                console.error('Error di message dispatcher:', err);
            }
        }
    });
}

startBot();
