const { Groq } = require('groq-sdk');
const axios = require('axios');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

// API KEY GROQ LU
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY }); 

// ==========================================
// PENGATURAN API VIP RESELLER
// ==========================================
const VIP_API_KEY = 'API_KEY_VIP_LU_DISINI'; 
const VIP_MERCHANT = 'MERCHANT_ID_LU'; 
const VIP_URL = 'https://vip-reseller.co.id/api/game-feature'; 

module.exports = async (sock, msg) => {
    try {
        const from = msg.key.remoteJid;
        if (msg.key.fromMe || from === 'status@broadcast') return;

        const type = Object.keys(msg.message)[0];
        const isImage = (type === 'imageMessage' || (type === 'extendedTextMessage' && msg.message.extendedTextMessage.contextInfo?.quotedMessage?.imageMessage));
        
        let body = '';
        if (type === 'conversation' && msg.message.conversation) {
            body = msg.message.conversation;
        } else if (type === 'extendedTextMessage' && msg.message.extendedTextMessage.text) {
            body = msg.message.extendedTextMessage.text;
        } else if (type === 'imageMessage' && msg.message.imageMessage.caption) {
            body = msg.message.imageMessage.caption;
        }

        const prefix = '.';
        const isCmd = body && body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '';
        const args = body ? body.trim().split(/ +/).slice(1) : [];
        const text = args.join(' ');

        // ==========================================
        // 1. FITUR VIP RESELLER (COMMAND TITIK)
        // ==========================================
        if (isCmd) {
            switch (command) {
                case 'menu':
                case 'help':
                    const menuText = `*🤖 MESIN LAPAK SIQINZ (VIP)*\n\n` +
                    `_Kirim pesan/gambar langsung buat ngobrol sama AI. Alat khusus pakai titik:_\n\n` +
                    `*🛒 MENU TOP UP:*\n` +
                    `1. .game (List Game VIP)\n` +
                    `2. .harga [kategori] (Cek harga, cth: .harga ml)\n\n` +
                    `*🔧 ALAT LAIN:*\n` +
                    `3. .ping (Cek server)\n` +
                    `4. .owner (Nomor owner)\n`;
                    await sock.sendMessage(from, { text: menuText }, { quoted: msg });
                    break;

                case 'game':
                    const listGame = `*🎮 DAFTAR GAME LAPAK SIQINZ*\n\n` +
                    `- Mobile Legends (ml)\n` +
                    `- Free Fire (ff)\n` +
                    `- PUBG Mobile (pubg)\n` +
                    `- Valorant (valo)\n\n` +
                    `_Ketik *.harga [kode]* untuk cek harga_`;
                    await sock.sendMessage(from, { text: listGame }, { quoted: msg });
                    break;

                case 'harga':
                    if (!text) return sock.sendMessage(from, { text: 'Masukkan kode gamenya bre. Cth: .harga ml' }, { quoted: msg });
                    
                    await sock.sendMessage(from, { text: '⏳ Sedang menarik data harga dari server VIP...' }, { quoted: msg });
                    
                    try {
                        // SIMULASI HASIL DARI VIP RESELLER
                        const dataProduk = [
                            { name: '86 Diamonds', price: 25000 },
                            { name: '172 Diamonds', price: 50000 },
                            { name: '257 Diamonds', price: 75000 }
                        ];

                        let teksHarga = `*💎 HARGA ${text.toUpperCase()} HARI INI*\n\n`;
                        dataProduk.forEach((item, index) => {
                            // 🔥 MARKUP ADMIN 3.000 PER ITEM 🔥
                            const hargaJual = item.price + 3000; 
                            teksHarga += `${index + 1}. ${item.name}\n💰 Rp ${hargaJual.toLocaleString('id-ID')}\n\n`;
                        });
                        teksHarga += `_Kirim bukti transfer jika sudah membayar. AI otomatis bakal verifikasi struk lu!_`;

                        await sock.sendMessage(from, { text: teksHarga }, { quoted: msg });
                    } catch (e) {
                        await sock.sendMessage(from, { text: '❌ Gagal narik data dari server VIP bre.' }, { quoted: msg });
                    }
                    break;

                default:
                    await sock.sendMessage(from, { text: 'Perintah kaga ada bre. Ketik *.menu* !' }, { quoted: msg });
                    break;
            }
            return; 
        }

        // ==========================================
        // 2. SISTEM AI (TEKS PAKE QWEN, MATA PAKE VISION)
        // ==========================================
        await sock.sendPresenceUpdate('composing', from);

        try {
            const systemPrompt = `Kamu adalah asisten virtual Muhamad Sodikin (Mahasiswa IT Pelita Bangsa, Cikarang, owner Lapak Siqinz & channel Rekap Yuk, hobi modif motor Beat Gen 2).
ATURAN BAHASA: 
- Jika user bahasa Sunda, balas Sunda tongkrongan.
- Jika Indonesia, balas pakai lu/gua santai.
TUGAS BACA GAMBAR: 
1. Jika gambar biasa, deskripsikan santai.
2. JIKA GAMBAR BUKTI TRANSFER/STRUK, wajib baca teliti & verifikasi:
   - Jam, Menit, Detik
   - Tanggal komplit
   - Nama Pengirim & Tujuan (Sodikin/Lapak Siqinz)
   - Nominal Uang
   Beritahu pembeli bahwa pesanan segera diproses jika data ini valid. Balas lengkap, JANGAN kaku!`;

            if (isImage) {
                // FITUR BACA STRUK & GAMBAR (Vision)
                await sock.sendMessage(from, { text: '📸 Bentar bre, gua cek dulu gambarnya/struknya...' }, { quoted: msg });
                
                const targetMessage = type === 'imageMessage' ? msg.message.imageMessage : msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
                const buffer = await downloadMediaMessage({ key: msg.key, message: msg.message }, 'buffer', { }, { reuploadRequest: sock.updateMediaMessage });
                
                const base64Image = buffer.toString('base64');
                const imageUrl = `data:image/jpeg;base64,${base64Image}`;

                // Groq hanya support llama untuk vision saat ini
                const visionCompletion = await groq.chat.completions.create({
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: [
                            { type: 'text', text: body || 'Cek gambar ini secara detail bre.' },
                            { type: 'image_url', image_url: { url: imageUrl } }
                        ]}
                    ],
                    model: 'llama-3.2-11b-vision-preview', 
                    max_tokens: 1500,
                    temperature: 0.5,
                });

                const aiResponse = visionCompletion.choices[0]?.message?.content;
                await sock.sendMessage(from, { text: aiResponse }, { quoted: msg });

            } else {
                // 🔥 FITUR CHAT TEKS (PAKAI QWEN SESUAI REQUEST LU) 🔥
                if (!body) return;
                
                const chatCompletion = await groq.chat.completions.create({
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: body }
                    ],
                    model: 'qwen-2.5-32b-it', // Otak Qwen (Cepat & Pinter)
                    max_tokens: 1500,
                    temperature: 0.7,
                });
                
                const aiResponse = chatCompletion.choices[0]?.message?.content;
                await sock.sendMessage(from, { text: aiResponse }, { quoted: msg });
            }

        } catch (err) {
            console.log('Error AI:', err);
            await sock.sendMessage(from, { text: 'Waduh, server AI lagi sibuk bre, sabar bentar ya.' }, { quoted: msg });
        }

    } catch (err) {
        console.log('Error Handler:', err);
    }
};
