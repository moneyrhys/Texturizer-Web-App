const KEY = "layerizer.presets.v1";

export function listPresets() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

export function savePreset(name, params) {
  const list = listPresets();
  const id = "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const preset = {
    id,
    name: (name || "Untitled").slice(0, 40),
    params: { ...params },
    createdAt: new Date().toISOString(),
  };
  list.unshift(preset);
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200)));
  return preset;
}

export function deletePreset(id) {
  const list = listPresets().filter((p) => p.id !== id);
  localStorage.setItem(KEY, JSON.stringify(list));
  return list;
}

export function renamePreset(id, name) {
  const list = listPresets().map((p) => (p.id === id ? { ...p, name: name.slice(0, 40) } : p));
  localStorage.setItem(KEY, JSON.stringify(list));
  return list;
}
