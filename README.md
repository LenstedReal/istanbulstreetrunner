# Istanbul Street Runner

İstanbul sokaklarında geçen sonsuz koşu oyunu. Android (Google Play), sürüm **2.0.1 (6)**, paket `com.lenstedreal.istanbulrunner`.

İstiklal'den Boğaz'a beş semt, her semt bir seviye. Tramvaydan kaç, simit arabasının üstünden atla, martıya simidini kaptırma.

## Yapı

| Klasör | İçerik |
|---|---|
| `frontend/` | Expo SDK 57, React Native, expo-router, three.js (expo-gl, WebGL2) — oyun ve arayüz |
| `frontend/src/game/` | Motor: sahne, render hattı (ACES, bloom), semtler, engeller, desenler, kalite profilleri |
| `backend/` | FastAPI + MongoDB (PyMongo Async): hesap, skor, anti-cheat, arkadaşlar, görevler, bulut kayıt |
| `docs/` | GitHub Pages: gizlilik, kullanım koşulları, lisanslar, hesap silme; `CHANGELOG_TR.md` |
| `scripts/` | Hukuk sayfası üretimi, MongoDB yedek/geri yükleme, göç, AAB doğrulama |
| `.github/workflows/` | `android-apk.yml` (tsc, lint, test → APK + AAB), `backend.yml` (pytest, gerçek MongoDB) |

## Geliştirme

```bash
# Sunucu
cd backend && pip install -r requirements-dev.txt
cp .env.example .env            # MONGO_URL ve DB_NAME
uvicorn server:app --reload --port 8001

# Oyun
cd frontend && npm ci
cp .env.example .env            # EXPO_PUBLIC_BACKEND_URL
npx expo run:android

# Testler
cd frontend && npm test && npx tsc --noEmit && npm run lint
cd backend && python -m pytest -q
```

## Yayın

- **APK / AAB**: `main`'e her push'ta GitHub Actions derler; imza anahtarları repo secret'larında.
- **Sunucu**: Render (`render.yaml`), `main`'den otomatik dağıtım. Ortam değişkenleri: `MONGO_URL`, `DB_NAME`, isteğe bağlı `ADMIN_SECRET`, `RESERVED_NICKNAMES`, `REVENUECAT_SECRET_KEY`.
- **Hukuk sayfaları**: `frontend/src/legal/legal.json` → `python scripts/build_legal_pages.py` → `docs/`.
- Ayrıntılı değişiklik günlüğü: [`docs/CHANGELOG_TR.md`](docs/CHANGELOG_TR.md).

## Lisans ve kaynaklar

Kod © LenstedReal. Kullanılan yazı tipleri, kütüphaneler ve müzikler için [lisanslar sayfası](https://lenstedreal.github.io/istanbulstreetrunner/licenses.html).

İletişim: contact.istanbulrunner@proton.me
