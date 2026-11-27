export function downloadFile(filename, data) {
  const link = document.createElement('a');
  const blob = data instanceof Blob;
  link.download = filename;
  link.href = blob ? URL.createObjectURL(data) : data;
  link.click();
  if (blob) setTimeout(() => URL.revokeObjectURL(link.href), 1500);
}
