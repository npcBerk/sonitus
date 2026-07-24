#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
compose_file="$script_dir/compose.production.yml"
env_file="${SONITUS_ENV_FILE:-$script_dir/.env.production}"

require_env_file() {
  if [ ! -f "$env_file" ]; then
    echo "Production env dosyası bulunamadı: $env_file" >&2
    echo "Önce deploy/.env.production.example dosyasını deploy/.env.production olarak kopyalayıp doldurun." >&2
    exit 1
  fi
}

compose() {
  require_env_file
  docker compose \
    --env-file "$env_file" \
    -f "$compose_file" \
    "$@"
}

usage() {
  cat <<'EOF'
Kullanım: ./deploy/docker-production.sh <komut> [argümanlar]

Komutlar:
  up       Production ortamını arka planda başlat/güncelle
  down     Container'ları durdur ve kaldır (veriler korunur)
  restart  Production servislerini yeniden başlat
  build    Uygulama image'larını oluştur
  deploy   Yapılandırmayı doğrula, build et ve ortamı başlat
  logs     Logları canlı izle (varsayılan: tüm servisler)
  ps       Servislerin durumunu göster
  config   Compose yapılandırmasını doğrula
  backup   PostgreSQL backup container'ını yeniden başlatıp backup'ı tetikle
  help     Bu yardımı göster

Farklı env dosyası:
  SONITUS_ENV_FILE=/gizli/env ./deploy/docker-production.sh deploy

Örnekler:
  ./deploy/docker-production.sh deploy
  ./deploy/docker-production.sh logs worker
  ./deploy/docker-production.sh ps
EOF
}

command=${1:-help}
if [ "$#" -gt 0 ]; then
  shift
fi

case "$command" in
  up)
    compose up -d "$@"
    compose ps
    ;;
  down)
    compose down "$@"
    ;;
  restart)
    compose restart "$@"
    compose ps
    ;;
  build)
    compose build "$@"
    ;;
  deploy)
    compose config --quiet
    compose build "$@"
    compose up -d
    compose ps
    ;;
  logs)
    compose logs -f "$@"
    ;;
  ps)
    compose ps "$@"
    ;;
  config)
    compose config --quiet
    echo "Production Compose yapılandırması geçerli."
    ;;
  backup)
    compose restart backup
    compose logs --tail=20 backup
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    echo "Bilinmeyen komut: $command" >&2
    usage >&2
    exit 2
    ;;
esac
