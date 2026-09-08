import type {
  Backup,
  CreateInstanceRequest,
  HostStatus,
  Instance,
  Job,
  LogLine,
  Mod,
  Player,
  SessionInfo,
  TemplateDescriptor,
} from '@gsp/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: { field: string; message: string }[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Wird nach jeder Anmeldung gesetzt und bei mutierenden Anfragen mitgeschickt. */
let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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
  const payload = text ? (JSON.parse(text) as unknown) : {};

  if (!response.ok) {
    const body = payload as { error?: string; detail?: string; fields?: { field: string; message: string }[] };
    throw new ApiError(
      body.detail ? `${body.error ?? 'Fehler'}: ${body.detail}` : (body.error ?? 'Unbekannter Fehler'),
      response.status,
      body.fields ?? [],
    );
  }
  return payload as T;
}

export const api = {
  authState: () => request<{ needsSetup: boolean }>('/api/auth/state'),
  me: () => request<SessionInfo>('/api/auth/me'),
  login: (username: string, password: string) =>
    request<SessionInfo>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  setup: (username: string, password: string) =>
    request<SessionInfo>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),

  host: () => request<HostStatus>('/api/host'),
  templates: () => request<{ templates: TemplateDescriptor[] }>('/api/templates'),
  suggestedPorts: (game: string) =>
    request<{ ports: Record<string, number> }>(`/api/templates/${game}/ports`),

  instances: () => request<{ instances: Instance[] }>('/api/instances'),
  instance: (id: string) => request<Instance>(`/api/instances/${id}`),
  createInstance: (body: CreateInstanceRequest) =>
    request<{ id: string; job: Job }>('/api/instances', { method: 'POST', body: JSON.stringify(body) }),
  deleteInstance: (id: string, deleteData: boolean) =>
    request<{ ok: true }>(`/api/instances/${id}?data=${deleteData}`, { method: 'DELETE' }),
  saveSettings: (id: string, settings: Record<string, string | number | boolean>, restart: boolean) =>
    request<{ ok: true }>(`/api/instances/${id}/settings`, {
      method: 'PATCH',
      body: JSON.stringify({ settings, restart }),
    }),

  start: (id: string) => request<{ ok: true }>(`/api/instances/${id}/start`, { method: 'POST' }),
  stop: (id: string) => request<{ ok: true }>(`/api/instances/${id}/stop`, { method: 'POST' }),
  restart: (id: string) => request<{ ok: true }>(`/api/instances/${id}/restart`, { method: 'POST' }),
  update: (id: string) => request<{ job: Job }>(`/api/instances/${id}/update`, { method: 'POST' }),

  logs: (id: string) => request<{ lines: LogLine[] }>(`/api/instances/${id}/logs`),
  command: (id: string, command: string) =>
    request<{ response: string }>(`/api/instances/${id}/command`, {
      method: 'POST',
      body: JSON.stringify({ command }),
    }),

  players: (id: string) => request<{ players: Player[]; bans: unknown[] }>(`/api/instances/${id}/players`),
  kick: (id: string, name: string) =>
    request<{ ok: true }>(`/api/instances/${id}/players/${encodeURIComponent(name)}/kick`, { method: 'POST' }),
  ban: (id: string, name: string, reason?: string) =>
    request<{ ok: true }>(`/api/instances/${id}/players/${encodeURIComponent(name)}/ban`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason ?? 'manuell gesperrt · dauerhaft' }),
    }),
  unban: (id: string, name: string) =>
    request<{ ok: true }>(`/api/instances/${id}/bans/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  backups: (id: string) => request<{ backups: Backup[] }>(`/api/instances/${id}/backups`),
  createBackup: (id: string) => request<{ job: Job }>(`/api/instances/${id}/backups`, { method: 'POST' }),
  restoreBackup: (id: string, backupId: string) =>
    request<{ job: Job }>(`/api/instances/${id}/backups/${backupId}/restore`, { method: 'POST' }),
  deleteBackup: (id: string, backupId: string) =>
    request<{ ok: true }>(`/api/instances/${id}/backups/${backupId}`, { method: 'DELETE' }),

  mods: (id: string) => request<{ mods: Mod[] }>(`/api/instances/${id}/mods`),
  setModEnabled: (id: string, file: string, enabled: boolean) =>
    request<{ ok: true }>(`/api/instances/${id}/mods/${encodeURIComponent(file)}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),
  deleteMod: (id: string, file: string) =>
    request<{ ok: true }>(`/api/instances/${id}/mods/${encodeURIComponent(file)}`, { method: 'DELETE' }),
  uploadMod: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ ok: true }>(`/api/instances/${id}/mods`, { method: 'POST', body: form });
  },
};
