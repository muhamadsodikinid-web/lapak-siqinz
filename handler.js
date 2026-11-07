const { Groq } = require('groq-sdk');
const axios = require('axios');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

// =====================================================================
// 🔑 1. PENGATURAN MULTI API KEY GROQ (ROTASI OTOMATIS ANTI LIMIT)
// =====================================================================
const apiKeys = [
    process.env.GROQ_API_KEY_1 || 'gsk_KUNCI_PERTAMA_LU',
    process.env.GROQ_API_KEY_2 || 'gsk_KUNCI_KEDUA_LU',
    process.env.GROQ_API_KEY_3 || 'gsk_KUNCI_KETIGA_LU',
    process.env.GROQ_API_KEY_4 || 'gsk_KUNCI_KEEMPAT_LU',
    process.env.GROQ_API_KEY_5 || 'gsk_KUNCI_KELIMA_LU'
];

// Fungsi cerdas memilih API key secara acak agar terhindar dari rate limit
function getGroqClient() {
    const activeKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
    return new Groq({ apiKey: activeKey });
}

// =====================================================================
// 🛒 2. PENGATURAN API VIP RESELLER (Ganti pakai data asli lu)
// =====================================================================
const VIP_API_ID = 'ISI_API_ID_LU';       // Contoh: '12345'
const VIP_API_KEY = 'ISI_API_KEY_LU';     // Contoh: 'abcdef...'
const VIP_SIGN = 'ISI_SIGN_LU';           // Contoh: MD5 Signature lu
const VIP_URL = 'https://vip-reseller.co.id/api/game-feature'; 

// =====================================================================
// 🚀 3. HANDLER UTAMA PENGHUBUNG WHATSAPP
// =====================================================================
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

        // =====================================================================
        // 4. FITUR COMMAND MENGGUNAKAN TITIK (.)
        // =====================================================================
        if (isCmd) {
            switch (command) {
                case 'menu':
                case 'help':
                    const menuText = `*🤖 BOT LAPAK SIQINZ (VIP SYSTEM)*\n\n` +
                    `_Chat aja langsung tanpa titik kalau mau ngobrol santai sama AI (Support Bahasa Sunda & Indonesia). Gunakan titik untuk alat bantu:_\n\n` +
                    `*🛒 MENU TOP UP & GAME:*\n` +
                    `1. .game (Daftar Game Tersedia)\n` +
                    `2. .harga [kategori] (Cek harga real-time dari VIP)\n\n` +
                    `*🔧 ALAT & INFORMASI:*\n` +
                    `3. .ping (Cek Kecepatan Server)\n` +
                    `4. .owner (Kontak Pemilik Bot)\n` +
                    `5. .sosmed (Akun Media Sosial)\n` +
                    `6. .yt (Channel YouTube)\n` +
                    `7. .info (Tentang Lapak Siqinz)\n` +
                    `8. .hitung [ekspresi] (Kalkulator Pintar)\n` +
                    `9. .jadwal (Jadwal Harian & Ngoding)\n` +
                    `10. .quotes (Kata Mutiara Motivasi)\n` +
                    `11. .donasi (Dukung Perkembangan Bot)\n` +
                    `12. .grup (Link Komunitas WA)\n` +
                    `13. .lapor [pesan] (Kirim Laporan Bug)\n` +
                    `14. .botwa (Info Jasa Pembuatan Bot)\n` +
                    `15. .spek (Spesifikasi Server Cloud)\n`;
                    await sock.sendMessage(from, { text: menuText }, { quoted: msg });
                    break;

                case 'game':
                    const listGame = `*🎮 DAFTAR KATEGORI GAME LAPAK SIQINZ*\n\n` +
                    `- Mobile Legends (ml)\n` +
                    `- Free Fire (ff)\n` +
                    `- PUBG Mobile (pubg)\n` +
                    `- Valorant (valo)\n\n` +
                    `_Cara cek harga: ketik .harga ml_`;
                    await sock.sendMessage(from, { text: listGame }, { quoted: msg });
                    break;

                case 'harga':
                    if (!text) return sock.sendMessage(from, { text: '❌ Masukkan kode gamenya bre! Contoh: .harga ml' }, { quoted: msg });
                    await sock.sendMessage(from, { text: '⏳ Sedang menarik data harga asli dari server pusat VIP...' }, { quoted: msg });
                    
                    try {
                        const response = await axios.post(VIP_URL, {
                            api_id: VIP_API_ID,
                            key: VIP_API_KEY,
                            sign: VIP_SIGN,
                            type: 'services',
                            filter_type: 'game',
                            filter_value: text
                        });

                        const resData = response.data;
                        if (!resData || !resData.result || !resData.data) {
                            return sock.sendMessage(from, { text: `❌ Game atau kategori "${text}" tidak ditemukan di server VIP bre.` }, { quoted: msg });
                        }

                        const dataProduk = resData.data;
                        let teksHarga = `*💎 DAFTAR HARGA ${text.toUpperCase()} (LAPAK SIQINZ)*\n\n`;
                        const limitProduk = dataProduk.slice(0, 20);

                        limitProduk.forEach((item, index) => {
                            const hargaAsli = parseInt(item.price);
                            const hargaJual = hargaAsli + 3000; // 🔥 AUTO MARKUP ADMIN 3.000 🔥
                            teksHarga += `${index + 1}. ${item.name}\n💰 Rp ${hargaJual.toLocaleString('id-ID')}\n\n`;
                        });

                        teksHarga += `_Kirim bukti transfer/struk kalau sudah bayar. AI otomatis akan mengecek validitas struknya!_`;
                        await sock.sendMessage(from, { text: teksHarga }, { quoted: msg });
                    } catch (e) {
                        console.log('Error API VIP:', e.message);
                        await sock.sendMessage(from, { text: '❌ Gagal terhubung ke server VIP Reseller. Periksa kembali API ID dan Key lu bre.' }, { quoted: msg });
                    }
                    break;

                // --- 15 FITUR PENDUKUNG ---
                case 'ping': 
                    await sock.sendMessage(from, { text: '🏓 PONG! Server Railway ngebut 24/7 tanpa jeda.' }, { quoted: msg }); 
                    break;
                case 'owner': 
                    await sock.sendMessage(from, { text: '👑 *Informasi Owner:*\nNama: Muhamad Sodikin\nKampus: S1 Teknik Informatika, Universitas Pelita Bangsa\nNo WA: wa.me/6283142628969' }, { quoted: msg }); 
                    break;
                case 'sosmed': 
                    await sock.sendMessage(from, { text: '📱 *Media Sosial Resmi:*\n- Instagram: @guaaqinz\n- TikTok: @lapaksiqinz.id / @jadiberbeda.id' }, { quoted: msg }); 
                    break;
                case 'yt': 
                    await sock.sendMessage(from, { text: '🎬 *Channel YouTube:\n- Rekap Yuk (Manga & Anime)\n- Guaaqinz\n- iQ-in' }, { quoted: msg }); 
                    break;
                case 'info': 
                    await sock.sendMessage(from, { text: 'Lapak Siqinz adalah asisten otomatisasi dan pusat layanan top-up game tepercaya yang beroperasi penuh 24 jam.' }, { quoted: msg }); 
                    break;
                case 'hitung': 
                    try { 
                        await sock.sendMessage(from, { text: `🧮 Hasil Kalkulasi: ${eval(text)}` }, { quoted: msg }); 
                    } catch(e) { 
                        await sock.sendMessage(from, { text: '❌ Format perhitungan salah bre! Contoh: .hitung 15000+3000' }, { quoted: msg }); 
                    }
                    break;
                case 'jadwal': 
                    await sock.sendMessage(from, { text: '📅 *Rutinitas Sodikin:*\n- Siang: Kuliah Teknik Informatika di Pelita Bangsa\n- Malam: Ngoding bot, kelola channel YouTube, & modif Beat Gen 2' }, { quoted: msg }); 
                    break;
                case 'quotes': 
                    await sock.sendMessage(from, { text: '💡 *Kata Bijak Hari Ini:*\n"Jangan kelamaan mikir buat mulai ngoding, karena bug paling seru itu pas dicari solusinya."' }, { quoted: msg }); 
                    break;
                case 'donasi': 
                    await sock.sendMessage(from, { text: '☕ *Dukung Kopi Admin:*\n- Dana / QRIS: 083142628969\n- Saweria: saweria.co/guaaqinz' }, { quoted: msg }); 
                    break;
                case 'grup': 
                    await sock.sendMessage(from, { text: '👥 Link grup komunitas Lapak Siqinz akan segera dibagikan oleh owner.' }, { quoted: msg }); 
                    break;
                case 'lapor': 
                    if(!text) return sock.sendMessage(from, { text: '❌ Mau lapor apa bre? Contoh: .lapor bot error di menu harga' }, { quoted: msg });
                    await sock.sendMessage('6283142628969@s.whatsapp.net', { text: `🚨 *LAPORAN BUG DARI USER:*\n${text}` });
                    await sock.sendMessage(from, { text: '✅ Laporan berhasil dikirim langsung ke WhatsApp owner!' }, { quoted: msg });
                    break;
                case 'botwa': 
                    await sock.sendMessage(from, { text: '🤖 Mau bikin bot WhatsApp custom sekeren ini? Langsung kontak owner ketik .owner' }, { quoted: msg }); 
                    break;
                case 'spek': 
                    await sock.sendMessage(from, { text: '🚀 *Spesifikasi Sistem:\n- Cloud Hosting: Railway 24/7\n- Engine: Node.js & Baileys\n- AI Engine: Groq Llama 3.3 (Multi-Key Rotation)' }, { quoted: msg }); 
                    break;

                default:
                    await sock.sendMessage(from, { text: '❌ Perintah tidak terdaftar bre. Ketik *.menu* buat lihat daftar fiturnya!' }, { quoted: msg });
                    break;
            }
            return; 
        }

        // =====================================================================
        // 5. SISTEM AI OTOMATIS (CHAT & VISION DENGAN ROTASI KUNCI)
        // =====================================================================
        await sock.sendPresenceUpdate('composing', from);

        try {
            const systemPrompt = `Kamu adalah asisten virtual / kloningan dari Muhamad Sodikin. 
Sodikin adalah mahasiswa S1 Teknik Informatika di Universitas Pelita Bangsa, tinggal di Cikarang Pusat, Bekasi. 
Sodikin mengelola channel YouTube Rekap Yuk dan bisnis Lapak Siqinz, serta hobi modif motor Honda Beat Gen 2.

🔥 ATURAN BAHASA SANGAT PENTING 🔥: 
Wajib sesuaikan bahasamu dengan bahasa orang yang mengirim pesan! 
- Jika dia chat menggunakan bahasa Sunda, KAMU WAJIB balas menggunakan bahasa Sunda tongkrongan yang akrab/santai (contoh: urang/maneh, euy, kumaha, jsb). 
- Jika dia pakai bahasa gaul Indonesia, balas pakai lu/gua yang asik.

TUGAS KHUSUS BACA GAMBAR / VISION: 
1. Jika user mengirim gambar biasa, deskripsikan gambarnya dengan santai dan natural ala anak muda.
2. JIKA GAMBAR ADALAH BUKTI TRANSFER / STRUK PEMBAYARAN, kamu WAJIB menganalisis dan membongkar data detailnya sebagai verifikasi admin:
   - Jam, Menit, Detik transaksi
   - Hari, Tanggal, Bulan, Tahun
   - Nama Pengirim
   - Nama Rekening / E-Wallet Tujuan (Sodikin / Lapak Siqinz)
   - Nominal Uang yang dikirim
   Berikan laporan verifikasi ini kepada user, dan sampaikan bahwa pesanan akan segera diproses oleh Sodikin jika data valid. Balas selengkap mungkin, JANGAN kaku!`;

            // Panggil klien Groq menggunakan sistem rotasi multi-key
            const groq = getGroqClient();

            if (isImage) {
                await sock.sendMessage(from, { text: '📸 Gambar/struk diterima! AI Lapak Siqinz lagi ngecek detailnya, tunggu sebentar bre...' }, { quoted: msg });
                
                const targetMessage = type === 'imageMessage' ? msg.message.imageMessage : msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
                const buffer = await downloadMediaMessage({ key: msg.key, message: msg.message }, 'buffer', { }, { reuploadRequest: sock.updateMediaMessage });
                const base64Image = buffer.toString('base64');
                const imageUrl = `data:image/jpeg;base64,${base64Image}`;

                const visionCompletion = await groq.chat.completions.create({
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: [
                            { type: 'text', text: body || 'Tolong cek dan verifikasi gambar ini secara detail bre.' },
                            { type: 'image_url', image_url: { url: imageUrl } }
                        ]}
                    ],
                    model: 'llama-3.2-11b-vision-preview', 
                    max_tokens: 1500,
                    temperature: 0.5,
                });
                
                const aiVisionResponse = visionCompletion.choices[0]?.message?.content;
                if (aiVisionResponse) {
                    await sock.sendMessage(from, { text: aiVisionResponse }, { quoted: msg });
                }

            } else {
                if (!body) return;
                
                const chatCompletion = await groq.chat.completions.create({
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: body }
                    ],
                    model: 'llama-3.3-70b-versatile', // Otak teks paling cerdas dan stabil
                    max_tokens: 1500,
                    temperature: 0.7,
                });
                
                const aiChatResponse = chatCompletion.choices[0]?.message?.content;
                if (aiChatResponse) {
                    await sock.sendMessage(from, { text: aiChatResponse }, { quoted: msg });
                }
            }

        } catch (err) {
            console.error('ERROR DARI GROQ AI:', err.message || err);
            await sock.sendMessage(from, { text: 'Waduh, server AI lagi sibuk atau limit kuota rotasi habis sebentar. Coba chat ulang ya bre!' }, { quoted: msg });
        }

    } catch (err) {
        console.error('Error Handler Utama:', err);
    }
};
