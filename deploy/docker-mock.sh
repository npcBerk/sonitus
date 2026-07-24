#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
compose_file="$script_dir/compose.mock.yml"

compose() {
  docker compose -f "$compose_file" "$@"
}

usage() {
  cat <<'EOF'
Kullanım: ./deploy/docker-mock.sh <komut> [argümanlar]

Komutlar:
  up       Image'ları oluştur ve mock ortamını arka planda başlat
  down     Container'ları durdur ve kaldır (veriler korunur)
  restart  Mock ortamını yeniden başlat
  build    Image'ları yeniden oluştur
  logs     Logları canlı izle (varsayılan: tüm servisler)
  ps       Servislerin durumunu göster
  config   Compose yapılandırmasını doğrula
  health   Yerel health endpoint'ini kontrol et
  reset    Container ve volume'ları silerek mock ortamını sıfırla
  help     Bu yardımı göster

Örnekler:
  ./deploy/docker-mock.sh up
  ./deploy/docker-mock.sh logs web caddy
  ./deploy/docker-mock.sh down
EOF
}

command=${1:-help}
if [ "$#" -gt 0 ]; then
  shift
fi

case "$command" in
  up)
    compose up --build -d "$@"
    compose ps
    ;;
  down)
    compose down "$@"
    ;;
  restart)
    compose down
    compose up --build -d "$@"
    compose ps
    ;;
  build)
    compose build "$@"
    ;;
  logs)
    compose logs -f "$@"
    ;;
  ps)
    compose ps "$@"
    ;;
  config)
    compose config --quiet
    echo "Mock Compose yapılandırması geçerli."
    ;;
  health)
    curl --fail --show-error --silent http://localhost:8080/api/health
    printf '\n'
    ;;
  reset)
    if [ "${CONFIRM_RESET:-}" != "yes" ]; then
      echo "Bu komut mock PostgreSQL ve Redis volume'larını kalıcı olarak siler." >&2
      echo "Onaylamak için: CONFIRM_RESET=yes ./deploy/docker-mock.sh reset" >&2
      exit 1
    fi
    compose down -v "$@"
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
