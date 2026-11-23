import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type ProfileStatusEvent, type ZitaApi } from '@zita/shared';

const api: ZitaApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_INFO),
    exportDiagnostics: () => ipcRenderer.invoke(IPC_CHANNELS.APP_EXPORT_DIAGNOSTICS),
  },
  settings: {
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, input),
  },
  profiles: {
    overview: (filter) => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_OVERVIEW, filter),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_GET, id),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_CREATE, input),
    quickCreate: (os) => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_QUICK_CREATE, os),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_UPDATE, input),
    copy: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_COPY, input),
    softDelete: (id) => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_SOFT_DELETE, id),
    restore: (id) => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_RESTORE, id),
    permanentDelete: (id) => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_PERMANENT_DELETE, id),
    launch: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_LAUNCH, input),
    stop: (id) => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_STOP, id),
    bulkAction: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_BULK_ACTION, input),
    importCookies: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_IMPORT_COOKIES, input),
    clearCookies: (profileId) => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_CLEAR_COOKIES, profileId),
    csvPreview: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_CSV_PREVIEW, input),
    csvImport: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_CSV_IMPORT, input),
    exportData: (format) => ipcRenderer.invoke(IPC_CHANNELS.PROFILES_EXPORT, format),
  },
  org: {
    createFolder: (input) => ipcRenderer.invoke(IPC_CHANNELS.FOLDERS_CREATE, input),
    renameFolder: (input) => ipcRenderer.invoke(IPC_CHANNELS.FOLDERS_RENAME, input),
    deleteFolder: (id) => ipcRenderer.invoke(IPC_CHANNELS.FOLDERS_DELETE, id),
    createTag: (input) => ipcRenderer.invoke(IPC_CHANNELS.TAGS_CREATE, input),
    renameTag: (input) => ipcRenderer.invoke(IPC_CHANNELS.TAGS_RENAME, input),
    deleteTag: (id) => ipcRenderer.invoke(IPC_CHANNELS.TAGS_DELETE, id),
    createStatus: (input) => ipcRenderer.invoke(IPC_CHANNELS.STATUSES_CREATE, input),
    deleteStatus: (id) => ipcRenderer.invoke(IPC_CHANNELS.STATUSES_DELETE, id),
  },
  proxies: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROXIES_LIST),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROXIES_CREATE, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROXIES_UPDATE, input),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.PROXIES_DELETE, id),
    duplicate: (id) => ipcRenderer.invoke(IPC_CHANNELS.PROXIES_DUPLICATE, id),
    bulkAdd: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROXIES_BULK_ADD, input),
    test: (id) => ipcRenderer.invoke(IPC_CHANNELS.PROXIES_TEST, id),
    revealPassword: (id) => ipcRenderer.invoke(IPC_CHANNELS.PROXIES_REVEAL_PASSWORD, id),
  },
  fingerprint: {
    generate: (input) => ipcRenderer.invoke(IPC_CHANNELS.FINGERPRINT_GENERATE, input),
    hardwarePresets: () => ipcRenderer.invoke(IPC_CHANNELS.FINGERPRINT_HARDWARE_PRESETS),
  },
  lab: {
    runCheck: (input) => ipcRenderer.invoke(IPC_CHANNELS.LAB_RUN_CHECK, input),
  },
  license: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.LICENSE_GET_STATE),
    startTrial: (aupAccepted) => ipcRenderer.invoke(IPC_CHANNELS.LICENSE_START_TRIAL, aupAccepted),
    activate: (input) => ipcRenderer.invoke(IPC_CHANNELS.LICENSE_ACTIVATE, input),
    revalidate: (serverUrl) => ipcRenderer.invoke(IPC_CHANNELS.LICENSE_REVALIDATE, serverUrl),
    deactivate: (serverUrl) => ipcRenderer.invoke(IPC_CHANNELS.LICENSE_DEACTIVATE, serverUrl),
  },
  activity: {
    list: (limit) => ipcRenderer.invoke(IPC_CHANNELS.ACTIVITY_LIST, limit),
  },
  engine: {
    status: () => ipcRenderer.invoke(IPC_CHANNELS.ENGINE_STATUS),
  },
  window: {
    openExternal: (url) => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_OPEN_EXTERNAL, url),
  },
  events: {
    onProfileStatusChanged: (cb) => {
      const listener = (_event: unknown, payload: ProfileStatusEvent) => cb(payload);
      ipcRenderer.on(IPC_CHANNELS.EVENT_PROFILE_STATUS_CHANGED, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.EVENT_PROFILE_STATUS_CHANGED, listener);
      };
    },
  },
};

contextBridge.exposeInMainWorld('zita', api);
