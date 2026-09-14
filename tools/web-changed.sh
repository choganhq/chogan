#!/usr/bin/env bash
# تصمیم می‌گیرد یک push به main نسخه‌ی وب منتشرشده را عوض می‌کند یا نه.
#
# هر انتشار اسم کش سرویس‌ورکر را عوض می‌کند و همه‌ی کاربرها پوسته را از نو
# می‌گیرند، پس ادغامی که فقط مستند یا اندروید را عوض کرده نباید منتشر شود.
# این منطق اول درون YAML نوشته شد و هیچ تستی به آن نمی‌رسید، در حالی که همین
# تصمیم است که مشخص می‌کند کاربرها نسخه‌ی تازه را می‌گیرند یا نه.
#
# خروجی استاندارد دقیقاً یک خط است، deploy=true یا deploy=false؛ توضیح به stderr.
# اگر مقایسه ممکن نباشد منتشر می‌کند: یک انتشار اضافه ارزان‌تر از یک انتشار
# جاافتاده است. اگر خود کامیت انتشار معتبر نباشد، خروج ۲.
set -uo pipefail

event="${GITHUB_EVENT_NAME:-}"
before="${BEFORE:-}"
after="${GITHUB_SHA:-}"
PATHS=(www/ tools/stamp-version.sh tools/verify-deploy.sh tools/web-changed.sh .github/workflows/test.yml)

say() { echo "$1" >&2; }

if ! [[ "$after" =~ ^[0-9a-f]{40}$ ]] || ! git cat-file -e "${after}^{commit}" 2>/dev/null; then
  say "web-changed: کامیت انتشار معتبر نیست: '$after'"; exit 2
fi

if [ "$event" = "workflow_dispatch" ]; then
  say "اجرای دستی؛ منتشر می‌شود"; echo "deploy=true"; exit 0
fi

if ! [[ "$before" =~ ^[0-9a-f]{40}$ ]] || [[ "$before" =~ ^0+$ ]] || ! git cat-file -e "${before}^{commit}" 2>/dev/null; then
  say "کامیت قبلی در دسترس نیست ('$before')؛ منتشر می‌شود"; echo "deploy=true"; exit 0
fi

# اگر خود diff خطا بدهد، خالی بودن خروجی را «بدون تغییر» حساب نمی‌کنیم
if ! changed=$(git diff --name-only "$before" "$after" -- "${PATHS[@]}" 2>/dev/null); then
  say "مقایسه‌ی $before..$after ممکن نشد؛ منتشر می‌شود"; echo "deploy=true"; exit 0
fi

if [ -z "$changed" ]; then
  say "نسخه‌ی وب عوض نشده؛ انتشار رد شد"; echo "deploy=false"
else
  say "عوض‌شده‌های مسیر انتشار:"; printf '%s\n' "$changed" >&2; echo "deploy=true"
fi
