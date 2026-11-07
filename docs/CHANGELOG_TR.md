# Istanbul Street Runner 2.0.0 — Değişiklik Raporu

| | |
|---|---|
| Uygulama adı | **Istanbul Street Runner** (eski: Istanbul Runner) |
| Paket kimliği | `com.lenstedreal.istanbulrunner` (değişmedi) |
| Sürüm | **2.0.0**, versionCode **5** (önceki: 1.0.3 / 4) |
| Dal | `v2` (CI yeşil olunca `main`'e alınır) |
| Rapor tarihi | 4 Kasım 2026 |

Bu raporda hiçbir API anahtarı, şifre, bağlantı adresi veya imzalama bilgisi yoktur.

---

## 1. Commit'ler (her biri ayrı geri alınabilir)

| Commit | İçerik |
|---|---|
| `0dd018f` | CI: MongoDB ile backend testleri, frontend kalite işi, AAB manifest denetimi |
| `09bca9f` | Backend 2.0: token kimlik, herkese açık kimlik, koşu doğrulama, takma ad denetimi, hesap silme |
| `1686672` | Betikler: veritabanı yedek/geri yükleme, 2.0 geçişi, yönetici araçları |
| `1d660a8` | Grafik 2.0: kalite profilleri, render hattı, semtler, yeni engeller ve güçlendiriciler |
| `5235902` | Türkçe/İngilizce arayüz ve oyun içi yasal sayfalar |
| `e4eefe8` | İstemci 2.0: güvenli hesap, koşu oturumu, bulut kaydı, görevler, dükkân |
| `9c7f55b` | Sürüm 2.0.0 (5): uygulama adı, Play politika düzeltmeleri |

Geri alma: `git revert <commit>`; sürüm commit'i geri alınırsa uygulama 1.0.3 kimliğine döner.

---

## 2. Grafik ve oyun motoru

**Kalite profilleri** (`frontend/src/game/quality/profiles.ts`): Ultra, Yüksek, Orta, Düşük, Çok düşük ve **Otomatik**.
Otomatik mod ilk koşunun 2.–10. saniyelerinde FPS ölçer ve profili seçer; ölçümden önce Orta kullanılır.

| Profil | İç çözünürlük (kısa kenar) | Gölge | Son işlem | Görüş mesafesi |
|---|---|---|---|---|
| Ultra | 1080 px | 2048 | Bloom + MSAA 4× + grenli renk | 220 m |
| Yüksek | 900 px | 1024 | Bloom + renk ayarı | 190 m |
| Orta | 720 px | 1024 | Renk ayarı + vinyet | 170 m |
| Düşük | 540 px | yok | Renk ayarı + vinyet | 150 m |
| Çok düşük | 420 px | yok | yok | 120 m, 30 FPS |

- **Dinamik çözünürlük** (`quality/scale.ts`): kare süresi hedefi aşarsa iç çözünürlük %10 adımlarla profilin tabanına kadar düşer, rahatlayınca geri çıkar.
- **FPS sınırı**: 30 / 60; 120 Hz ekranda 60 FPS sınırı doğru çalışır.
- **Sabit zaman adımı** (`timestep.ts`): fizik ve çarpışma her cihazda 1/120 s adımlarla aynı davranır.
- **Render hattı** (`render/pipeline.ts`): sahne bir render hedefine çizilir, tek tam ekran geçişte ACES ton eşleme, sRGB çıkış, renk ayarı, vinyet, gren, çarpma flaşı ve (Yüksek/Ultra) bloom uygulanır. Üçüncü karede ekranın ortası okunur; görüntü gelmediyse oyun otomatik olarak doğrudan çizime döner ve o profil "güvensiz" olarak işaretlenip bir alt profile inilir.
- **Çizim çağrısı azaltma** (`merge.ts`): sokak parçaları ~90 çağrıdan ~13'e, tramvay 33'ten 3'e indi; altınlar tek instanced mesh.
- **Gölgeler**: canlı açma Expo GL'de çöktüğü için (bilinen `drawBuffers` hatası) gölge açma ve kalite değişikliği ana menüde GL görünümü yeniden kurularak uygulanır. Kapatma anında uygulanır.

**Semtler** (`districts.ts`, `world.ts`): Beyoğlu·İstiklal, Karaköy·Galata, Eminönü·Sirkeci, Galata Köprüsü, Boğaz kıyısı·Ortaköy. Her birinin gökyüzü, sis, ışık, bina renkleri, cumba/balkon/kubbe oranı, sokak dokusu, deniz ya da korkuluk kenarı ve ufuk silueti (Galata Kulesi, cami, Haliç, asma köprü) ayrıdır.

**Yeni engeller (13)**: dondurmacı, sokak kedisi, balık kasaları, çiçekçi arabası, güvercinler, hamal, seyyar tabla, olta misinaları, yem kovaları, otobüs, kumpir standı, scooter, bank. Tramvay, otobüs ve scooter oyuncuya doğru gelir (32 m'den itibaren).
**Eski 5 engelin çarpışma kutuları 1.0 ile birebir aynı** (birim testle korunuyor).

**Yeni mekanikler**:
- Martı Kanadı: 7 sn uçuş, gökyüzünde altın hattı.
- Uçan Halı: 9 sn süzülme, alçak engelleri aşar, bir çarpmayı karşılar.
- Sendeleme: şerit değiştirirken engelin yanına sürtünce oyun bitmez, 8 sn martı peşine düşer; bu sürede ikinci sürtünme oyunu bitirir.
- Vapur jetonu: her koşuda en fazla bir parça; bir semtte 3 parça sıradaki semti açar (İskele ekranı).
- İlk karşılaşma ipuçları, altın parıltıları, koşucu kıyafetleri (4 koşucu, şapka, ceket, ayakkabı).
- Engel sıraları tohumlu rastgele sayı üretecinden gelir; 10.000 sıralık testte her sıra adil (en az bir geçilebilir şerit).

Korunan mekanikler: şerit, zıplama, eğilme, mıknatıs, x2, kalkan, anahtar, 1-2-4-8-16 anahtarla devam, en fazla 5 devam, reklamla devam, duraklatma, Ayarlar'dan dönünce koşunun sürmesi, menü animasyonu.

---

## 3. Hesap, sıralama ve backend

- **Hesap güvenliği**: 2.0 istemci ilk açılışta eski profili (oyuncu kimliği + arkadaş kodu) bir kez sahiplenir ve telefonda SecureStore'da tutulan bir oturum anahtarı alır. Sunucuda anahtarın yalnızca SHA-256 özeti tutulur. Sıralamada artık gerçek oyuncu kimlikleri ve arkadaş kodları görünmez; rastgele herkese açık kimlik kullanılır.
- **Mevcut oyuncular korunur**: hiçbir hesap, arkadaş kodu, skor, altın veya arkadaşlık silinmez. 1.0.x istemciler sahiplenilmemiş hesaplarla çalışmaya devam eder; sahiplenilmiş hesaba eski sürümden yazma "uygulamayı güncelle" mesajı verir.
- **Aynı hesap iki telefonda**: ikinci telefon "Hesap başka bir cihazda" ekranı görür: aktarma kodu (24 saat, tek kullanımlık) ya da yeni profil.
- **Hile önleme**: her koşu sunucudan alınan bir oturumla başlar; süre, mesafe, skor, altın ve devam sayısı fiziksel sınırlarla karşılaştırılır. Doğrulanmayan koşu sıralamaya girmez; 3 işaretten sonra oyuncu sıralamadan gizlenir. Eski sürüm için 250.000 skor tavanı ve sıklık sınırı.
- **Çevrimdışı koşu**: en fazla 5 koşu 3 saate kadar kuyrukta bekler, bağlantı gelince gönderilir. Sonuç ekranı "sıralamaya eklendi / gönderilecek / doğrulanamadı" der.
- **Bulut kaydı**: anahtarlar, harcanan/kazanılan altın, semt ilerlemesi ve kıyafetler hesapla telefonlar arasında taşınır; çakışmada birleştirilir.
- **Hoş geldin paketi**: 50 anahtar artık sunucu üzerinden bir kez verilir (`REVENUECAT_SECRET_KEY` tanımlıysa abonelik sunucuda da doğrulanır).
- **Arkadaşlar**: çevrimiçi rozeti (ayar kapatılabilir), engelleme, takma ad şikâyeti; arkadaş listesi sınırı 200.
- **Takma ad denetimi**: Türkçe karakter ve leetspeak dönüşümleriyle küfür/hakaret ve ayrılmış adlar engellenir.
- **Hesap silme**: oyun içinden ve e-postayla; sunucudaki tüm hesap verileri silinir.
- **Sağlık uçları**: `/health` (veritabanına dokunmaz, Render için) ve `/ready`.
- **Hız sınırları**: IP ve işlem başına (oyuncu oluşturma, sahiplenme, arkadaş ekleme, koşu, şikâyet vb.).
- **Sürücü**: kullanımdan kalkan Motor yerine PyMongo Async API (`pymongo==4.18.2`).

Plandan sapma: hesap silinince ödül defteri (ledger) kayıtları anonimleştirilmek yerine tamamen silinir. Bu, aynı kişinin yeni hesapla hoş geldin paketini tekrar alabilmesi anlamına gelir; kabul edilebilir küçük bir risk.

---

## 4. Reklam, abonelik ve politika

- **UMP onayı** reklam SDK'sından önce alınır; AdMob ölçümü onaydan sonra başlar (`delayAppMeasurementInit`). AB kullanıcıları için Ayarlar → Gizlilik → Reklam gizlilik seçenekleri.
- **Test reklamları**: CI derlemeleri varsayılan olarak Google test reklamı gösterir. Play'e gidecek derlemede GitHub değişkeni `EXPO_PUBLIC_ADS_TEST_MODE` = `0` yapılır.
- **Ara reklam**: yalnızca oyun bitince ve reklam zaten yüklenmişse; yüklenmemişse bir sonraki oyun sonuna kalır, oyuncu beklemez.
- **Abonelik**: fiyat Google Play'den okunur (sabit "199 ₺" kaldırıldı), otomatik yenileme ve iptal metni gösterilir, hata mesajları sadeleşti, bitiş tarihi izlenir, satın alımlar oyuncu hesabına bağlanır (`Purchases.logIn`).
- **İzinler**: RECORD_AUDIO, SYSTEM_ALERT_WINDOW, depolama, biyometrik ve FOREGROUND_SERVICE_MEDIA_PLAYBACK engellendi; expo-audio'nun medya servis kaydı manifestten çıkarıldı. CI, AAB'de bu izinleri ve servisi bulursa derlemeyi kırmızıya çevirir.
- **Gizlilik politikası, kullanım koşulları, lisanslar ve kaynaklar, hesap silme**: oyunda Ayarlar → Gizlilik altında TR/EN; aynı metinlerden `docs/` web sayfaları üretilir (`scripts/build_legal_pages.py`).

---

## 5. Değişen ve eklenen dosyalar

**Backend**: `backend/server.py`, `backend/app/` (main, config, db, deps, models, services, security, anticheat, moderation, missions, ratelimit, revenuecat, routes_legacy, routes_v2), `requirements*.txt`, `pytest.ini`, `tests/unit`, `tests/api`, `tests/legacy_remote`, `.env.example`.

**Betikler**: `scripts/backup_mongo.py`, `restore_mongo.py`, `migrate_v2.py`, `admin_tools.py`, `verify_aab.py`, `build_legal_pages.py`.

**Oyun motoru**: `frontend/src/game/engine.ts`, `world.ts`, `objects.ts`, `runner.ts`, `constants.ts`; yeni `districts.ts`, `patterns.ts`, `merge.ts`, `rng.ts`, `timestep.ts`, `quality/profiles.ts`, `quality/scale.ts`, `render/pipeline.ts`.

**İstemci**: `src/api.ts`, `src/profile.tsx`, `src/subscription.ts`, `src/ads/*`; yeni `src/cloudsave.ts`, `src/progress.ts`, `src/wardrobe.ts`, `src/i18n/*`, `src/legal/*`.

**Ekranlar**: `app/index.tsx`, `app/settings.tsx`, `app/leaderboard.tsx`, `app/_layout.tsx`; yeni `app/pier.tsx`, `shop.tsx`, `missions.tsx`, `privacy.tsx`, `terms.tsx`, `licenses.tsx`, `delete-account.tsx`.

**Bileşenler**: MainMenu, Hud, GameOverSheet, ReviveSheet, IntroOverlay, TutorialOverlay, error-boundary; yeni Toast, LegalScreen, ScreenHeader.

**Yapılandırma**: `frontend/app.json`, `package.json`, `package-lock.json` (yalnız sürüm alanı), `tsconfig.json`, `.env.example`, yeni `plugins/withAndroidManifestCleanup.js`, `.github/workflows/android-apk.yml`, `.github/workflows/backend.yml`, `.gitignore`.

**Web**: `docs/privacy-policy.html` (yeniden yazıldı), yeni `terms.html`, `licenses.html`, `delete-account.html`, `index.html`.

Bağımlılık eklenmedi veya güncellenmedi (yalnız backend'de Motor → PyMongo).

---

## 6. Test sonuçları

Bu ortamda **çalıştırılan** testler:

| Test | Sonuç |
|---|---|
| Backend birim testleri (moderation, anticheat, security, missions) | 59/59 geçti |
| Backend uç senaryoları (sahte Mongo ile tüm v1/v2 rotaları) | 0 hata |
| Frontend birim testleri (`npm test`: RNG, zaman adımı, 10.000 adil sıra, çarpışma kutuları, kalite profilleri, dinamik çözünürlük, jeton ilerlemesi, dükkân, bulut kaydı birleştirme, koşu kuyruğu, TR/EN anahtar eşleşmesi, kodda kullanılan her anahtar, yasal metin yapısı) | 22/22 geçti |
| Oyun motoru tür denetimi (three.js için gevşek tür tanımıyla) | 0 hata |
| Arayüz tür denetimi (yerel kütüphaneler için gevşek tür tanımıyla) | kendi kodumuzda hata yok |
| GitHub Actions dosyaları (`actionlint`) | geçti |
| Manifest temizleme eklentisi (taklit config-plugins ile) | servis `tools:node="remove"` ile çıkarılıyor |
| AAB denetleyici (`verify_aab.py`) 1.0.3 AAB üzerinde | 7 yasaklı izni ve medya servisini doğru buldu |
| Web gizlilik sayfası 390 px genişlikte | taşma yok |

**Yalnızca CI'da çalışacak** testler (gerçek bağımlılıklar gerekli): backend API testleri gerçek MongoDB 7 ile, `tsc --noEmit`, `expo lint`, gerçek three.js ile sahne kurma testleri (5 test: her engel, güçlendirici, martı, her koşucu görünümü, her semt × her detay seviyesi, geometri birleştirme), APK + AAB derlemesi ve AAB manifest denetimi.

**Yapılmayan testler**: gerçek Android cihazda oynanış, FPS, render hattı öz-testi, reklam ve abonelik akışları test edilmedi. AdMob, RevenueCat, Play Console, MongoDB Atlas ve Render panellerine erişimim yok; bunlardaki ayarlar doğrulanmadı.

---

## 7. Kalan riskler

1. **Render hattı yalnızca cihazda doğrulanabilir.** Expo GL'de render hedefi gölge haritasıyla zaten kullanılıyor, yine de bir sürücü uyumsuzsa öz-test doğrudan çizime döner. Ultra'daki MSAA en riskli kısım (yalnız elle seçilince açılır).
2. **Sokak parçası yeniden birleştirme** her ~2 saniyede bir yapılır; çok zayıf telefonlarda kısa takılma olabilir. Çok düşük profil detayı azaltır.
3. ~~**NCS müzikleri**: NCS kuralları oyunlarda ticari kullanım için ayrı lisans istiyor.~~ **2.0.1'de kapandı:** NCS parçaları çıkarıldı, oyunda yalnızca LenstedReal'in özgün müzikleri var (bkz. §15).
4. **KVKK**: yurt dışına aktarım için standart sözleşmenin imzalanıp 5 iş günü içinde Kurul'a bildirilmesi gerekir (politika metni buna dayanıyor).
5. **Render ücretsiz plan**: 15 dk sonra uyur, ilk istek ~1 dk sürebilir. Oyun "sunucu uyanıyor" gösterir ve beklemeden oynatır; kalıcı çözüm Starter planı.
6. **Uçuş, halı ve sendeleme dengesi** cihazda oynanarak ayarlanmalı.
7. Repodaki `.gitconfig` kişisel ad ve e-posta içeriyor; istersen kaldır.
8. Atlas veritabanı şifresini değiştirmen önerilmişti.

---

## 8. Yayın adımları (sırayla)

1. `v2` dalını gönder → GitHub Actions: backend testleri + APK/AAB.
2. APK'yı telefona kur, kontrol listesine göre dene (test reklamları açık).
3. Yayından önce veritabanı yedeği al (bağlantı adresini yalnız kendi terminalinde `MONGO_URL` olarak ver): `python3 scripts/backup_mongo.py`. Geçiş isteğe bağlı: API herkese açık kimlikleri zaten gerektiğinde ekler; toplu eklemek için `python3 scripts/migrate_v2.py` (kuru çalıştırma) → `--apply`. Geri dönüş için `--rollback --yes`.
4. `v2`'yi `main`'e birleştir → Render backend 2.0'ı yayınlar. 1.0.x kullanıcılar çalışmaya devam eder.
5. GitHub Pages: Settings → Pages → Branch `main`, klasör `/docs`. Play Console'da gizlilik ve hesap silme bağlantılarını bu sayfalarla güncelle.
6. Play'e göndermeden önce GitHub değişkeni `EXPO_PUBLIC_ADS_TEST_MODE` = `0`, yeni derleme al.
7. Play Console: veri güvenliği formunu politika metnine göre güncelle (hesap verileri, oyun içi etkileşimler, reklam kimliği, satın alma geçmişi), hedef kitle 13+.
8. app-ads.txt: geliştirici web sitesi alan adının köküne (örn. `LenstedReal.github.io` deposu) şu satır: `google.com, pub-4558868217074430, DIRECT, f08c47fec0942fa0`.

---

## 9. Lint düzeltmeleri ve "Oyunu değerlendir" (ek commit)

- CI'daki `expo lint` (React Compiler kuralları) 11 hata vermişti; bu ortamda ESLint çalıştırılamadığı için ilk gönderimde yakalanmadı. Düzeltilenler:
  - render sırasında ref'e yazma (`profile.tsx`, `app/index.tsx`) → commit sonrası güncellenir;
  - kaydırma hareketi ref'i bir fonksiyona veriyordu → dokunma olaylarıyla (`onTouchStart/Move/End`) yeniden yazıldı, eşikler aynı;
  - effect içinde doğrudan `setState` (`settings.tsx` takma ad ve reklam seçeneği, `missions.tsx` yükleniyor durumu, GL görünümü yenileme) kaldırıldı;
  - render sırasında `Date.now()` / `new Date()` (`IntroOverlay`, `LegalScreen`, liderlik tarihi) kaldırıldı;
  - Reanimated değerleri `.get()` / `.set()` ile kullanılıyor.
- **Oyunu değerlendir**: 5. oyundan sonra sonuç ekranında kısa bir soru (Değerlendir / Sonra / Bir daha sorma), en fazla 3 kez; Ayarlar → Oyun → "Oyunu değerlendir" her zaman açık. Değerlendirme karşılığında ödül verilmez (Play politikası). Play Store uygulaması yoksa web sayfası açılır.

---

## 10. Logo, mağaza görselleriyle uyum, seviyeler, fontlar (ek commit)

- **Logo**: verdiğin logo uygulama ikonu (1024), adaptive icon (Android maskesine uygun, kenarlar logonun kendi renkleriyle), açılış ekranı ve favicon olarak kullanıldı; Play için 512 px ikon `docs/store/play-icon-512.png`.
- **Oyun içi görüntü mağaza görsellerine yaklaştırıldı** (yanıltıcı görsel olmaması için):
  - İstiklal ve Galata'da sokağın sonunda **Galata Kulesi** (taş gövde, kemerli pencere halkası, balkon, kurşuni külah);
  - tramvay önü logodaki gibi (beyaz tavan, büyük ön cam, sarı kare farlar, siyah tampon, T pantograf);
  - **bloklu koşucu** (küp kafa, kutu saç ve şapka, küp eller), simit arabasında üç büyük simit;
  - low-poly yapraklı ağaçlar, beyaz glob lambalı siyah direkler, beyaz pencere çerçeveleri, katlarda balkonlar, ışıklı dükkân vitrinleri, saksılar ve bank;
  - daha mavi gökyüzü, daha temiz hava, beyaz bulutlar, daha canlı renk ayarı, daha büyük altınlar.
- **Seviyeler**: her semt bir seviye. Hedef (tek koşuda mesafe + altın) tamamlanınca sıradaki semt açılır ve oyuncu oraya geçer. Hedefler: İstiklal 600 m + 40, Galata 900 m + 70, Eminönü 1200 m + 100, Köprü 1500 m + 130, Boğaz 2000 m + 170. Her seviyede başlangıç hızı +1 m/s ve engeller daha sık. Koşu sırasında hedefe ulaşınca bildirim çıkar; sonuç ekranı hedef durumunu veya "yeni semt açıldı" yazar.
- **Görevler seviyeyle zorlaşır**: sunucu, oyuncunun açtığı semt sayısına göre günlük görev hedeflerini seviye başına %30, ödülleri de birlikte büyütür.
- **Fontlar**: Fredoka'da eksik olan İ, Ş, ş, Ğ, ğ harfleri fontun kendi nokta, kısa ve çengel işaretleriyle eklendi (OFL izin verir); önceden bu harfler başka fontla basılıyordu. Türkçe büyük harf dönüşümü düzeltildi ("GİZLİLİK"), başlık "İSTANBUL".
- **Mağaza görselleri**: Play kuralları ekran görüntülerinin oyunu doğru göstermesini ister. APK'yı test ettikten sonra mağazaya oyundan alınmış gerçek ekran görüntüleri koy.


## 11. Derleme düzeltmesi (paketleme hatası)

- `:app:packageRelease` adımı 26 dakikalık derlemenin sonunda çöktü. Derleme adımları 1.0.3 ile aynı olduğundan neden büyük olasılıkla bellek ya da disk sınırı.
- Gradle belleği 2 GB → 6 GB (Kotlin 2 GB), yalnızca ARM mimarileri (`armeabi-v7a`, `arm64-v8a`; tüm gerçek telefonlar). x86 yalnızca emülatörler ve birkaç Intel Chromebook içindir. Derleme süresi ve disk kullanımı yaklaşık yarıya iner.
- Derleme başında runner'da kullanılmayan araçlar silinerek disk açılır; hata olursa "Show the cause of a failed Gradle build" adımı nedeni, disk ve bellek durumunu yazar, `gradle-logs` olarak indirilebilir.


## 12. APK testindeki hatalar (ek commit)

- **Boş mavi ekran (3D sahne yok) — asıl hata, düzeltildi.** Son geçiş shader'ı `RRTAndODTFit` adında bir fonksiyon tanımlıyordu; three.js ekrana çizilen her ShaderMaterial'in önüne kendi ACES kodunu (aynı adla) ekler. GPU "function already has a body" diyip shader'ı derlemeyince ekranda yalnızca temizleme rengi kalıyordu. Kendi kendini test eden adım da "açık renk var" diye aldanıyordu.
  - Shader fonksiyonları `ist…` ile yeniden adlandırıldı; üç post materyali `toneMapped: false` ile oluşturuluyor (three artık hiçbir şey eklemiyor).
  - `renderer.debug.onShaderError` bağlandı: post shader'ı derlenemezse motor anında doğrudan çizime düşer.
  - Kendi kendine test artık iki pikseli (yakın sokak, uzak sokak) temizleme rengiyle karşılaştırır.
  - Doğrulama: eski ve yeni shader'lar Chromium WebGL2'de three.js'in gerçek ön ekiyle derlendi — eski: HATA, yeni: derlendi ve piksel üretti. `tests/shaders.test.ts` bu hatanın geri gelmesini engeller.
- **"Görevler için internet gerekli"** (sunucu eski sürümdeyken) → artık durum anlatılıyor: "Günlük görevler sunucu güncellemesi yayına girince açılacak; koşular, skorlar, sıralama ve arkadaşlar çalışıyor." Gerçek çevrimdışıysa "Tekrar dene" düğmesi.
- **Hesap kartı**: "Sunucu güncellemesi bekleniyor" + açıklama; taşıma kodu ve hesap silme satırlarında doğru metin (internet yok ≠ sunucu eski).
- **Abonelik fiyatı sonsuza kadar "yükleniyor"** → 15 sn sonra ya da Play teklifi yoksa "Aylık üyelik / Abone ol" + "Google Play'den yüklenince satın alınabilir" açıklaması. Fiyat yalnızca Play'den yüklenen kurulumda gelir (RevenueCat → Google Play ürünü); sideload APK'da gelmez, bu normaldir.
- Menü ve giriş başlığında "İ" noktasının kesilmesi: satır yüksekliği ve üst boşluk artırıldı.
- Varsayılan takma ad "Koşucu####".
- **Veri tabanı**: MongoDB çalışıyor (dünya sıralaması ve hesap kaydı Render'daki sunucudan geliyor). Görevler/taşıma kodu/hesap silme çalışmıyordu çünkü Render hâlâ `main` dalındaki 1.0.x sunucusunu çalıştırıyor; `v2` `main`'e birleşince Render 2.0 sunucusunu kurar ve bunlar açılır. Render ortam değişkenleri (`MONGO_URL`, `DB_NAME`) aynı; GitHub tarafında bir şey gerekmez.
- Geri alma: `git revert <bu commit>`.


## 13. Tek takma ad, hesap silme akışı, hukuki metinler (ek commit)

- **Takma adlar artık tek**: sunucu her adı katlanmış bir anahtara indirir (büyük/küçük harf, Türkçe harfler, boşluk ve benzer yazımlar aynı sayılır: "Boğaz Kaplanı" = "BOGAZ KAPLANI"). Alınmış bir ad yeni hesapta veya ad değiştirmede **409 "Bu takma ad alınmış"** ile reddedilir; hesap silinince ad serbest kalır. `players.nickname_key` için tekil (sparse) indeks; eski oyuncular anahtarı ilk ad değişikliğinde alır, mevcut veriye dokunulmaz. Oyun 409'da "Bu takma ad başka bir oyuncuda" der; ilk açılışta rastgele ad çakışırsa yeni bir rastgele adla tekrar dener. 1.0.x sunucuda ad artık önce sunucuya sorulur, sonra telefonda kaydedilir.
- **Hesap silme**: silme sunucuda başarılıysa yerel temizlik hataları artık "silinemedi" mesajına dönüşmez; hata mesajları gerçeği söyler (sunucuya ulaşılamadı / sunucu reddetti, hiçbir şey silinmedi). Silmeden sonra ayarlar kapanır, **"Hesabın silindi"** ekranı yeni oyuncu adını gösterir ve "Yeni oyuncu olarak başla" (ya da geri tuşu) telefonu yepyeni bir hesapla sıfırdan başlatır. Değerlendirme hatırlatıcısı dahil kişisel oyun verileri telefondan da silinir.
- **Gizlilik politikası**: takma ad, skor ve sıranın herkese açık olduğu (sıralama, arkadaş listesi, şikâyetler), takma ada kişisel bilgi yazılmaması gerektiği, adların tek ve denetimli olduğu açıkça yazıldı.
- **Lisanslar sayfasına "Markalar ve isimler"** bölümü: Google Play/Android/AdMob (Google LLC), RevenueCat, Render, MongoDB Atlas marka bildirimleri; semt adlarının kamuya açık yer adları olduğu; tramvay/otobüs/vapur/binaların stilize hayali tasarımlar olduğu ve İBB, İETT, Metro İstanbul, Şehir Hatları ile bağlantı bulunmadığı; NCS sanatçı adlarının zorunlu kaynak göstermesi olduğu.
- Kullanılmayan eski metinler kaldırıldı (vapur jetonu ile semt açma: artık semtler hedefle açılıyor).
- Testler: `test_nickname_is_unique` (API), `test_nickname_key_folds_spelling_families` (birim), çevrimdışı senaryo koşucusu 409 kontrolleri.
- Geri alma: `git revert <bu commit>`; indeks sparse olduğundan eski sunucu da aynı veriyle çalışır.


## 14. Geliştirici adı, dünya sıralamasını sıfırlama (ek commit)

- **Adını geri alamamanın nedeni**: küfür/taklit filtresi "lensted" ve "lenstedreal" adlarını herkese kapatıyor; hesabını silip yeniden açınca kendi adın da sana kapalı kaldı. Çözüm, cihaz kimliği ya da oturum kimliği değil: zaten sende olan **arkadaş kodu**. Render'da `RESERVED_NICKNAMES=LenstedReal=ARKADAŞKODUN` tanımlanınca "LenstedReal" ve onunla başlayan her ad (LenstedReal2, lenstedreal tr…) herkese kapalı, yalnızca o arkadaş koduna açık olur. Yeni veri toplanmadığı için gizlilik metnine ek gerekmez; kullanım koşullarına "geliştirici adı ayrılmıştır" satırı eklendi.
- **Dünya oyuncularını yenileme**: `ADMIN_SECRET` tanımlanınca `/api/v2/admin` açılır (`X-Admin-Secret` başlığı, dakikada 30 istek, yanlış gizli anahtar 401, tanımsızken 404 — oyun istemcisi bu yolu hiç kullanmaz).
  - `GET /api/v2/admin/players` — oyuncu listesi (ad, arkadaş kodu, skor).
  - `POST /api/v2/admin/reset-world {"keep":["KOD1"],"dry_run":true}` — tutulacak arkadaş kodları dışındaki **tüm** hesapları önce `archive` koleksiyonuna kopyalar (oyuncu + arkadaşlık, koşu, kayıt, görev, oturum… hepsi), sonra siler ve adlarını serbest bırakır. `dry_run:true` yalnızca ne olacağını gösterir.
  - `POST /api/v2/admin/delete-players {"nicknames":["LenstedReal"],"friend_codes":[],"dry_run":true}` — **yalnızca** adı geçen hesapları (büyük/küçük harf ve Türkçe harf farkı sayılmaz) ya da arkadaş kodlarını yedekleyip siler; diğer oyunculara dokunmaz. Üretimde kullanılacak olan budur.
  - `POST /api/v2/admin/restore-world {"archive_id":"…"}` — iki silme türünü de geri alır.
  - Kullanım koşullarına "test dönemi hesapları yedeklenerek sıfırlanabilir" satırı eklendi.
- Testler: `test_reserved_nickname_and_admin_reset` (gerçek Mongo, CI), birim testleri, çevrimdışı senaryo `admin_suite`.
- Geri alma: `git revert <bu commit>`; env değişkenleri tanımsızken davranış öncekiyle aynı.


## 15. Sürüm 2.0.1 (6): özgün müzikler, NCS tamamen çıktı (ek commit)

| | |
|---|---|
| Sürüm | **2.0.1**, versionCode **6** (önceki: 2.0.0 / 5) |
| Neden | NCS parçaları oyunlarda ticari kullanım için ayrı (ücretli) lisans istiyor; YouTube tanıtımlarında da telif riski vardı |

- **Beş NCS parçası ve dosyaları silindi** (Invincible, Fearless pt. II, Sky High, Mortals, Royalty; `frontend/assets/audio/music/` içindeki eski mp3'ler repodan çıktı). Oyun paketi ~18 MB küçüldü (müzik 33 MB → 15 MB).
- **Beş özgün LenstedReal parçası eklendi** (192 kbps MP3, 44,1 kHz stereo), Ayarlar'da Türkçe/İngilizce ad ve alt satırla:

  | Dosya | TR | EN |
  |---|---|---|
  | `istiklal_kosusu.mp3` | İstiklal Koşusu — LenstedReal feat. Kırmızı Tramvay | Istiklal Run — LenstedReal feat. Red Tram |
  | `galata_ruzgari.mp3` | Galata Rüzgârı — LenstedReal & Galata Kulesi | Galata Breeze — LenstedReal & Galata Tower |
  | `bogaz_isiklari.mp3` | Boğaz Işıkları — LenstedReal feat. Boğaz Martıları | Bosphorus Lights — LenstedReal feat. Bosphorus Gulls |
  | `sirkeci_ekspres.mp3` | Sirkeci Ekspres — LenstedReal x Sirkeci Garı | Sirkeci Express — LenstedReal x Sirkeci Station |
  | `ortakoy_gecesi.mp3` | Ortaköy Gecesi — LenstedReal feat. Ortaköy Simitçisi | Ortaköy Nights — LenstedReal feat. Ortaköy Simit Seller |

  Varsayılan parça **İstiklal Koşusu**. Koşu sırasında döngü (2,2 sn çapraz geçiş) ve parça değiştirme kuralları (ilk değişim ücretsiz, sonrası reklamla; abonelikte sınırsız) **aynen** kaldı.
- **Eski kayıt**: telefonda 2.0.0'ın parça kimliği (ör. `invincible`) kayıtlıysa oyun hata vermeden varsayılan parçaya geçer (`knownTrack`).
- **Ayarlar**: "Müzik bilgileri: NoCopyrightSounds (ncs.io) ›" satırı ve lisanslar sayfasına giden bağlantısı kaldırıldı; yerine bağlantısız düz yazı: TR **"Tüm müzikler: LenstedReal"**, EN **"All music by LenstedReal"**.
- **Lisanslar metni** (oyun içi `legal.json` + web `docs/licenses.html`): Müzik bölümü "LenstedReal'in özgün eserleri, tüm haklar LenstedReal'de, üçüncü taraf kütüphane yok, tanıtım videolarında da yalnızca bu müzikler" olarak yeniden yazıldı; "Markalar ve isimler"deki NCS atıf cümlesi, süs adların (Kırmızı Tramvay, Galata Kulesi…) gerçek bir sanatçıyı ifade etmediği cümlesiyle değişti. Lisanslar sayfasının tarihi 5 Kasım 2026; **gizlilik, kullanım koşulları ve hesap silme metinlerine dokunulmadı** (tarihleri 4 Kasım 2026 kaldı; her belgenin artık kendi tarihi var).
- Kodda, metinlerde ve web sayfalarında NCS, ncs.io veya eski sanatçı adı kalmadı (tarama ile doğrulandı).
- Testler: `tsc`, `expo lint`, `node --test` (i18n anahtar eşitliği, yasal metin yapısı dahil).
- Geri alma: `git revert <bu commit>` eski mp3'leri ve metinleri geri getirir.

---

## 16. Sürüm 2.0.2 (7): Google Play üretim derlemesi

| | |
|---|---|
| Sürüm | **2.0.2**, versionCode **7** (önceki: 2.0.1 / 6) |
| Neden | 7 Kasım 2026'da Play üretim erişimi verildi. Üretime giden derleme gerçek reklam birimleriyle ve test modu kapalı alınacağı için yeni bir sürüm kodu gerekiyor |

- Oyun kodunda değişiklik yok; yalnızca sürüm numarası ve sürüm kodu arttı (`frontend/app.json`, `package.json`, `profile.tsx` yedek sürüm metni, README).
- Üretim derlemesi için GitHub değişkenleri: `EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL` ve `EXPO_PUBLIC_ADMOB_ANDROID_REWARDED` gerçek AdMob birim kimlikleri, `EXPO_PUBLIC_ADS_TEST_MODE` = `0`. Bu değerler repoda değil, GitHub ayarlarında tutulur.
- Yayın sırası §8'deki gibi; ek olarak AdMob'da GDPR mesajı, Play'de abonelik ürününün etkinleştirilmesi ve `app-ads.txt` (bkz. §8 madde 8).

