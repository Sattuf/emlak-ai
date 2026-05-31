# EmlakAI — Konut Fiyat Tahmini

Sivas ve Tokat bölgelerine ait emlak verileriyle (`Veri_Madenciligi_Master_Dataset.xlsx`) eğitilmiş **Gradient Boosting** modelleri kullanarak **satılık** ve **kiralık** fiyat tahmini yapan tam yığın (full-stack) örnek projedir.

## Bileşenler

| Bileşen | Açıklama |
|--------|----------|
| `train.py` | Excel dosyasını okur, veriyi temizler, iki ayrı model eğitir, `model/model.pkl` dosyasına kaydeder. |
| `backend/main.py` | **FastAPI** sunucusu: `model.pkl` yükler, `/api/meta` ve `/api/predict` uçları. |
| `frontend/` | **Vite + React** arayüzü (Türkçe); geliştirmede API istekleri Vite proxy ile backend’e yönlendirilir. |
| `requirements.txt` | Python bağımlılıkları. |

## Gereksinimler

- Python 3.10+
- Node.js 18+ (sadece arayüz için)

## Kurulum (Python)

Proje kökünde (`emlak_ai` klasörü):

```bash
pip install -r requirements.txt
```

## Veri dosyası ve eğitim

Varsayılan Excel yolu:

`C:\Users\sattuf\Desktop\Veri_Madenciligi_Master_Dataset.xlsx`

Farklı bir dosya için ortam değişkeni veya parametre kullanın:

```powershell
$env:EXCEL_PATH = "D:\veri\emlak.xlsx"
python train.py
```

veya:

```bash
python train.py --excel "D:\veri\emlak.xlsx" --out "model\model.pkl"
```

Çıktı: `model/model.pkl` (içinde modeller, hiyerarşi, kategori listeleri ve eğitim metrikleri bulunur).

## Backend’i çalıştırma

`emlak_ai` klasöründen:

```bash
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Model yolu (isteğe bağlı):

```powershell
$env:MODEL_PATH = "C:\yol\model.pkl"
```

CORS (production’da daraltın):

```powershell
$env:CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
```

## Arayüzü çalıştırma

Ayrı bir terminalde:

```bash
cd frontend
npm install
npm run dev
```

Tarayıcı: `http://localhost:5173` — API istekleri `vite.config.js` içindeki proxy ile `http://127.0.0.1:8000` adresine gider.

## API özeti

- `GET /api/health` — sunucu durumu  
- `GET /api/meta` — şehir/ilçe/mahalle hiyerarşisi, seçim listeleri, eğitim metrikleri  
- `POST /api/predict` — JSON gövdesinde form alanları (Türkçe alan adları `Şehir`, `İlçe`, `Konut Tipi`, …) ve `islem`: `"Satılık"` veya `"Kiralık"`

## Model ve özellikler

- Hedef: `Fiyat (TL)` (log1p dönüşümü ile eğitim).  
- Kategorik: şehir, ilçe, mahalle, konut tipi, ısıtma, eşya, kullanım, kredi, yatırım uygunluğu.  
- Sayısal: metrekare, oda, kat, bina yaşı (sayısal kod), balkon, WC.  
- Excel’deki hatalı veya eksik bina yaşı hücreleri medyan ile doldurulur.

## Üretim derlemesi (isteğe bağlı)

```bash
cd frontend
npm run build
```

`dist/` klasörünü statik sunucu veya CDN ile yayınlayabilirsiniz. Bu durumda isteklerin doğrudan API’ye gitmesi için derlemeden önce taban adresi ayarlayın:

```powershell
cd frontend
$env:VITE_API_URL = "http://127.0.0.1:8000"
npm run build
```

Ortam değişkeni olmadan `npm run build` alırsanız, tarayıcı `/api/...` yolunu statik sunucunun kendisine sorar; bu yüzden üretimde `VITE_API_URL` kullanmanız gerekir.

## Lisans

Eğitim ve demo amaçlı örnek proje.
