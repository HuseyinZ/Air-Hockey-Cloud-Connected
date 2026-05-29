# CloudMorph — Updated Project Narrative

## Yeni Hikaye (Eski vs Yeni)

### ❌ Eski yaklaşım
"AWS yerel makineden daha hızlı çalışır mı?"
→ Zayıf motivasyon: ölçek belirsiz, sonuç tahmin edilebilir

### ✅ Yeni yaklaşım
"Yerel Docker hangi noktada **yetersiz kalır**? AWS bu sınırı **aşmamızı sağlar**."
→ Güçlü motivasyon: somut kırılma noktası, AWS migration zorunluluk

## Yeni Proje Akışı

1. **Baseline ölçümü** — Yerel Docker'da küçük ölçeklerde benchmark
2. **Stress test** — n'i artırarak kırılma noktasını bul
3. **Kırılma noktasını tanımla** — "n = X'te tournament > 20s, dolayısıyla pratik değil"
4. **AWS deployment** — Aynı kırılma noktasında AWS'nin performansını ölç
5. **Karşılaştır** — AWS'in yerel limitten ne kadar üstüne çıktığını göster

## Kırılma Noktası Tanımları

Aşağıdaki koşullardan **biri** sağlandığında "kırıldı" kabul edilir:

| Kriter | Eşik (varsayılan) | Anlamı |
|--------|---------------------|--------|
| Tournament süresi | > 20 saniye | Kullanıcı bekleyemez |
| Heap memory | > 500 MB | Container OOM riski |
| CPU saturasyon | > 95% sürekli | Sistem responsiv değil |
| API timeout | > 30s response | Servis kullanılamaz |

## Komutlar

### Stress Test (kırılma noktasını bul)

```bash
# Varsayılan: 50'den başla, 50'şer artır, 2000'e kadar
node backend/stress-test.js

# Hızlı tarama (timeout 20s)
node backend/stress-test.js --max-time 20000 --start 100 --step 100

# Sıkı bellek limiti
node backend/stress-test.js --max-heap 100

# Geniş aralık
node backend/stress-test.js --start 10 --step 50 --max 5000
```

### Kısıtlı Docker (gerçekçi limit)

```bash
# 0.5 CPU + 256MB RAM ile çalıştır — gerçek production limiti gibi
docker compose -f docker-compose.constrained.yml up --build
```

Bu modda kırılma noktası çok daha düşük n değerinde olur (örn. n=100 civarı).

### AWS Karşılaştırması

```bash
# AWS'ye deploy
cd aws && ./ec2-deploy.sh

# Aynı stress test'i AWS API üzerinden çalıştır
curl -X POST http://AWS_IP:3000/api/benchmark \
  -H "Content-Type: application/json" \
  -d '{"sizes": [100, 200, 300, 500, 1000, 2000]}'
```

## Rapor için Kullanılabilir Cümleler

> "Local Docker environment was tested with progressively larger tournaments.
> The system reliably handled tournaments up to n=200 bots (19,900 matches)
> in under 10 seconds. However, at n=300 (44,850 matches), tournament
> completion time exceeded our 20-second threshold, indicating that local
> execution becomes impractical for large-scale workloads. This motivated
> the migration to AWS ECS, where the same workload completed in X seconds."

> "We define the breaking point as the smallest tournament size n for which
> any of the following holds: (i) total completion time exceeds 20 seconds,
> (ii) container memory usage exceeds 500 MB, or (iii) the API becomes
> unresponsive. Under default container limits, this point was observed at
> n = X. AWS Fargate with equivalent task definition handled n = Y bots
> within the same thresholds, representing a Y/X × improvement in capacity."
