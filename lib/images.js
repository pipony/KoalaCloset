// 图片落盘：base64（前端 canvas 压缩后的 dataURL）→ 校验魔数 → data/images/<id>-<kind>.<ext>
// JSON 里只存相对路径（images/xxx.jpg），保持人可读。

import fs from 'node:fs';
import path from 'node:path';

// 魔数探测：JPEG（FFD8FF）/ PNG（89504E47）/ WebP（RIFF....WEBP）
function detectFormat(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export function createImages(imagesDir = 'data/images') {
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

  // dataURL → 落盘，返回相对路径（相对于 data/ 目录，即 URL 上的 /images/...）
  function save(dataUrl, id, kind) {
    const m = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/.exec(dataUrl || '');
    if (!m) throw new Error('图片格式只支持 JPEG/PNG/WebP（HEIC 请先转存为 JPEG）');
    const buf = Buffer.from(m[2], 'base64');
    const ext = detectFormat(buf);
    if (!ext) throw new Error('图片内容校验失败：不是合法的 JPEG/PNG/WebP');
    if (buf.length > 15 * 1024 * 1024) throw new Error('图片超过 15MB，请重新压缩');
    const fname = `${id}-${kind}.${ext}`;
    fs.writeFileSync(path.join(imagesDir, fname), buf);
    return `images/${fname}`;
  }

  // 删除 data/images 下的图片（传相对路径数组）；忽略不存在的
  function remove(relPaths) {
    for (const rel of relPaths) {
      if (!rel || !/^images\/[\w.-]+$/.test(rel)) continue; // 防路径穿越
      const file = path.join(path.dirname(imagesDir), rel);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }

  return { save, remove };
}
