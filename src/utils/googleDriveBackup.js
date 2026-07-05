/**
 * Google Drive Backup Integration
 * Better script loading with proper initialization
 */

const GOOGLE_CLIENT_ID = '1080780384058-dtqcftnbg7rotda4suh9khnm9n1680t0.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let gapiInited = false;
let gisInited = false;
let tokenClient = null;
let initPromise = null;

/**
 * Wait for a global variable to be available
 */
function waitForGlobal(variableName, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const check = () => {
      if (window[variableName]) {
        resolve(window[variableName]);
      } else if (Date.now() - startTime >= timeout) {
        reject(new Error(`${variableName} not loaded after ${timeout}ms`));
      } else {
        setTimeout(check, 100);
      }
    };
    
    check();
  });
}

/**
 * Initialize Google APIs (called once)
 */
export async function initializeGoogleAPIs() {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      console.log('🔄 Starting Google API initialization...');

      // Load GAPI script
      if (!window.gapi) {
        console.log('📥 Loading GAPI script...');
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://apis.google.com/js/api.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Failed to load GAPI script'));
          document.head.appendChild(script);
        });
      }

      // Wait for gapi to be available
      await waitForGlobal('gapi');
      console.log('✅ GAPI script loaded');

      // Initialize GAPI client
      await new Promise((resolve) => {
        window.gapi.load('client', resolve);
      });

      await window.gapi.client.init({
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
      });

      gapiInited = true;
      console.log('✅ GAPI client initialized');

      // Load GIS script
      if (!window.google || !window.google.accounts) {
        console.log('📥 Loading GIS script...');
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://accounts.google.com/gsi/client';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Failed to load GIS script'));
          document.head.appendChild(script);
        });
      }

      // Wait for google.accounts to be available
      await waitForGlobal('google');
      console.log('✅ GIS script loaded');

      // Initialize token client
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPES,
        callback: (response) => {
          if (response.error) {
            console.error('❌ Auth error:', response.error);
          }
        },
      });

      gisInited = true;
      console.log('✅ Google Identity Services initialized');
      console.log('✅ All Google APIs ready!');

    } catch (error) {
      console.error('❌ Google API initialization failed:', error);
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Check if Google API is ready
 */
export function isGoogleApiReady() {
  return gapiInited && gisInited && tokenClient !== null;
}

/**
 * Authenticate user with Google
 */
export async function authenticateGoogle() {
  if (!isGoogleApiReady()) {
    console.log('⏳ Google API not ready, initializing...');
    await initializeGoogleAPIs();
  }

  return new Promise((resolve, reject) => {
    try {
      tokenClient.callback = (response) => {
        if (response.error) {
          console.error('❌ Authentication error:', response.error);
          reject(new Error(response.error));
        } else {
          console.log('✅ Authentication successful');
          resolve(true);
        }
      };

      const token = window.gapi.client.getToken();
      if (token === null) {
        console.log('🔐 Requesting access token...');
        tokenClient.requestAccessToken({ prompt: 'consent' });
      } else {
        console.log('✅ Already authenticated');
        resolve(true);
      }
    } catch (error) {
      console.error('❌ Authentication failed:', error);
      reject(error);
    }
  });
}

/**
 * Upload backup to Google Drive
 */
export async function uploadToGoogleDrive(backup, filename = null) {
  if (!isGoogleApiReady()) {
    await initializeGoogleAPIs();
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const shopName = backup.shopName || 'MumtazMedical';
    const finalFilename = filename || `${shopName}_Backup_${timestamp}.json`;

    const jsonString = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });

    const metadata = {
      name: finalFilename,
      mimeType: 'application/json',
      description: 'Mumtaz Medical Backup',
      appProperties: {
        backupType: 'mumtaz_medical',
        version: backup.version || '1.0.0',
        timestamp: backup.timestamp
      }
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${window.gapi.client.getToken().access_token}`
      },
      body: form
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Upload failed');
    }

    const result = await response.json();
    console.log(`✅ Backup uploaded to Google Drive: ${result.id}`);

    return {
      success: true,
      fileId: result.id,
      filename: finalFilename,
      webViewLink: result.webViewLink
    };
  } catch (error) {
    console.error('❌ Google Drive upload failed:', error);
    throw new Error(`Google Drive upload failed: ${error.message}`);
  }
}

/**
 * List backup files from Google Drive
 */
export async function listGoogleDriveBackups() {
  if (!isGoogleApiReady()) {
    await initializeGoogleAPIs();
  }

  try {
    const response = await window.gapi.client.drive.files.list({
      q: "appProperties has { key='backupType' and value='mumtaz_medical' }",
      fields: 'files(id, name, createdTime, modifiedTime, size, webViewLink)',
      orderBy: 'createdTime desc',
      pageSize: 20
    });

    const files = response.result.files || [];
    console.log(`✅ Found ${files.length} backups in Google Drive`);
    
    return files.map(file => ({
      id: file.id,
      name: file.name,
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime,
      size: file.size ? (file.size / 1024 / 1024).toFixed(2) + 'MB' : 'Unknown',
      webViewLink: file.webViewLink
    }));
  } catch (error) {
    console.error('❌ List backups failed:', error);
    throw new Error(`Failed to list backups: ${error.message}`);
  }
}

/**
 * Download backup from Google Drive
 */
export async function downloadFromGoogleDrive(fileId) {
  if (!isGoogleApiReady()) {
    await initializeGoogleAPIs();
  }

  try {
    const accessToken = window.gapi.client.getToken().access_token;
    
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Download failed');
    }

    const backup = await response.json();
    console.log(`✅ Backup downloaded from Google Drive: ${fileId}`);
    
    return backup;
  } catch (error) {
    console.error('❌ Google Drive download failed:', error);
    throw new Error(`Google Drive download failed: ${error.message}`);
  }
}

/**
 * Delete backup from Google Drive
 */
export async function deleteFromGoogleDrive(fileId) {
  if (!isGoogleApiReady()) {
    await initializeGoogleAPIs();
  }

  try {
    await window.gapi.client.drive.files.delete({
      fileId: fileId
    });

    console.log(`✅ Backup deleted from Google Drive: ${fileId}`);
  } catch (error) {
    console.error('❌ Delete failed:', error);
    throw new Error(`Failed to delete backup: ${error.message}`);
  }
}

/**
 * Sign out from Google
 */
export function signOutGoogle() {
  if (window.google?.accounts && window.gapi?.client) {
    const token = window.gapi.client.getToken();
    if (token) {
      window.google.accounts.oauth2.revoke(token.access_token);
      window.gapi.client.setToken('');
      console.log('✅ Signed out from Google');
    }
  }
}
