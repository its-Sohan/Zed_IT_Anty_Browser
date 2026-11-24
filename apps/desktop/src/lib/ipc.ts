import type { IpcResponse, ZitaApi } from '@zita/shared';

declare global {
  interface Window {
    zita: ZitaApi;
  }
}

export class IpcClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly logPath?: string,
  ) {
    super(message);
  }
}

export async function unwrapIpc<T>(promise: Promise<IpcResponse<T>>): Promise<T> {
  const res = await promise;
  if (!res.ok) {
    throw new IpcClientError(res.error.code, res.error.message, res.error.logPath);
  }
  return res.data;
}

export const zitaIpc = {
  getAppInfo: () => unwrapIpc(window.zita.app.getInfo()),
  exportDiagnostics: () => unwrapIpc(window.zita.app.exportDiagnostics()),
  getSettings: () => unwrapIpc(window.zita.settings.getAll()),
  updateSettings: (input: Parameters<ZitaApi['settings']['update']>[0]) =>
    unwrapIpc(window.zita.settings.update(input)),

  getProfilesOverview: (filter?: Parameters<ZitaApi['profiles']['overview']>[0]) =>
    unwrapIpc(window.zita.profiles.overview(filter)),
  getProfile: (id: string) => unwrapIpc(window.zita.profiles.get(id)),
  createProfile: (input: Parameters<ZitaApi['profiles']['create']>[0]) =>
    unwrapIpc(window.zita.profiles.create(input)),
  quickCreateProfile: (os?: 'windows' | 'macos' | 'linux' | 'android') =>
    unwrapIpc(window.zita.profiles.quickCreate(os)),
  updateProfile: (input: Parameters<ZitaApi['profiles']['update']>[0]) =>
    unwrapIpc(window.zita.profiles.update(input)),
  copyProfile: (input: Parameters<ZitaApi['profiles']['copy']>[0]) =>
    unwrapIpc(window.zita.profiles.copy(input)),
  softDeleteProfile: (id: string) => unwrapIpc(window.zita.profiles.softDelete(id)),
  restoreProfile: (id: string) => unwrapIpc(window.zita.profiles.restore(id)),
  permanentDeleteProfile: (id: string) => unwrapIpc(window.zita.profiles.permanentDelete(id)),
  launchProfile: (input: Parameters<ZitaApi['profiles']['launch']>[0]) =>
    unwrapIpc(window.zita.profiles.launch(input)),
  stopProfile: (id: string) => unwrapIpc(window.zita.profiles.stop(id)),
  bulkProfileAction: (input: Parameters<ZitaApi['profiles']['bulkAction']>[0]) =>
    unwrapIpc(window.zita.profiles.bulkAction(input)),
  importCookies: (input: Parameters<ZitaApi['profiles']['importCookies']>[0]) =>
    unwrapIpc(window.zita.profiles.importCookies(input)),
  clearCookies: (profileId: string) => unwrapIpc(window.zita.profiles.clearCookies(profileId)),
  previewCsv: (input: Parameters<ZitaApi['profiles']['csvPreview']>[0]) =>
    unwrapIpc(window.zita.profiles.csvPreview(input)),
  importCsv: (input: Parameters<ZitaApi['profiles']['csvImport']>[0]) =>
    unwrapIpc(window.zita.profiles.csvImport(input)),
  exportProfilesData: (format: 'json' | 'csv') => unwrapIpc(window.zita.profiles.exportData(format)),

  createFolder: (input: Parameters<ZitaApi['org']['createFolder']>[0]) =>
    unwrapIpc(window.zita.org.createFolder(input)),
  deleteFolder: (id: string) => unwrapIpc(window.zita.org.deleteFolder(id)),
  createTag: (input: Parameters<ZitaApi['org']['createTag']>[0]) =>
    unwrapIpc(window.zita.org.createTag(input)),
  deleteTag: (id: string) => unwrapIpc(window.zita.org.deleteTag(id)),

  listProxies: () => unwrapIpc(window.zita.proxies.list()),
  createProxy: (input: Parameters<ZitaApi['proxies']['create']>[0]) =>
    unwrapIpc(window.zita.proxies.create(input)),
  updateProxy: (input: Parameters<ZitaApi['proxies']['update']>[0]) =>
    unwrapIpc(window.zita.proxies.update(input)),
  deleteProxy: (id: string) => unwrapIpc(window.zita.proxies.delete(id)),
  duplicateProxy: (id: string) => unwrapIpc(window.zita.proxies.duplicate(id)),
  bulkAddProxies: (input: Parameters<ZitaApi['proxies']['bulkAdd']>[0]) =>
    unwrapIpc(window.zita.proxies.bulkAdd(input)),
  testProxy: (id: string) => unwrapIpc(window.zita.proxies.test(id)),
  revealProxyPassword: (id: string) => unwrapIpc(window.zita.proxies.revealPassword(id)),

  generateFingerprint: (input: Parameters<ZitaApi['fingerprint']['generate']>[0]) =>
    unwrapIpc(window.zita.fingerprint.generate(input)),
  getHardwarePresets: () => unwrapIpc(window.zita.fingerprint.hardwarePresets()),
  runLabCheck: (input: Parameters<ZitaApi['lab']['runCheck']>[0]) =>
    unwrapIpc(window.zita.lab.runCheck(input)),

  listActivity: (limit?: number) => unwrapIpc(window.zita.activity.list(limit)),
  getEngineStatus: () => unwrapIpc(window.zita.engine.status()),
  openExternal: (url: string) => unwrapIpc(window.zita.window.openExternal(url)),

  startLinkRun: (input: Parameters<ZitaApi['linkRunner']['start']>[0]) =>
    unwrapIpc(window.zita.linkRunner.start(input)),
  stopLinkRun: (profileId: string) => unwrapIpc(window.zita.linkRunner.stop(profileId)),
  getLinkRunStatus: (profileId: string) => unwrapIpc(window.zita.linkRunner.status(profileId)),
};
