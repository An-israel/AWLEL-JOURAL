#!/usr/bin/env bash
# Lighthouse scores and latency for the public pages (items 91-94, section 15).
# Usage: scripts/measure.sh https://awlel.unn.edu.ng
# Needs Chrome or Chromium (set CHROME_PATH if it isn't found) and Node 22.
# In a container running as root, add: CHROME_FLAGS="--headless=new --no-sandbox"
# Results print as a table; full Lighthouse reports go to ./measurements/.
set -euo pipefail
base="${1:?usage: scripts/measure.sh <site URL>}"
base="${base%/}"
out="measurements/$(date -u +%Y-%m-%d)"
mkdir -p "$out"

slug=$(curl -fsS "$base/api/v1/articles?limit=1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data[0]?.slug??""))')
issue=$(curl -fsS "$base/api/v1/issues" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const i=JSON.parse(s).data[0];console.log(i?`/issues/${i.volume}/${i.issue??1}`:"")})')
pages=("/" "/issues" "$issue" "/articles/$slug" "/about" "/contact")

echo "Lighthouse (performance accessibility best-practices seo)"
for p in "${pages[@]}"; do
  [ -z "$p" ] && continue
  for preset in mobile desktop; do
    name="$(echo "$p" | tr '/?=&' '____')-$preset"
    flags=(); [ "$preset" = desktop ] && flags=(--preset=desktop)
    npx -y lighthouse@12 "$base$p" "${flags[@]}" --quiet --chrome-flags="${CHROME_FLAGS:---headless=new}" \
      --only-categories=performance,accessibility,best-practices,seo --output=json --output-path="$out/$name.json" >/dev/null 2>&1 || true
    [ -f "$out/$name.json" ] || { echo "$p ($preset): Lighthouse could not run"; continue; }
    node -e '
      const r = require(process.argv[1]); const c = r.categories, a = r.audits;
      console.log(process.argv[2].padEnd(48), ["performance","accessibility","best-practices","seo"].map(k => String(Math.round(c[k].score*100)).padStart(4)).join(""),
        "  LCP", a["largest-contentful-paint"].displayValue, " CLS", a["cumulative-layout-shift"].displayValue);
    ' "$PWD/$out/$name.json" "$p ($preset)"
  done
done

echo
echo "Latency: 10 connections for 15 s (stay under the rate limits: API and downloads are measured lightly)"
for p in "/" "$issue" "/articles/$slug" "/search?q=language"; do
  [ -z "$p" ] && continue
  npx -y autocannon@8 -c 10 -d 15 -j "$base$p" 2>/dev/null | node -e '
    let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{ const d=JSON.parse(s), l=d.latency;
      console.log(process.argv[1].padEnd(48), `${Math.round(d.requests.average)} req/s  p50 ${l.p50} ms  p90 ${l.p90} ms  p99 ${l.p99} ms  max ${l.max} ms  errors ${d.errors + d.non2xx}`); });
  ' "$p"
done
echo "Reports saved in $out/"
