# Elektron test serveri: Amazon (AWS) serverga o'rnatish

Bu papka testni serverda ishlatish uchun kerak bo'lgan hamma narsani o'z ichiga oladi. Respondentlar testni havola orqali o'z telefoni yoki kompyuterida ishlaydi. Natijalar avtomatik ravishda serverga yig'iladi. Siz ularni administrator panelida ko'rasiz va Excel shabloni uchun CSV'ga chiqarasiz.

**Papka tarkibi:**

| Fayl | Vazifasi |
|---|---|
| `server.js` | Server (faqat Node.js kerak, qo'shimcha kutubxonalar yo'q) |
| `public/index.html` | Test sahifasi. Unda **to'g'ri javoblar yo'q**: ballni server hisoblaydi |
| `keys.json` | To'g'ri javoblar kaliti. **Repozitoriyga kiritilmagan** (`.gitignore`): uni serverga alohida yuklaysiz |
| `elektron-test.service` | Server o'chib-yonganda testni avtomatik ishga tushiruvchi xizmat fayli |
| `nginx.conf.example` | 80-port (va domen bo'lsa, HTTPS) uchun namunaviy sozlama |
| `data/` | Natijalar shu yerda saqlanadi (`results.json`, `config.json`). Server birinchi marta ishga tushganda yaratiladi |

Quyidagi qo'llanma **EC2, Ubuntu 22.04 yoki 24.04** uchun yozilgan. Amazon Linux bo'lsa, farqli buyruqlar alohida ko'rsatilgan.

---

## 1. Portni ochish (AWS konsolida)

EC2 → Instances → serveringiz → **Security** → Security group → **Edit inbound rules**:

- `HTTP`, port **80**, Source: `0.0.0.0/0` (Nginx orqali ishlatish uchun);
- domen va HTTPS bo'lsa, `HTTPS`, port **443**;
- Nginx'siz tezkor sinov uchun vaqtincha `Custom TCP`, port **3000** ochiladi. Ishni tugatgach, uni yoping.

## 2. Kodni serverga olish

Serverda:

```bash
sudo apt update && sudo apt install -y git
git clone https://github.com/KomronRaximov/testplatform.git ~/elektron-test
cd ~/elektron-test
```

Javoblar kaliti (`keys.json`) repozitoriyda yo'q, chunki repozitoriy ochiq bo'lsa, javoblarni hamma ko'rib qoladi. Uni o'z kompyuteringizdan alohida yuklang (`key.pem` – EC2 kaliti, `1.2.3.4` – server IP manzili):

```bash
scp -i key.pem keys.json ubuntu@1.2.3.4:~/elektron-test/
```

Kodni keyinroq yangilash: `cd ~/elektron-test && git pull && sudo systemctl restart elektron-test`

## 3. Node.js o'rnatish (18 yoki undan yangi versiya)

```bash
node -v   # 18 yoki undan yuqori bo'lsa, bu qadamni o'tkazib yuboring
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Amazon Linux 2023 uchun: `sudo dnf install -y nodejs`

## 4. Tezkor sinov

```bash
ADMIN_PIN='KuchliParol2026' node server.js
```

Brauzerda `http://1.2.3.4:3000` ni oching (3000-port vaqtincha ochiq bo'lishi kerak). Test ochilsa, `Ctrl+C` bilan to'xtating.

`ADMIN_PIN` – administrator paneliga kirish paroli, **kamida 6 ta belgi**. Undan qisqa bo'lsa, server ishga tushmaydi.

## 5. Doimiy ishlatish (server qayta yonganda ham)

1. `elektron-test.service` faylida `ADMIN_PIN` qiymatini o'z parolingizga almashtiring. Foydalanuvchi `ubuntu` bo'lmasa, `User` va papka yo'llarini ham tuzating:
   ```bash
   nano elektron-test.service
   ```
2. Xizmatni o'rnating va yoqing:
   ```bash
   sudo cp elektron-test.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now elektron-test
   sudo systemctl status elektron-test      # "active (running)" chiqishi kerak
   ```

## 6. 80-port orqali chiqarish (Nginx)

```bash
sudo apt install -y nginx
sudo cp nginx.conf.example /etc/nginx/sites-available/elektron-test
sudo ln -s /etc/nginx/sites-available/elektron-test /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Endi test manzili: **`http://1.2.3.4`**. Shu havolani respondentlarga yuborasiz. 3000-portni Security group'da yopib qo'ying.

### Domeningiz bo'lsa: HTTPS (tavsiya etiladi)

Testda respondentlarning ism-familiyasi yuboriladi, shuning uchun shifrlangan ulanish (HTTPS) yaxshiroq. Domenning A yozuvini server IP manziliga yo'naltiring, `nginx.conf.example` dagi `server_name` qatoriga domenni yozing va quyidagilarni bajaring:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d test.sizningdomen.uz
```

## 7. Ishlatish

- **Respondentlar** havolani ochadi, familiya va ismini kiritib testni ishlaydi. Yakunda «Natijangiz serverga yuborildi» degan yozuv chiqadi. Internet uzilib qolsa, javoblar telefonda saqlanadi va «Qayta yuborish» tugmasi paydo bo'ladi.
- **Siz** sahifadagi «Sinov o'tkazuvchi paneli» tugmasini bosib, `ADMIN_PIN` ni kiritasiz. Panelda barcha natijalar, statistik tahlil (P, r_pb, D, KR-20) va sozlamalar bor. Sozlamalar (test vaqti, aralashtirish va boshqalar) serverda saqlanadi va hamma respondentga birdek ta'sir qiladi.
- **CSV** tugmasi natijalarni `Test_tahlili_shablon.xlsx` uchun yuklab beradi.

## 8. Zaxira va xizmat

```bash
# natijalarni o'z kompyuteringizga ko'chirish
scp -i key.pem ubuntu@1.2.3.4:~/elektron-test/data/results.json .

sudo systemctl restart elektron-test    # PIN o'zgartirilgandan keyin
sudo journalctl -u elektron-test -n 50  # xatolarni ko'rish
```

Paneldagi «Barchasini o'chirish» tugmasi bosilganda server avval `data/` papkasiga zaxira nusxa (`results_backup_*.json`) saqlaydi.

## Xavfsizlik bo'yicha eslatmalar

- `keys.json` faylini hech kimga bermang va `public/` papkasiga ko'chirmang.
- PIN ni faqat o'zingiz biling. 10 daqiqa ichida 10 marta noto'g'ri PIN kiritilgan IP manzil vaqtincha bloklanadi.
- Sinov tugagach, natijalarni yuklab oling va xohlasangiz, xizmatni to'xtating: `sudo systemctl disable --now elektron-test`.
