# SONITUS tam VPS çalıştırma rehberi

Bu klasörde iki ayrı ve bilinçli çalışma düzeni vardır:

- `compose.mock.yml`: VPS topolojisinin yerel provasıdır. Caddy, Next.js, PostgreSQL ve Redis çalışır; PostgreSQL sahte snapshot ile doldurulur. Worker çalışmaz ve CoinGecko'ya istek atılmaz.
- `compose.production.yml`: Gerçek VPS düzenidir. Bunlara ek olarak sürekli BullMQ worker, otomatik PostgreSQL backup ve Caddy'nin otomatik HTTPS yönetimi çalışır.

Kökteki `.env.example`, Docker için değil host üzerinde `npm run dev` çalıştırmak
içindir; burada yalnızca localhost bağlantıları bulunur. Production Compose
yalnızca `deploy/.env.production` dosyasını `--env-file` ile alır. Bu dosya tam
`DATABASE_URL` veya `REDIS_URL` taşımaz: Compose bağlantıları kendi özel ağındaki
`postgres` ve `redis` servislerine yönlendirir. Mock Compose gerekli değerleri
kendi içinde güvenli yerel değerlerle tanımlar ve env dosyası istemez.

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

Mock Compose içindeki tek seferlik `seed` servisi veritabanını bilerek temizler
ve bu nedenle `ALLOW_DESTRUCTIVE_SEED=true` iznini yalnızca kendi izole
PostgreSQL container'ına verir. Production Compose seed servisi içermez. Host
üzerinde `npm run db:seed`, localhost dışındaki bir veritabanını bu açık izin
olmadan temizlemeyi reddeder.

## 2. VPS hazırlığı

Önerilen başlangıç: Ubuntu 24.04 LTS, en az 2 vCPU, 4 GB RAM ve 40 GB SSD. Sunucuda ayrı bir sudo kullanıcısı oluşturun, SSH key ile bağlanın, parola ile root girişini kapatın. Firewall'da yalnızca SSH, HTTP ve HTTPS açık olmalıdır: `22`, `80`, `443`. PostgreSQL `5432`, Redis `6379` ve Next.js `3000` internete açılmaz.

Docker Engine ve Compose eklentisini Docker'ın resmi Ubuntu deposundan kurun. Domain'in DNS `A`/`AAAA` kaydını VPS IP'sine yöneltin. Caddy'nin sertifika alabilmesi için DNS'in çözülmesi ve 80/443 portlarının erişilebilir olması gerekir.

Kod için örneğin `/opt/sonitus` dizinini kullanın. Repository'yi bu dizine alın ve `deploy` altından çalıştırın.

### Seçenek A: Kök domain'i doğrudan VPS'e bağlama

Örnek: `example.com` adresinin tamamı SONITUS'a açılacaksa:

1. VPS'in public IPv4 adresini öğrenin:

   ```bash
   curl -4 https://icanhazip.com
   ```

2. Squarespace'te **Domains → example.com → DNS → DNS Settings → Custom
   Records** ekranını açın.
3. `Name/Host` değeri `@` olan ve eski web sitesine giden `A`, `AAAA` veya
   `ALIAS` kayıtlarını kaldırın. **MX, TXT, DKIM ve e-posta kayıtlarını
   silmeyin.** Kök domain hâlihazırda bir Squarespace sitesini gösteriyorsa bu
   işlem o siteyi bu domain'den ayırır.
4. Şu kaydı ekleyin:

   | Type | Name | IP Address |
   | --- | --- | --- |
   | `A` | `@` | `VPS_PUBLIC_IPV4` |

5. VPS'in gerçekten çalışan bir public IPv6 adresi varsa ayrıca `AAAA / @ /
   VPS_PUBLIC_IPV6` ekleyebilirsiniz. IPv6 yapılandırılmadıysa `AAAA` eklemeyin
   ve eski `@` AAAA kaydını bırakmayın.
6. `deploy/.env.production` içinde şu değeri kullanın:

   ```dotenv
   DOMAIN=example.com
   ```

Bu kurulum yalnızca `https://example.com` adresini bağlar. `www.example.com`
ayrıca kullanılacaksa onun için de DNS ve Caddy host yapılandırması yapılmalıdır;
ilk kurulumda tek canonical adres kullanmak daha nettir.

### Seçenek B: Subdomain'i VPS'e bağlama

Örnek: Ana site `example.com` üzerinde kalacak, SONITUS
`app.example.com` adresinde açılacaksa:

1. Squarespace'te **Domains → example.com → DNS → DNS Settings → Custom
   Records** ekranını açın.
2. Şu kaydı ekleyin:

   | Type | Name | IP Address |
   | --- | --- | --- |
   | `A` | `app` | `VPS_PUBLIC_IPV4` |

3. Aynı `app` adıyla eski bir `A`, `AAAA`, `CNAME` veya forwarding kaydı varsa
   önce çakışan kaydı kaldırın. Kök domain'in `@`, `www`, MX ve TXT kayıtlarına
   dokunmayın.
4. `deploy/.env.production` içinde tam subdomain'i kullanın:

   ```dotenv
   DOMAIN=app.example.com
   ```

Bu seçenek kök Squarespace sitesini ve domain e-postasını değiştirmez; ilk canlı
deneme için önerilen yöntemdir.

### DNS ve HTTPS doğrulaması

DNS değişiklikleri çoğunlukla daha hızlı görünse de Squarespace'e göre 24–48
saate kadar sürebilir. VPS'i açmadan önce kendi bilgisayarınızdan kontrol edin:

```bash
dig +short A example.com
# veya:
dig +short A app.example.com
```

Çıktı VPS IPv4 adresi olmalıdır. Sonra VPS firewall/security group üzerinde TCP
`80` ve `443` portlarının açık olduğunu doğrulayın ve production Compose'u
başlatın. Caddy domain'i gördüğünde public TLS sertifikasını otomatik alır,
HTTP'yi HTTPS'e yönlendirir ve sertifikayı yeniler:

```bash
curl -I https://example.com
# veya:
curl -I https://app.example.com

docker compose --env-file deploy/.env.production \
  -f deploy/compose.production.yml logs --tail=100 caddy
```

DNS doğru IP'ye gitmiyorsa, `80/443` dışarıdan kapalıysa veya aynı isimde eski
bir `AAAA` kaydı başka sunucuya gidiyorsa Caddy sertifika alamaz.

Resmî referanslar: [Squarespace DNS kayıtlarını
düzenleme](https://support.squarespace.com/hc/en-us/articles/360002101888-Adding-DNS-records-to-your-domain),
[Squarespace web hosting A/AAAA
kayıtları](https://support.squarespace.com/hc/en-us/articles/31119879125645-DNS-records-for-web-hosting),
[Squarespace subdomain'i başka sunucuya
yönlendirme](https://support.squarespace.com/hc/en-us/articles/215744668-Pointing-a-Squarespace-domain)
ve [Caddy HTTPS
başlangıç rehberi](https://caddyserver.com/docs/quick-starts/https).

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

`--env-file` verilmezse veya zorunlu production değerlerinden biri eksikse Compose
artık container oluşturmadan hata verir. `migrate` container'ı Prisma
migration'larını bir kez uygular. `web` standalone Next.js server'dır. `worker`
production preflight kontrolünden sonra sürekli çalışır ve BullMQ scheduler'ını
kurar.

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
6. Eski Netlify scheduled/background function'larının kapalı olduğunu doğrula.
7. 24-48 saat health, worker hataları, disk ve CoinGecko limitlerini izle.

Eski scheduler'ı, yeni worker'ın başarılı tarama yaptığını gördükten hemen sonra
kapatın; iki scheduler'ı aynı anda çalıştırmayın.
