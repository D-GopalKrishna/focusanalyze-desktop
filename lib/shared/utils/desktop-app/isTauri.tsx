import { getName } from '@tauri-apps/api/app';

async function checkifDesktopTauriApp() {
  try {
    const name = await getName();
    return true;
  } catch (error) {
    return false;
  }
}

export default checkifDesktopTauriApp;
