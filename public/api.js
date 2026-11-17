// fetch 封装：统一 JSON、错误抛出（message 携带服务端 error 字段）

async function request(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch { /* 非 JSON 响应 */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `请求失败（${res.status}）`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  vocab: () => request('GET', '/api/vocab'),
  parse: (text) => request('POST', '/api/parse', { text }),
  clothes: (cond) => request('GET', `/api/clothes${cond ? `?cond=${encodeURIComponent(JSON.stringify(cond))}` : ''}`),
  cloth: (id) => request('GET', `/api/clothes/${id}`),
  createCloth: (data) => request('POST', '/api/clothes', data),
  updateCloth: (id, data) => request('PUT', `/api/clothes/${id}`, data),
  deleteCloth: (id) => request('DELETE', `/api/clothes/${id}`),
  promoteCloth: (id) => request('POST', `/api/clothes/${id}/promote`),
  precheck: (id) => request('GET', `/api/clothes/${id}/precheck`),
  createPrecheckTask: (images) => request('POST', '/api/precheck-tasks', { images }),
  runPrecheckTask: (taskId) => request('POST', `/api/precheck-tasks/${taskId}/run`),
  outfits: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    const s = q.toString();
    return request('GET', `/api/outfits${s ? `?${s}` : ''}`);
  },
  outfit: (id) => request('GET', `/api/outfits/${id}`),
  updateOutfit: (id, data) => request('PUT', `/api/outfits/${id}`, data),
  addOutfitImage: (id, imageB64) => request('POST', `/api/outfits/${id}/images`, { imageB64 }),
  removeOutfitImage: (id, name) => request('DELETE', `/api/outfits/${id}/images/${encodeURIComponent(name)}`),
  createOutfit: (data) => request('POST', '/api/outfits', data),
  deleteOutfit: (id) => request('DELETE', `/api/outfits/${id}`),
  avoidlist: () => request('GET', '/api/avoidlist'),
  createAvoid: (data) => request('POST', '/api/avoidlist', data),
  deleteAvoid: (id) => request('DELETE', `/api/avoidlist/${id}`),
};
