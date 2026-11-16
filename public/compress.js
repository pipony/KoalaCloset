// 前端图片压缩：File → canvas 缩放 → JPEG dataURL（长边 ≤900px，q 0.82）
// HEIC 在浏览器 canvas 里解不开，会 reject 并提示转存 JPEG。

export function compressImage(file, maxSide = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (!dataUrl || dataUrl.length < 100) throw new Error('压缩失败');
        resolve(dataUrl);
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(new Error('图片处理失败，HEIC 请先截图或转存为 JPEG'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('这张图浏览器解不开（常见于 iPhone 的 HEIC），请截图或转存为 JPEG 后再传'));
    };
    img.src = url;
  });
}
