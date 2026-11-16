// 迷你路由器：method + '/api/clothes/:id' 形式的模式匹配，支持 :param 段。

export function createRouter() {
  const routes = []; // { method, segments, handler }

  function add(method, pattern, handler) {
    routes.push({ method, segments: pattern.split('/').filter(Boolean), handler });
  }

  function match(method, pathname) {
    const segs = pathname.split('/').filter(Boolean);
    for (const r of routes) {
      if (r.method !== method || r.segments.length !== segs.length) continue;
      const params = {};
      let hit = true;
      for (let i = 0; i < segs.length; i++) {
        const p = r.segments[i];
        if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(segs[i]);
        else if (p !== segs[i]) { hit = false; break; }
      }
      if (hit) return { handler: r.handler, params };
    }
    return null;
  }

  return {
    get: (p, h) => add('GET', p, h),
    post: (p, h) => add('POST', p, h),
    put: (p, h) => add('PUT', p, h),
    delete: (p, h) => add('DELETE', p, h),
    match,
  };
}
