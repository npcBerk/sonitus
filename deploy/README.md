# SONITUS tam VPS çalıştırma rehberi

Bu klasörde iki ayrı düzen vardır:

- `compose.mock.yml`: VPS topolojisinin yerel provasıdır. Caddy, Next.js, PostgreSQL ve Redis çalışır; PostgreSQL sahte snapshot ile doldurulur. Worker çalışmaz ve CoinGecko'ya istek atılmaz.
- `compose.production.yml`: Gerçek VPS düzenidir. Bunlara ek olarak sürekli BullMQ worker, otomatik PostgreSQL backup ve Caddy'nin otomatik HTTPS yönetimi çalışır.

## Docker'ın kısa mantığı

Image, uygulamanın paketlenmiş kalıbıdır. Container, bu kalıbın çalışan örneğidir. Volume, container silinse de kalmasını istediğimiz veridir. Network, container'ların birbirini servis adıyla bulduğu özel ağdır. Compose ise bütün container'ları tek dosyadan beraber yönetir.

Container içinden `localhost`, o container'ın kendisidir. Bu nedenle web uygulaması PostgreSQL'e `postgres:5432`, Redis'e `redis:6379` ile bağlanır. PostgreSQL ve Redis production dosyasında internete port açmaz; sadece özel `backend` ağına bağlıdır.

## 1. Yerelde mock VPS provası

Repository kökünden:

```bash
docker compose -f deploy/compose.mock.yml up --build -d
docker compose -f deploy/compose.mock.yml ps
curl http://localhost:8080/api/health
```

Dashboard: `http://localhost:8080`

Logları izlemek için:

```bash
docker compose -f deploy/compose.mock.yml logs -f web caddy
```

Durdurmak için:

```bash
docker compose -f deploy/compose.mock.yml down
```

`down` veritabanı volume'unu silmez. Tamamen sıfırlamak yalnızca mock ortamında gerekirse `docker compose -f deploy/compose.mock.yml down -v` kullanılır; `-v` kalıcı veriyi siler.

## 2. VPS hazırlığı

Önerilen başlangıç: Ubuntu 24.04 LTS, en az 2 vCPU, 4 GB RAM ve 40 GB SSD. Sunucuda ayrı bir sudo kullanıcısı oluşturun, SSH key ile bağlanın, parola ile root girişini kapatın. Firewall'da yalnızca SSH, HTTP ve HTTPS açık olmalıdır: `22`, `80`, `443`. PostgreSQL `5432`, Redis `6379` ve Next.js `3000` internete açılmaz.

Docker Engine ve Compose eklentisini Docker'ın resmi Ubuntu deposundan kurun. Domain'in DNS `A`/`AAAA` kaydını VPS IP'sine yöneltin. Caddy'nin sertifika alabilmesi için DNS'in çözülmesi ve 80/443 portlarının erişilebilir olması gerekir.

Kod için örneğin `/opt/sonitus` dizinini kullanın. Repository'yi bu dizine alın ve `deploy` altından çalıştırın.

## 3. Production secret dosyası

```bash
cd /opt/sonitus
cp deploy/.env.production.example deploy/.env.production
openssl rand -hex 32
```

Komutu iki kez çalıştırıp farklı çıktıları `POSTGRES_PASSWORD` ve `INTERNAL_JOB_TOKEN` olarak yazın. Hex çıktı URL içinde de güvenle kullanılabilir. CoinGecko key ve gerçek domain'i ekleyin. Ardından:

```bash
chmod 600 deploy/.env.production
```

Bu dosya Git'e gönderilmez. Shell'e secret yapıştırmak yerine Compose'a `--env-file` ile verilir.

## 4. İlk production açılışı

```bash
cd /opt/sonitus
mkdir -p deploy/backups
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml config --quiet
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml build
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml up -d
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml ps
```

`migrate` container'ı Prisma migration'larını bir kez uygular. `web` standalone Next.js server'dır. `worker` sürekli açıktır ve BullMQ scheduler'ını kurar. Netlify fonksiyonları repository'de kalabilir ama VPS'te hiçbir process onları çalıştırmaz; ayrıca silmek gerekmez.

Kontroller:

```bash
curl https://app.example.com/api/health
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml logs --tail=100 worker
ls -lh deploy/backups
```

Health yanıtı ilk worker taraması tamamlanana kadar `degraded` olabilir. İlk başarılı taramadan sonra database, Redis ve worker `healthy` olmalıdır.

## 5. Güncelleme ve geri dönüş

Her yayın öncesi backup'ın varlığını kontrol edin. Sonra yeni kodu alın ve image'ları yeniden oluşturun:

```bash
git pull --ff-only
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml build
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml up -d
```

Compose yalnızca değişen container'ları yeniler; named volume'lara dokunmaz. Uygulama geri dönüşü için önceki Git commit'ine dönüp tekrar build yapılabilir. Veritabanı migration geri dönüşü ayrıca planlanmalıdır; Prisma otomatik rollback yapmaz.

## 6. Backup, restore, log ve monitoring

Backup container'ı varsayılan olarak her 24 saatte custom-format `pg_dump` üretir ve 14 günden eskileri siler. Bu, aynı disk arızasına karşı koruma sağlamaz. Backup dizinini ayrıca günlük olarak başka bir sağlayıcıya/object storage'a kopyalayın ve ayda en az bir restore provası yapın.

Restore, boş bir test veritabanında doğrulanmalıdır:

```bash
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml exec -T postgres \
  pg_restore --clean --if-exists --no-owner -U sonitus -d sonitus < deploy/backups/SON_DOSYA.dump
```

Bu komut mevcut veritabanını değiştirir; gerçek production üzerinde doğrudan çalıştırmayın.

Docker logları dosya başına 10 MB ve 5 dosya ile sınırlandırılmıştır. Başlangıçta `docker compose logs` yeterlidir; production için daha sonra Grafana Cloud, Better Stack veya benzeri bir merkezi log servisine Pino JSON loglarını göndermek uygundur.

En az iki dış alarm kurun:

1. `https://domain/api/health` her dakika kontrolü; HTTP 200 değilse bildirim.
2. VPS disk, RAM ve CPU alarmı; disk kullanımı yüzde 80'e gelmeden bildirim.

Health endpoint tek başına sunucunun tamamen erişilemez olmasını içeriden fark edemez; bu yüzden kontrol dışarıdan yapılmalıdır.

## 7. Güvenli geçiş sırası

1. Yerelde mock compose'u doğrula.
2. VPS'te geçici bir subdomain ile production compose'u aç.
3. TLS, health, worker logu, ilk scan ve backup dosyasını doğrula.
4. Backup restore provasını ayrı/test veritabanında yap.
5. Ana domain DNS'ini VPS'e geçir.
6. Netlify'daki scheduled/background function'ları kapat; iki scheduler'ı aynı anda bırakma.
7. 24-48 saat health, worker hataları, disk ve CoinGecko limitlerini izle.

Netlify'ı DNS geçişi doğrulanana kadar geri dönüş seçeneği olarak tutabilirsiniz. Eski scheduler'ı, yeni worker'ın başarılı tarama yaptığını gördükten hemen sonra kapatın.
