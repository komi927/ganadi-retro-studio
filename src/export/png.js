export function createTransparentPng(raw, targetW, targetH, outlineOn) {
  const out = new Uint8ClampedArray(targetW * targetH * 4);
  let minX = targetW, minY = targetH, maxX = -1, maxY = -1;

  const opacityAt = (x, y) => {
    if (x < 0 || x >= targetW || y < 0 || y >= targetH) return 0;
    return raw[((targetH - 1 - y) * targetW + x) * 4 + 3] / 255;
  };
  const outlineColor = [34, 37, 50];

  for (let y = 0; y < targetH; y++) {
    const wy = targetH - 1 - y;
    for (let x = 0; x < targetW; x++) {
      const srcIdx = (wy * targetW + x) * 4;
      const alpha = raw[srcIdx + 3] / 255;
      const outline = outlineOn && alpha < 1 ? Math.max(
        opacityAt(x - 1, y), opacityAt(x + 1, y),
        opacityAt(x, y - 1), opacityAt(x, y + 1)
      ) * (1 - alpha) : 0;
      const total = alpha + outline;
      if (total === 0) continue;

      const dstIdx = (y * targetW + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        out[dstIdx + channel] = (raw[srcIdx + channel] + outlineColor[channel] * outline) / total;
      }
      out[dstIdx + 3] = total * 255;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  const pad = 6;
  const cX = Math.max(0, minX - pad);
  const cY = Math.max(0, minY - pad);
  const cW = Math.min(targetW, maxX + pad + 1) - cX;
  const cH = Math.min(targetH, maxY + pad + 1) - cY;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = targetW;
  srcCanvas.height = targetH;
  srcCanvas.getContext('2d').putImageData(new ImageData(out, targetW, targetH), 0, 0);

  const expCanvas = document.createElement('canvas');
  expCanvas.width = cW;
  expCanvas.height = cH;
  expCanvas.getContext('2d').drawImage(srcCanvas, cX, cY, cW, cH, 0, 0, cW, cH);
  return expCanvas.toDataURL('image/png');
}
