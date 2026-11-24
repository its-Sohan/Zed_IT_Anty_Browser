import type { Platform } from '@zita/shared';

export interface HardwarePreset {
  cpuCores: number;
  memoryGb: number;
  gpuVendor: string;
  gpuRenderer: string;
}

export interface ScreenPreset {
  width: number;
  height: number;
}

export interface OsHardwareTable {
  osVersions: string[];
  resolutions: ScreenPreset[];
  hardware: HardwarePreset[];
}

export const HARDWARE_TABLES: Record<Platform, OsHardwareTable> = {
  windows: {
    osVersions: ['10', '11'],
    resolutions: [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1536, height: 864 },
      { width: 2560, height: 1440 },
    ],
    hardware: [
      {
        cpuCores: 4,
        memoryGb: 8,
        gpuVendor: 'Google Inc. (Intel)',
        gpuRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      },
      {
        cpuCores: 6,
        memoryGb: 16,
        gpuVendor: 'Google Inc. (AMD)',
        gpuRenderer: 'ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      },
      {
        cpuCores: 8,
        memoryGb: 16,
        gpuVendor: 'Google Inc. (NVIDIA)',
        gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      },
      {
        cpuCores: 12,
        memoryGb: 32,
        gpuVendor: 'Google Inc. (NVIDIA)',
        gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      },
      {
        cpuCores: 16,
        memoryGb: 32,
        gpuVendor: 'Google Inc. (AMD)',
        gpuRenderer: 'ANGLE (AMD, AMD Radeon 780M Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
      },
    ],
  },
  macos: {
    osVersions: ['14.7.0', '15.2.0'],
    resolutions: [
      { width: 1440, height: 900 },
      { width: 1512, height: 982 },
      { width: 1728, height: 1117 },
      { width: 2560, height: 1440 },
    ],
    hardware: [
      {
        cpuCores: 8,
        memoryGb: 8,
        gpuVendor: 'Google Inc. (Apple)',
        gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
      },
      {
        cpuCores: 8,
        memoryGb: 16,
        gpuVendor: 'Google Inc. (Apple)',
        gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)',
      },
      {
        cpuCores: 10,
        memoryGb: 16,
        gpuVendor: 'Google Inc. (Apple)',
        gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)',
      },
      {
        cpuCores: 12,
        memoryGb: 24,
        gpuVendor: 'Google Inc. (Apple)',
        gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)',
      },
      {
        cpuCores: 14,
        memoryGb: 32,
        gpuVendor: 'Google Inc. (Apple)',
        gpuRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified Version)',
      },
    ],
  },
  linux: {
    osVersions: ['6.8.0'],
    resolutions: [
      { width: 1920, height: 1080 },
      { width: 1600, height: 900 },
      { width: 2560, height: 1440 },
    ],
    hardware: [
      {
        cpuCores: 4,
        memoryGb: 8,
        gpuVendor: 'Google Inc. (Intel)',
        gpuRenderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)',
      },
      {
        cpuCores: 8,
        memoryGb: 16,
        gpuVendor: 'Google Inc. (AMD)',
        gpuRenderer: 'ANGLE (AMD, AMD Radeon Graphics (radeonsi, navi31, LLVM 18.1.3), OpenGL 4.6)',
      },
      {
        cpuCores: 16,
        memoryGb: 32,
        gpuVendor: 'Google Inc. (AMD)',
        gpuRenderer: 'ANGLE (AMD, AMD Radeon RX 7800 XT (radeonsi, navi32, LLVM 18.1.3), OpenGL 4.6)',
      },
    ],
  },
  android: {
    osVersions: ['13', '14', '15'],
    resolutions: [
      { width: 412, height: 915 },
      { width: 360, height: 800 },
      { width: 393, height: 873 },
      { width: 360, height: 780 },
    ],
    hardware: [
      {
        cpuCores: 8,
        memoryGb: 8,
        gpuVendor: 'Google Inc. (Qualcomm)',
        gpuRenderer: 'ANGLE (Qualcomm, Adreno (TM) 730, OpenGL ES 3.2)',
      },
      {
        cpuCores: 8,
        memoryGb: 12,
        gpuVendor: 'Google Inc. (Qualcomm)',
        gpuRenderer: 'ANGLE (Qualcomm, Adreno (TM) 740, OpenGL ES 3.2)',
      },
      {
        cpuCores: 8,
        memoryGb: 8,
        gpuVendor: 'Google Inc. (ARM)',
        gpuRenderer: 'ANGLE (ARM, Mali-G710 MC10, OpenGL ES 3.2)',
      },
    ],
  },
};
