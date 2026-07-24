#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_dir=$(dirname "$script_dir")
production_script="$script_dir/docker-production.sh"
env_file="${SONITUS_ENV_FILE:-$script_dir/.env.production}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker bulunamadı veya PATH içinde değil." >&2
  exit 1
fi

if [ ! -f "$env_file" ]; then
  echo "Production env dosyası bulunamadı: $env_file" >&2
  echo "deploy/.env.production dosyası VDS üzerinde korunmalı ve Git'e eklenmemelidir." >&2
  exit 1
fi

if [ ! -x "$production_script" ]; then
  echo "Production Docker script'i çalıştırılabilir değil: $production_script" >&2
  echo "Düzeltmek için: chmod +x deploy/docker-production.sh deploy/vds-update.sh" >&2
  exit 1
fi

cd "$project_dir"

echo "[1/4] Production ortam değişkenleri ve Compose yapılandırması doğrulanıyor..."
SONITUS_ENV_FILE="$env_file" "$production_script" config

echo "[2/4] Docker image'ları yeniden oluşturuluyor..."
SONITUS_ENV_FILE="$env_file" "$production_script" build

echo "[3/4] Migration ve servis güncellemeleri uygulanıyor..."
SONITUS_ENV_FILE="$env_file" "$production_script" up

echo "[4/4] Servis durumu gösteriliyor..."
SONITUS_ENV_FILE="$env_file" "$production_script" ps

echo
echo "VDS güncellemesi tamamlandı."
echo "Loglar:  ./deploy/docker-production.sh logs"
echo "Worker:  ./deploy/docker-production.sh logs worker"
echo "Durum:   ./deploy/docker-production.sh ps"
