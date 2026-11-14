#!/usr/bin/env bash
# Kiểm cú pháp mọi tệp nguồn
bad=0
for f in src/*.js src/*/*.js; do
  out=$(node --check "$f" 2>&1)
  if [ -n "$out" ]; then echo "LỖI $f"; echo "$out" | head -6; bad=1; fi
done
[ $bad = 0 ] && echo "cú pháp OK"
exit 0
