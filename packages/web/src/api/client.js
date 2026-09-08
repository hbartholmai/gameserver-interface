export class ApiError extends Error {
    status;
    fields;
    constructor(message, status, fields = []) {
        super(message);
        this.status = status;
        this.fields = fields;
        this.name = 'ApiError';
    }
}
/** Wird nach jeder Anmeldung gesetzt und bei mutierenden Anfragen mitgeschickt. */
let csrfToken = null;
export function setCsrfToken(token) {
    csrfToken = token;
}
async function request(path, init = {}) {
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData)) {
        headers.set('content-type', 'application/json');
    }
    if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
        headers.set('x-csrf-token', csrfToken);
    }
    const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
        const body = payload;
        throw new ApiError(body.detail ? `${body.error ?? 'Fehler'}: ${body.detail}` : (body.error ?? 'Unbekannter Fehler'), response.status, body.fields ?? []);
    }
    return payload;
}
export const api = {
    authState: () => request('/api/auth/state'),
    me: () => request('/api/auth/me'),
    login: (username, password) => request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
    }),
    setup: (username, password) => request('/api/auth/setup', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
    }),
    logout: () => request('/api/auth/logout', { method: 'POST' }),
    host: () => request('/api/host'),
    templates: () => request('/api/templates'),
    suggestedPorts: (game) => request(`/api/templates/${game}/ports`),
    instances: () => request('/api/instances'),
    instance: (id) => request(`/api/instances/${id}`),
    createInstance: (body) => request('/api/instances', { method: 'POST', body: JSON.stringify(body) }),
    deleteInstance: (id, deleteData) => request(`/api/instances/${id}?data=${deleteData}`, { method: 'DELETE' }),
    saveSettings: (id, settings, restart) => request(`/api/instances/${id}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({ settings, restart }),
    }),
    start: (id) => request(`/api/instances/${id}/start`, { method: 'POST' }),
    stop: (id) => request(`/api/instances/${id}/stop`, { method: 'POST' }),
    restart: (id) => request(`/api/instances/${id}/restart`, { method: 'POST' }),
    update: (id) => request(`/api/instances/${id}/update`, { method: 'POST' }),
    logs: (id) => request(`/api/instances/${id}/logs`),
    command: (id, command) => request(`/api/instances/${id}/command`, {
        method: 'POST',
        body: JSON.stringify({ command }),
    }),
    players: (id) => request(`/api/instances/${id}/players`),
    kick: (id, name) => request(`/api/instances/${id}/players/${encodeURIComponent(name)}/kick`, { method: 'POST' }),
    ban: (id, name, reason) => request(`/api/instances/${id}/players/${encodeURIComponent(name)}/ban`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason ?? 'manuell gesperrt · dauerhaft' }),
    }),
    unban: (id, name) => request(`/api/instances/${id}/bans/${encodeURIComponent(name)}`, { method: 'DELETE' }),
    backups: (id) => request(`/api/instances/${id}/backups`),
    createBackup: (id) => request(`/api/instances/${id}/backups`, { method: 'POST' }),
    restoreBackup: (id, backupId) => request(`/api/instances/${id}/backups/${backupId}/restore`, { method: 'POST' }),
    deleteBackup: (id, backupId) => request(`/api/instances/${id}/backups/${backupId}`, { method: 'DELETE' }),
    mods: (id) => request(`/api/instances/${id}/mods`),
    setModEnabled: (id, file, enabled) => request(`/api/instances/${id}/mods/${encodeURIComponent(file)}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
    }),
    deleteMod: (id, file) => request(`/api/instances/${id}/mods/${encodeURIComponent(file)}`, { method: 'DELETE' }),
    uploadMod: (id, file) => {
        const form = new FormData();
        form.append('file', file);
        return request(`/api/instances/${id}/mods`, { method: 'POST', body: form });
    },
};
//# sourceMappingURL=client.js.map